# Frameforge Recorder MVP

A simple local web app to record:

- Screen capture
- Webcam (face cam)
- Microphone audio

The output is a single video file with your composed scene.

## Requirements

- Node.js 20+ and npm
- Chrome or Edge (recommended)
- Run from `localhost` (screen/webcam APIs require secure context)

## Run

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
node --test tests/recorder-utils.test.mjs
```

## How to use

1. Click `Start Sources`.
2. Choose the screen/window/tab you want to record.
3. Allow camera + microphone permission.
4. Adjust screen framing with `Screen Fit Mode`, `Screen Zoom`, and `Screen X/Y Position`.
5. Adjust webcam position by dragging the preview overlay.
6. Choose `Recording Format` (`Auto`, `MP4`, `WebM`).
7. Use `Focus Preview` to hide the settings panel and enlarge the live preview area.
8. Click `Start Recording`.
9. Click `Stop Recording`.
10. Download starts automatically. If blocked, click `Download Recording`.
11. If screen capture drops, click `Replace Screen` to reconnect without restarting the session.
12. Check `Started At` and `Elapsed` in the status panel for live timing.

## Recording behavior

- During active recording, the app is designed to stop only when you press `Stop Recording`.
- `Stop Sources` is disabled while recording so it cannot accidentally end an active recording.
- If screen capture drops, recording can continue and you can use `Replace Screen`.
- If screen capture drops, the last good screen frame is held to avoid disruptive visual jumps.
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
