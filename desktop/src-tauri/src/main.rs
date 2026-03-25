#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
#[cfg(target_os = "macos")]
use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
#[cfg(target_os = "macos")]
use core_foundation_sys::base::{kCFAllocatorDefault, CFRelease, CFTypeRef};
#[cfg(target_os = "macos")]
use core_foundation_sys::dictionary::{
    kCFTypeDictionaryKeyCallBacks, kCFTypeDictionaryValueCallBacks, CFDictionaryCreate, CFDictionaryRef,
};
#[cfg(target_os = "macos")]
use core_foundation_sys::number::{kCFBooleanFalse, kCFBooleanTrue};
#[cfg(target_os = "macos")]
use core_foundation_sys::string::CFStringRef;
#[cfg(target_os = "macos")]
use core_graphics::event::{
    CGEvent, CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventTapProxy,
    CGEventType, EventField,
};
use std::fs;
#[cfg(target_os = "macos")]
use std::ffi::c_void;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrustedWithOptions(the_dict: CFDictionaryRef) -> bool;
    static kAXTrustedCheckOptionPrompt: CFStringRef;
}

#[cfg(target_os = "macos")]
#[link(name = "IOKit", kind = "framework")]
unsafe extern "C" {
    fn IOHIDCheckAccess(request_type: i32) -> i32;
    fn IOHIDRequestAccess(request_type: i32) -> bool;
}

