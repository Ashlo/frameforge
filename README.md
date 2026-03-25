# Frameforge Demo Recorder

Desktop-first demo recording for short product walkthroughs.

## V1 scope

- Screen recording only
- Smooth auto-focus driven by global click and typing activity
- Preview-first workflow
- Result preview after stop
- GIF trim controls
- Save full video
- Export clipped GIF

V1 intentionally skips microphone and webcam so the core demo workflow is stable first.

## Requirements

- Node.js 20+
- npm
- Rust toolchain
- macOS with Screen Recording permission enabled for the desktop app
- FFmpeg installed at `/opt/homebrew/bin/ffmpeg`, `/usr/local/bin/ffmpeg`, or available on `PATH` for GIF export

## Run

Install frontend dependencies:

```bash
npm install
```

Install desktop shell dependencies:

```bash
npm --prefix desktop install
```

Run the desktop app in dev:

```bash
npm run desktop:dev
```

## Build

Build the frontend bundle:

```bash
npm run build
```

Build the Tauri desktop app:

```bash
npm run desktop:build
```

## Tests

Run the helper-unit tests:

```bash
npm test
```

## Workflow

1. Open Demo Recorder.
2. Click `Start Source Capture`.
3. Choose the screen or window you want to turn into a short clip.
4. Click `Start Recording`.
5. Interact with the product. Auto focus can respond to clicks and typing.
6. Click `Stop`.
7. Review the result in the preview panel.
8. Adjust `Trim start` and `Trim end` for the GIF segment.
9. Click `Save Video` and/or `Export GIF`.

## Notes

- The recorder keeps the finished result in memory until you start a new recording.
- Canceling video save or GIF export does not destroy the recording.
- If GIF export fails, the recording stays available and any previously saved video remains intact.
- Recordings with no auto-focus events still export normally.
