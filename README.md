# Frameforge Recorder

A desktop-first recorder for:

- Screen capture
- Webcam (face cam)
- Microphone audio

The output is a single video file with your composed scene. The web app remains as a legacy/dev path.

## Requirements

- Node.js 20+ and npm
- Rust toolchain (for desktop app)
- Chrome/Edge for web legacy mode

## Desktop Run (macOS-first)

Install root dependencies (for frontend):

```bash
npm install
```

Install desktop shell dependencies:

```bash
npm --prefix desktop install
```

Run desktop app in dev:

```bash
npm run desktop:dev
```

Desktop notes:
- Tauri shell lives in `desktop/`.
- Input monitor events come from desktop backend (no extension required in desktop mode).
- Native capture commands are scaffolded; renderer capture flow remains active in this phase.

## Web Legacy Run

Install dependencies:

```bash
npm install
```

Start development server:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

Production build:

```bash
npm run build
npm run start
```

## Tests

Run automated tests:

```bash
npm test
```

## How to use

1. Click `Start Sources`.
2. Choose the screen/window/tab you want to record.
3. Allow camera + microphone permission.
4. Adjust screen framing with `Screen Fit Mode`, `Screen Zoom`, and `Screen X/Y Position`.
5. Adjust webcam position by dragging the preview overlay.
6. Use `Camera On` to show/hide webcam video in the preview and output.
7. Use `Focus Preview` to hide the settings panel and enlarge the live preview area.
8. Click `Start Recording`.
9. Click `Stop Recording`.
10. Download starts automatically. If blocked, click `Download Recording`.
11. If screen capture drops, click `Replace Screen` to reconnect without restarting the session.
12. Check `Started At` and `Elapsed` in the status panel for live timing.

## Product demos (auto zoom v1)

### Desktop mode

1. Launch via `npm run desktop:dev`.
2. In `Product Demos`, click `Enable Input Monitor`.
3. Interact with your system/apps; global click + typing events drive zoom effects.

### Web legacy mode (extension)

1. Load the companion extension from `extension/` as an unpacked Chrome extension.
2. In Frameforge (web), open `Product Demos` and click `Connect Extension`.
3. Open the browser tab you want to demo.
4. Click the extension icon and press `Arm Current Tab`.
5. In Frameforge, choose a **browser tab** in screen capture picker for best auto-zoom results.
6. Start recording and interact with the armed tab.
7. Click and typing activity from the armed tab drives smooth zoom in/out animations in the recording.

Notes:
- If you capture a window/monitor instead of browser tab, Frameforge shows `unsupported source: use browser tab capture` and keeps recording without auto-zoom.
- `Webcam` overlay stays fixed during screen zoom effects.

## Recording behavior

- During active recording, the app is designed to stop only when you press `Stop Recording`.
- `Stop Sources` is disabled while recording so it cannot accidentally end an active recording.
- If screen capture drops, recording can continue and you can use `Replace Screen`.
- If screen capture drops, the last good screen frame is held to avoid disruptive visual jumps.
- `Camera On` can be toggled during recording. Turning it off hides webcam video only; microphone audio continues.
- A wake lock is requested during recording to reduce sleep-related interruptions.
- If recording is stopped by browser/OS, the app shows `stopped unexpectedly`.

## Output format

- `WebM` is the most reliable browser format.
- `MP4` works only if your browser supports MP4 in `MediaRecorder`.
- `MKV` is not supported by browser `MediaRecorder`.

## Download behavior

- When you press `Stop Recording`, the app automatically starts a browser download.
- The file goes to your browser's configured download location (usually `Downloads`).
- The `Download Recording` link remains visible as a fallback if auto-download is blocked.
- If you refresh or close the tab before pressing `Stop Recording` and finalization completes, the in-progress recording is lost.

## Reliability limits

- Browser tab crash, forced tab kill, or browser process crash can still end recording.
- OS sleep, screen lock, permission revocation, or display reconfiguration can interrupt capture.
- Disconnecting a webcam device can remove webcam video or mic tracks.

## Long-session recommendations (2-4 hours)

- Use Chrome/Edge with latest stable version.
- Keep laptop plugged in and disable system sleep for the session.
- Keep this tab in the foreground and avoid heavy parallel browser workloads.
- Prefer `1920x1080` at `30 FPS` for stability unless your machine can sustain more.
- Do a 5-minute test recording before a long session.

## Troubleshooting

- If capture drops, use `Replace Screen` first.
- If recording stops unexpectedly, check both status labels (`Sources` and `Recording`) and note exact messages.
- If `Sources` shows `screen appears frozen - click Replace Screen`, the screen track is live but frame time stopped advancing (capture pipeline stall).
- If permissions get stuck, reset camera/microphone/screen permissions for `localhost`.
- See the detailed runbook: `docs/recording-troubleshooting.md`.
