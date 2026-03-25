# Frameforge Demo Recorder Desktop

This folder contains the Tauri shell for the desktop-first Demo Recorder app.

## What works now

- Opens the new Vite-based Demo Recorder UI in a desktop window
- Provides the desktop input-monitor bridge (`demo_event` / `demo_monitor_status`) using global mouse and keyboard hooks
- Saves the recorded WebM output via native macOS save dialog
- Exports trimmed GIFs through FFmpeg

## Run (dev)

1. Install root dependencies:

```bash
npm install
```

2. Install desktop dependencies:

```bash
npm --prefix desktop install
```

3. Start the desktop app:

```bash
npm --prefix desktop run dev
```

This starts the Vite frontend in the repo root and launches the Tauri shell.

## macOS permissions

On first capture attempt, allow:

- Screen Recording

If previously denied, re-enable it for the app in `System Settings > Privacy & Security`.

## Build

```bash
npm --prefix desktop run build
```

`bundle.active` remains disabled in `src-tauri/tauri.conf.json` for faster unsigned development iteration.