#[cfg(target_os = "macos")]
const K_IO_HID_REQUEST_TYPE_LISTEN_EVENT: i32 = 1;
#[cfg(target_os = "macos")]
const K_IO_HID_ACCESS_TYPE_GRANTED: i32 = 0;

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct DemoConfig {
    zoom_strength: Option<f64>,
    zoom_duration_ms: Option<u32>,
    cooldown_ms: Option<u32>,
    typing_hold_ms: Option<u32>,
    click_enabled: Option<bool>,
    type_enabled: Option<bool>,
    screen_width: Option<f64>,
    screen_height: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DemoMonitorStatus {
    connected: bool,
    armed: bool,
    monitor_started: bool,
    accessibility_granted: bool,
    input_monitoring_granted: bool,
    native_event_count: u64,
    source_tab_id: Option<u32>,
    source_tab_title: String,
    last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DemoEventPayload {
    kind: String,
    t: u64,
    x_norm: f64,
    y_norm: f64,
    intensity: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DemoVideoSaveRequest {
    video_bytes_base64: String,
    video_extension: String,
    suggested_base_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DemoVideoSaveResult {
    canceled: bool,
    video_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DemoGifExportRequest {
    video_bytes_base64: String,
    video_extension: String,
    suggested_base_name: String,
    gif_start_ms: u64,
    gif_end_ms: u64,
    gif_width: u32,
    gif_fps: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DemoGifExportResult {
    canceled: bool,
    gif_path: Option<String>,
}

struct AppState {
    demo_enabled: AtomicBool,
    monitor_connected: AtomicBool,
    monitor_started: AtomicBool,
    native_event_count: AtomicU64,
    last_error: Mutex<Option<String>>,
    demo_config: Mutex<DemoConfig>,
    last_mouse_pos: Mutex<(f64, f64)>,
    last_typing_emit: Mutex<Instant>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            demo_enabled: AtomicBool::new(false),
            monitor_connected: AtomicBool::new(false),
            monitor_started: AtomicBool::new(false),
            native_event_count: AtomicU64::new(0),
            last_error: Mutex::new(None),
            demo_config: Mutex::new(DemoConfig::default()),
            last_mouse_pos: Mutex::new((0.0, 0.0)),
            last_typing_emit: Mutex::new(Instant::now()),
        }
    }
}

impl AppState {
    fn status(&self) -> DemoMonitorStatus {
        let last_error = self.last_error.lock().ok().and_then(|guard| guard.clone());
        DemoMonitorStatus {
            connected: self.monitor_connected.load(Ordering::Relaxed),
            armed: self.demo_enabled.load(Ordering::Relaxed),
            monitor_started: self.monitor_started.load(Ordering::Relaxed),
            accessibility_granted: request_accessibility_permission(false),
            input_monitoring_granted: request_input_monitoring_access(false),
            native_event_count: self.native_event_count.load(Ordering::Relaxed),
            source_tab_id: None,
            source_tab_title: "Desktop input monitor".to_string(),
            last_error,
        }
    }

    fn normalized_mouse_position(&self) -> (f64, f64) {
        let (x, y) = self
            .last_mouse_pos
            .lock()
            .map(|guard| *guard)
            .unwrap_or((0.0, 0.0));
        let cfg = self
            .demo_config
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_default();

        let width = cfg.screen_width.unwrap_or(1920.0).max(1.0);
        let height = cfg.screen_height.unwrap_or(1080.0).max(1.0);
        ((x / width).clamp(0.0, 1.0), (y / height).clamp(0.0, 1.0))
    }
}

fn emit_status(app: &AppHandle, state: &AppState) {
    let _ = app.emit_all("demo_monitor_status", state.status());
}

fn emit_demo_event(app: &AppHandle, payload: DemoEventPayload) {
    let _ = app.emit_all("demo_event", payload);
}

fn now_ms() -> u64 {
    let now = std::time::SystemTime::now();
    now.duration_since(std::time::UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_millis() as u64
}

fn sanitize_base_name(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return "demo-recorder".to_string();
    }

    let mut output = String::new();
    let mut last_was_dash = false;
    for ch in trimmed.chars() {
        let normalized = if ch.is_ascii_alphanumeric() || ch == '_' {
            last_was_dash = false;
            Some(ch)
        } else if ch == '-' || ch.is_ascii_whitespace() {
            if last_was_dash {
                None
            } else {
                last_was_dash = true;
                Some('-')
            }
        } else {
            None
        };

        if let Some(ch) = normalized {
            output.push(ch);
        }
    }

    let output = output.trim_matches('-').to_string();
    if output.is_empty() {
        "demo-recorder".to_string()
    } else {
        output
    }
}

fn sanitize_extension(value: &str) -> &'static str {
    match value.to_ascii_lowercase().as_str() {
        "mkv" => "mkv",
        "webm" => "webm",
        _ => "webm",
    }
}

fn escape_applescript(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn select_save_path(title: &str, file_name: &str, extension: &str) -> Result<Option<PathBuf>, String> {
    let script = format!(
        "POSIX path of (choose file name with prompt \"{}\" default name \"{}\")",
        escape_applescript(title),
        escape_applescript(file_name)
    );

    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|error| format!("Could not open macOS save dialog: {error}"))?;

    if output.status.success() {
        let raw_path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if raw_path.is_empty() {
            return Ok(None);
        }

        let mut path = PathBuf::from(raw_path);
        if path.extension().is_none() {
            path.set_extension(extension);
        }
        return Ok(Some(path));
    }

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if stderr.contains("User canceled") || stderr.contains("user canceled") {
        return Ok(None);
    }

    Err(format!("Could not open save dialog: {}", stderr.trim()))
}

fn resolve_ffmpeg_path() -> PathBuf {
    let mut candidates = Vec::new();
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join("ffmpeg"));
            candidates.push(exe_dir.join("../Resources/bin/ffmpeg"));
            candidates.push(exe_dir.join("../Resources/ffmpeg"));
        }
    }

    candidates.push(PathBuf::from("/opt/homebrew/bin/ffmpeg"));
    candidates.push(PathBuf::from("/usr/local/bin/ffmpeg"));

    for candidate in candidates {
        if candidate.exists() {
            return candidate;
        }
    }

    PathBuf::from("ffmpeg")
}

fn build_gif_filter(width: u32, fps: u32) -> String {
    format!(
        "fps={fps},scale={width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a"
    )
}

fn format_ffmpeg_error(stderr: &[u8]) -> String {
    let message = String::from_utf8_lossy(stderr).trim().to_string();
    if message.is_empty() {
        "FFmpeg failed to generate the GIF.".to_string()
    } else {
        message
    }
}

fn input_access_required_message() -> String {
    "Desktop input access is required for auto focus. Grant Input Monitoring and Accessibility permission to Frameforge Demo Recorder, then restart the app.".to_string()
}

