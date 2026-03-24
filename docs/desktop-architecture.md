# Desktop Architecture (Tauri Pivot)

## Runtime split

- `web` mode (legacy): browser capture APIs + Chrome extension bridge for demo events.
- `desktop` mode (new): Tauri shell + Rust input monitor bridge (`demo_event`, `demo_monitor_status`).

Desktop mode is detected in frontend via `window.__TAURI__`.

## Frontend bridge files

- `src/demo-bridge.mjs`: web extension bridge (legacy).
- `src/desktop-demo-bridge.mjs`: Tauri bridge for desktop input monitoring.
- `src/recorder-runtime.mjs`: chooses bridge by runtime mode and keeps shared demo engine.

## Tauri backend contracts

Commands:

- `demo_set_enabled(enabled: bool)`
- `demo_set_config(config: DemoConfig)`
- `demo_get_status()`
- `demo_reset()`
- `recorder_start_sources()` (stub)
- `recorder_stop_sources()` (stub)
- `recorder_replace_screen_source()` (stub)
- `recorder_start_recording()` (stub)
- `recorder_stop_recording()` (stub)

Events:

- `demo_event`
- `demo_monitor_status`

## Current status

- Global click + typing demo events are emitted from Rust backend in desktop mode.
- Native screen/webcam/mic capture backend is scaffolded and still pending.
- Existing renderer capture path remains active in this phase.
- macOS desktop shell enables `macOSPrivateApi` and provides `src-tauri/Info.plist` usage descriptions so WebKit capture APIs can be exposed when supported by the host OS/WebKit.
