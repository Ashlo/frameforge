# Frameforge Desktop (Tauri)

This folder contains the macOS-first desktop shell for Frameforge.

## What works now

- Opens Frameforge UI in a desktop window via Tauri.
- Provides desktop input-monitor bridge (`demo_event` / `demo_monitor_status`) using global mouse/key hooks.
- Keeps existing web recorder pipeline in renderer, while desktop-native capture commands are scaffolded.
- Includes macOS `Info.plist` camera/microphone usage descriptions and enables `macOSPrivateApi` for capture APIs in WKWebView.

## Run (dev)

1. Install desktop dependencies:

```bash
npm --prefix desktop install
```

2. Start desktop app:

```bash
npm --prefix desktop run dev
```

This starts the Next.js frontend (`npm run dev` in repo root) and launches Tauri app.

### macOS permissions

On first capture attempt, allow:

- Screen Recording
- Camera
- Microphone

If previously denied, re-enable for Frameforge Desktop in `System Settings > Privacy & Security`.

## Build

```bash
npm --prefix desktop run build
```

Note: `bundle.active` is currently disabled in `src-tauri/tauri.conf.json` for fast unsigned dev iteration.
