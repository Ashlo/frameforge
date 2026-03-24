#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::thread;
use std::time::{Duration, Instant};

use rdev::{listen, Button, Event, EventType, Key};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

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

struct AppState {
    demo_enabled: AtomicBool,
    monitor_connected: AtomicBool,
    monitor_started: AtomicBool,
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

fn key_is_typing_like(key: Key) -> bool {
    matches!(
        key,
        Key::KeyA
            | Key::KeyB
            | Key::KeyC
            | Key::KeyD
            | Key::KeyE
            | Key::KeyF
            | Key::KeyG
            | Key::KeyH
            | Key::KeyI
            | Key::KeyJ
            | Key::KeyK
            | Key::KeyL
            | Key::KeyM
            | Key::KeyN
            | Key::KeyO
            | Key::KeyP
            | Key::KeyQ
            | Key::KeyR
            | Key::KeyS
            | Key::KeyT
            | Key::KeyU
            | Key::KeyV
            | Key::KeyW
            | Key::KeyX
            | Key::KeyY
            | Key::KeyZ
            | Key::Num0
            | Key::Num1
            | Key::Num2
            | Key::Num3
            | Key::Num4
            | Key::Num5
            | Key::Num6
            | Key::Num7
            | Key::Num8
            | Key::Num9
            | Key::Space
            | Key::Tab
            | Key::Return
            | Key::Backspace
            | Key::Delete
    )
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

fn start_global_monitor(app: AppHandle, state: Arc<AppState>) {
    if state.monitor_started.swap(true, Ordering::Relaxed) {
        emit_status(&app, state.as_ref());
        return;
    }

    state.monitor_connected.store(true, Ordering::Relaxed);
    emit_status(&app, state.as_ref());

    thread::spawn(move || {
        let app_for_events = app.clone();
        let state_for_events = state.clone();
        let callback = move |event: Event| match event.event_type {
            EventType::MouseMove { x, y } => {
                if let Ok(mut guard) = state_for_events.last_mouse_pos.lock() {
                    *guard = (x, y);
                }
            }
            EventType::ButtonPress(button) => {
                if !state_for_events.demo_enabled.load(Ordering::Relaxed) {
                    return;
                }

                if !matches!(button, Button::Left | Button::Right | Button::Middle) {
                    return;
                }
                let (x_norm, y_norm) = state_for_events.normalized_mouse_position();
                emit_demo_event(
                    &app_for_events,
                    DemoEventPayload {
                        kind: "click".to_string(),
                        t: now_ms(),
                        x_norm,
                        y_norm,
                        intensity: 0.0,
                    },
                );
            }
            EventType::KeyPress(key) => {
                if !state_for_events.demo_enabled.load(Ordering::Relaxed) {
                    return;
                }
                if !key_is_typing_like(key) {
                    return;
                }
                if !should_emit_type(state_for_events.as_ref()) {
                    return;
                }
                let (x_norm, y_norm) = state_for_events.normalized_mouse_position();
                emit_demo_event(
                    &app_for_events,
                    DemoEventPayload {
                        kind: "type".to_string(),
                        t: now_ms(),
                        x_norm,
                        y_norm,
                        intensity: 0.6,
                    },
                );
            }
            _ => {}
        };

        if let Err(error) = listen(callback) {
            if let Ok(mut guard) = state.last_error.lock() {
                *guard = Some(format!("{error:?}"));
            }
            state.monitor_connected.store(false, Ordering::Relaxed);
            emit_status(&app, state.as_ref());
        }
    });
}

#[tauri::command]
fn demo_set_enabled(
    enabled: bool,
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<DemoMonitorStatus, String> {
    state.demo_enabled.store(enabled, Ordering::Relaxed);
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
fn demo_reset(state: State<'_, Arc<AppState>>) -> Result<DemoMonitorStatus, String> {
    if let Ok(mut guard) = state.last_error.lock() {
        *guard = None;
    }
    Ok(state.status())
}

#[tauri::command]
fn recorder_start_sources() -> Result<(), String> {
    Err(
        "Desktop native capture pipeline is not wired yet. Use renderer capture path for now."
            .to_string(),
    )
}

#[tauri::command]
fn recorder_stop_sources() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn recorder_replace_screen_source() -> Result<(), String> {
    Err("Replace screen source via native backend is pending.".to_string())
}

#[tauri::command]
fn recorder_start_recording() -> Result<(), String> {
    Err(
        "Desktop native recording pipeline is not wired yet. Use renderer recording path for now."
            .to_string(),
    )
}

#[tauri::command]
fn recorder_stop_recording() -> Result<(), String> {
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(Arc::new(AppState {
            last_typing_emit: Mutex::new(Instant::now()),
            ..Default::default()
        }))
        .invoke_handler(tauri::generate_handler![
            demo_set_enabled,
            demo_set_config,
            demo_get_status,
            demo_reset,
            recorder_start_sources,
            recorder_stop_sources,
            recorder_replace_screen_source,
            recorder_start_recording,
            recorder_stop_recording
        ])
        .run(tauri::generate_context!())
        .expect("error while running frameforge desktop");
}