#[cfg(target_os = "macos")]
fn request_accessibility_permission(prompt: bool) -> bool {
    unsafe {
        let key = kAXTrustedCheckOptionPrompt as *const c_void;
        let value = if prompt {
            kCFBooleanTrue as *const c_void
        } else {
            kCFBooleanFalse as *const c_void
        };
        let keys = [key];
        let values = [value];
        let dictionary = CFDictionaryCreate(
            kCFAllocatorDefault,
            keys.as_ptr(),
            values.as_ptr(),
            1,
            &kCFTypeDictionaryKeyCallBacks,
            &kCFTypeDictionaryValueCallBacks,
        );

        let trusted = AXIsProcessTrustedWithOptions(dictionary);
        if !dictionary.is_null() {
            CFRelease(dictionary as CFTypeRef);
        }
        trusted
    }
}

#[cfg(not(target_os = "macos"))]
fn request_accessibility_permission(_prompt: bool) -> bool {
    true
}

#[cfg(target_os = "macos")]
fn has_input_monitoring_access() -> bool {
    unsafe { IOHIDCheckAccess(K_IO_HID_REQUEST_TYPE_LISTEN_EVENT) == K_IO_HID_ACCESS_TYPE_GRANTED }
}

#[cfg(not(target_os = "macos"))]
fn has_input_monitoring_access() -> bool {
    true
}

#[cfg(target_os = "macos")]
fn request_input_monitoring_access(prompt: bool) -> bool {
    if !prompt {
        return has_input_monitoring_access();
    }

    unsafe { IOHIDRequestAccess(K_IO_HID_REQUEST_TYPE_LISTEN_EVENT) }
}

#[cfg(not(target_os = "macos"))]
fn request_input_monitoring_access(_prompt: bool) -> bool {
    true
}

fn decode_video_bytes(encoded: &str) -> Result<Vec<u8>, String> {
    BASE64_STANDARD
        .decode(encoded.as_bytes())
        .map_err(|error| format!("Could not decode recorded video bytes: {error}"))
}

fn ensure_parent_dir(path: &PathBuf, label: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("Could not create {label} folder: {error}"))?;
    }
    Ok(())
}

fn write_temp_video_file(bytes: &[u8], extension: &str) -> Result<PathBuf, String> {
    let directory = std::env::temp_dir().join("frameforge-demo-recorder");
    fs::create_dir_all(&directory).map_err(|error| format!("Could not create temp folder: {error}"))?;

    let temp_path = directory.join(format!("gif-source-{}.{}", now_ms(), extension));
    fs::write(&temp_path, bytes).map_err(|error| format!("Could not write temporary video: {error}"))?;
    Ok(temp_path)
}

#[cfg(target_os = "macos")]
fn keycode_is_typing_like(keycode: i64) -> bool {
    matches!(
        keycode,
        0x00
            | 0x01
            | 0x02
            | 0x03
            | 0x04
            | 0x05
            | 0x06
            | 0x07
            | 0x08
            | 0x09
            | 0x0B
            | 0x0C
            | 0x0D
            | 0x0E
            | 0x0F
            | 0x10
            | 0x11
            | 0x12
            | 0x13
            | 0x14
            | 0x15
            | 0x16
            | 0x17
            | 0x18
            | 0x19
            | 0x1A
            | 0x1B
            | 0x1C
            | 0x1D
            | 0x1E
            | 0x1F
            | 0x20
            | 0x21
            | 0x22
            | 0x23
            | 0x24
            | 0x25
            | 0x26
            | 0x27
            | 0x28
            | 0x29
            | 0x2A
            | 0x2B
            | 0x2C
            | 0x2D
            | 0x2E
            | 0x2F
            | 0x30
            | 0x31
            | 0x32
            | 0x33
            | 0x41
            | 0x43
            | 0x45
            | 0x47
            | 0x4B
            | 0x4C
            | 0x4E
            | 0x51
            | 0x52
            | 0x53
            | 0x54
            | 0x55
            | 0x56
            | 0x57
            | 0x58
            | 0x59
            | 0x5B
            | 0x5C
    )
}

