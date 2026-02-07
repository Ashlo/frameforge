# Recording Troubleshooting Runbook

This runbook documents how to diagnose and recover when recording or capture stops unexpectedly.

## Expected behavior

- Active recording should continue until `Stop Recording` is pressed.
- `Stop Sources` is disabled during recording.
- If screen capture drops, recording can continue and screen can be reconnected with `Replace Screen`.
- When screen capture drops, the output holds the last screen frame instead of showing a large interruption overlay.

## What status messages mean

- `recording WEBM/MP4 (auto-download mode)`: recording chunks are being held until stop, then downloaded.
- `screen lost, recording continues - click Replace Screen`: screen track ended but recorder is still running.
- `screen appears frozen - click Replace Screen`: screen track is present but frame time stopped advancing.
- `webcam lost, recording continues without webcam`: webcam video track ended.
- `stopped unexpectedly (...)`: browser or OS forced `MediaRecorder` to stop.
- `sources stopped, recording continues`: source tracks were stopped while recorder still runs.

## Most common causes of unexpected stop

- Browser tab crash or browser process restart.
- OS sleep/suspend or screen lock.
- Capture permission revoked by browser or system privacy controls.
- Display device changes (disconnecting monitors, changing display topology).
- Camera or microphone device disconnects.
- Severe resource pressure (CPU, memory, thermal throttling).

## Immediate recovery steps

1. Do not close the tab.
2. Check `Recording` status first.
3. If recording is still running and screen is missing, click `Replace Screen`.
4. If recording already stopped unexpectedly, start a new recording immediately.
5. If source permissions are broken, re-grant permissions and restart sources.

## Prevention checklist for long sessions

1. Plug into power.
2. Disable system sleep and lock during recording.
3. Keep browser and OS updated.
4. Use Chrome or Edge stable.
5. Keep recording tab active and avoid heavy parallel workloads.
6. Use stable presets (`1080p`, `30 FPS`) unless stress-tested.
7. Run a short preflight recording before production capture.

## Data location during recording

- Chunks stay in browser memory while recording.
- When you stop, browser download starts automatically to your configured Downloads location.
- If auto-download is blocked, use `Download Recording` manually.

## If issue repeats

Collect and share:

1. Browser and version.
2. OS and version.
3. Exact `Sources` and `Recording` messages.
4. Action right before failure (sleep, monitor change, permission prompt, USB disconnect, etc.).
5. Whether browser auto-download started or was blocked.