fn set_last_error(state: &AppState, message: Option<String>) {
    if let Ok(mut guard) = state.last_error.lock() {
        *guard = message;
    }
}

fn update_last_mouse_position(state: &AppState, x: f64, y: f64) {
    if let Ok(mut guard) = state.last_mouse_pos.lock() {
        *guard = (x, y);
    }
}

fn note_native_event(state: &AppState) {
    state.native_event_count.fetch_add(1, Ordering::Relaxed);
}

fn should_emit_type(state: &AppState) -> bool {
    let cooldown_ms = state
        .demo_config
        .lock()
        .ok()
        .and_then(|cfg| cfg.cooldown_ms)
        .unwrap_or(220) as u128;
    let now = Instant::now();
    let mut guard = match state.last_typing_emit.lock() {
        Ok(guard) => guard,
        Err(_) => return true,
    };

    let elapsed = now.duration_since(*guard).as_millis();
    if elapsed < cooldown_ms {
        return false;
    }

    *guard = now;
    true
}

#[cfg(target_os = "macos")]
fn start_global_monitor(app: AppHandle, state: Arc<AppState>) {
    if state.monitor_started.swap(true, Ordering::Relaxed) {
        emit_status(&app, state.as_ref());
        return;
    }

    thread::spawn(move || {
        let app_for_events = app.clone();
        let state_for_events = state.clone();
        let current_loop = CFRunLoop::get_current();

        let callback = move |_proxy: CGEventTapProxy, event_type: CGEventType, event: &CGEvent| {
            match event_type {
                CGEventType::MouseMoved
                | CGEventType::LeftMouseDragged
                | CGEventType::RightMouseDragged
                | CGEventType::OtherMouseDragged => {
                    let point = event.location();
                    update_last_mouse_position(state_for_events.as_ref(), point.x, point.y);
                }
                CGEventType::LeftMouseDown | CGEventType::RightMouseDown | CGEventType::OtherMouseDown => {
                    let point = event.location();
                    update_last_mouse_position(state_for_events.as_ref(), point.x, point.y);

                    if !state_for_events.demo_enabled.load(Ordering::Relaxed) {
                        return None;
                    }

                    let button_number =
                        event.get_integer_value_field(EventField::MOUSE_EVENT_BUTTON_NUMBER);
                    if !matches!(button_number, 0 | 1 | 2) {
                        return None;
                    }

                    note_native_event(state_for_events.as_ref());
                    let (x_norm, y_norm) = state_for_events.normalized_mouse_position();
                    emit_demo_event(
                        &app_for_events,
                        DemoEventPayload {
                            kind: "click".to_string(),
                            t: now_ms(),
                            x_norm,
                            y_norm,
                            intensity: 0.58,
                        },
                    );
                }
                CGEventType::KeyDown => {
                    if !state_for_events.demo_enabled.load(Ordering::Relaxed) {
                        return None;
                    }

                    let keycode = event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE);
                    if !keycode_is_typing_like(keycode) || !should_emit_type(state_for_events.as_ref()) {
                        return None;
                    }

                    note_native_event(state_for_events.as_ref());
                    let (x_norm, y_norm) = state_for_events.normalized_mouse_position();
                    emit_demo_event(
                        &app_for_events,
                        DemoEventPayload {
                            kind: "type".to_string(),
                            t: now_ms(),
                            x_norm,
                            y_norm,
                            intensity: 0.74,
                        },
                    );
                }
                CGEventType::TapDisabledByTimeout | CGEventType::TapDisabledByUserInput => {
                    set_last_error(
                        state_for_events.as_ref(),
                        Some(
                            "Desktop input monitor was paused by macOS. Reopen the app or toggle auto focus to re-arm it."
                                .to_string(),
                        ),
                    );
                    state_for_events.monitor_connected.store(false, Ordering::Relaxed);
                    emit_status(&app_for_events, state_for_events.as_ref());
                }
                _ => {}
            }

            None
        };

        let tap = match CGEventTap::new(
            CGEventTapLocation::Session,
            CGEventTapPlacement::HeadInsertEventTap,
            CGEventTapOptions::ListenOnly,
            vec![
                CGEventType::MouseMoved,
                CGEventType::LeftMouseDragged,
                CGEventType::RightMouseDragged,
                CGEventType::OtherMouseDragged,
                CGEventType::LeftMouseDown,
                CGEventType::RightMouseDown,
                CGEventType::OtherMouseDown,
                CGEventType::KeyDown,
                CGEventType::TapDisabledByTimeout,
                CGEventType::TapDisabledByUserInput,
            ],
            callback,
        ) {
            Ok(tap) => tap,
            Err(()) => {
                state.monitor_started.store(false, Ordering::Relaxed);
                state.monitor_connected.store(false, Ordering::Relaxed);
                set_last_error(
                    state.as_ref(),
                    Some(
                        "Desktop input monitor could not start. Grant Input Monitoring and Accessibility permission, then reopen the app."
                            .to_string(),
                    ),
                );
                emit_status(&app, state.as_ref());
                return;
            }
        };

        let loop_source = match tap.mach_port.create_runloop_source(0) {
            Ok(loop_source) => loop_source,
            Err(()) => {
                state.monitor_started.store(false, Ordering::Relaxed);
                state.monitor_connected.store(false, Ordering::Relaxed);
                set_last_error(
                    state.as_ref(),
                    Some("Desktop input monitor could not create its run loop source.".to_string()),
                );
                emit_status(&app, state.as_ref());
                return;
            }
        };

        unsafe {
            current_loop.add_source(&loop_source, kCFRunLoopCommonModes);
        }
        tap.enable();
        state.monitor_connected.store(true, Ordering::Relaxed);
        set_last_error(state.as_ref(), None);
        emit_status(&app, state.as_ref());
        CFRunLoop::run_current();

        state.monitor_connected.store(false, Ordering::Relaxed);
        state.monitor_started.store(false, Ordering::Relaxed);
        emit_status(&app, state.as_ref());
    });
}

#[cfg(not(target_os = "macos"))]
fn start_global_monitor(app: AppHandle, state: Arc<AppState>) {
    if state.monitor_started.swap(true, Ordering::Relaxed) {
        emit_status(&app, state.as_ref());
        return;
    }

    state.monitor_connected.store(false, Ordering::Relaxed);
    state.monitor_started.store(false, Ordering::Relaxed);
    set_last_error(
        state.as_ref(),
        Some("Desktop input auto focus is only implemented on macOS in this build.".to_string()),
    );
    emit_status(&app, state.as_ref());
}

#[tauri::command]
fn demo_open_accessibility_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent")
            .status()
            .map_err(|error| format!("Could not open Input Monitoring settings: {error}"))?;
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Accessibility settings shortcut is only available on macOS.".to_string())
    }
}

#[tauri::command]
fn demo_set_enabled(
    enabled: bool,
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<DemoMonitorStatus, String> {
    if enabled && (!request_accessibility_permission(false) || !request_input_monitoring_access(false)) {
        state.demo_enabled.store(false, Ordering::Relaxed);
        state.monitor_connected.store(false, Ordering::Relaxed);
        set_last_error(state.inner().as_ref(), Some(input_access_required_message()));
        let status = state.status();
        let _ = app.emit_all("demo_monitor_status", status.clone());
        return Ok(status);
    }

    state.demo_enabled.store(enabled, Ordering::Relaxed);
    if !enabled {
        state.monitor_connected.store(false, Ordering::Relaxed);
        set_last_error(state.inner().as_ref(), None);
        let status = state.status();
        let _ = app.emit_all("demo_monitor_status", status.clone());
        return Ok(status);
    }
    set_last_error(state.inner().as_ref(), None);
    start_global_monitor(app.clone(), state.inner().clone());
    let status = state.status();
    let _ = app.emit_all("demo_monitor_status", status.clone());
    Ok(status)
}

#[tauri::command]
fn demo_set_config(
    config: DemoConfig,
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<DemoMonitorStatus, String> {
    if let Ok(mut guard) = state.demo_config.lock() {
        *guard = config;
    }
    let status = state.status();
    let _ = app.emit_all("demo_monitor_status", status.clone());
    Ok(status)
}

#[tauri::command]
fn demo_get_status(state: State<'_, Arc<AppState>>) -> Result<DemoMonitorStatus, String> {
    Ok(state.status())
}

#[tauri::command]
fn demo_save_video(request: DemoVideoSaveRequest) -> Result<DemoVideoSaveResult, String> {
    let base_name = sanitize_base_name(&request.suggested_base_name);
    let video_extension = sanitize_extension(&request.video_extension);
    let video_file_name = format!("{base_name}.{video_extension}");

    let Some(video_path) =
        select_save_path("Save Demo Recorder Video", &video_file_name, video_extension)?
    else {
        return Ok(DemoVideoSaveResult {
            canceled: true,
            video_path: None,
        });
    };

    let bytes = decode_video_bytes(&request.video_bytes_base64)?;
    ensure_parent_dir(&video_path, "video")?;
    fs::write(&video_path, bytes).map_err(|error| format!("Could not save the demo video: {error}"))?;

    Ok(DemoVideoSaveResult {
        canceled: false,
        video_path: Some(video_path.to_string_lossy().to_string()),
    })
}

#[tauri::command]
fn demo_export_gif(request: DemoGifExportRequest) -> Result<DemoGifExportResult, String> {
    let clip_duration_ms = request.gif_end_ms.saturating_sub(request.gif_start_ms);
    if clip_duration_ms == 0 {
        return Err("Trim end must be after trim start.".to_string());
    }

    let base_name = sanitize_base_name(&request.suggested_base_name);
    let gif_file_name = format!("{base_name}.gif");
    let video_extension = sanitize_extension(&request.video_extension);

    let Some(gif_path) = select_save_path("Export Demo Recorder GIF", &gif_file_name, "gif")? else {
        return Ok(DemoGifExportResult {
            canceled: true,
            gif_path: None,
        });
    };

    ensure_parent_dir(&gif_path, "GIF")?;

    let bytes = decode_video_bytes(&request.video_bytes_base64)?;
    let temp_video_path = write_temp_video_file(&bytes, video_extension)?;

    let ffmpeg_path = resolve_ffmpeg_path();
    let start_seconds = format!("{:.3}", request.gif_start_ms as f64 / 1000.0);
    let duration_seconds = format!("{:.3}", clip_duration_ms as f64 / 1000.0);
    let gif_filter = build_gif_filter(request.gif_width.max(320), request.gif_fps.max(6));

    let output = Command::new(&ffmpeg_path)
        .arg("-y")
        .arg("-ss")
        .arg(start_seconds)
        .arg("-t")
        .arg(duration_seconds)
        .arg("-i")
        .arg(&temp_video_path)
        .arg("-vf")
        .arg(gif_filter)
        .arg("-loop")
        .arg("0")
        .arg(&gif_path)
        .output();

    let _ = fs::remove_file(&temp_video_path);

    let output = output
        .map_err(|error| format!("Could not start FFmpeg at '{}': {error}", ffmpeg_path.display()))?;

    if !output.status.success() {
        return Err(format_ffmpeg_error(&output.stderr));
    }

    Ok(DemoGifExportResult {
        canceled: false,
        gif_path: Some(gif_path.to_string_lossy().to_string()),
    })
}

fn main() {
    tauri::Builder::default()
        .manage(Arc::new(AppState {
            last_typing_emit: Mutex::new(Instant::now()),
            ..Default::default()
        }))
        .setup(|app| {
            let state: State<'_, Arc<AppState>> = app.state();
            let accessibility_granted = request_accessibility_permission(true);
            let input_granted = request_input_monitoring_access(true);
            if !accessibility_granted || !input_granted {
                if let Ok(mut guard) = state.last_error.lock() {
                    *guard = Some(
                        "macOS should show Input Monitoring and Accessibility prompts for auto focus. After allowing them, restart the app."
                            .to_string(),
                    );
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            demo_set_enabled,
            demo_set_config,
            demo_get_status,
            demo_save_video,
            demo_export_gif,
            demo_open_accessibility_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running demo recorder");
}
