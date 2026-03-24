# Frameforge Demo Companion Extension

This Chrome extension captures click and typing telemetry from a source browser tab and forwards events to the recorder UI on `localhost:3000`.

Use this only for **web legacy mode**. Desktop mode uses native input monitoring and does not require this extension.

## Load in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this `extension/` folder.

## Use with Frameforge

1. Start Frameforge (`npm run dev`) and open `http://localhost:3000`.
2. If the extension was just loaded/enabled, refresh the Frameforge tab once so content scripts attach.
3. In Frameforge, open the `Product Demos` section and click `Connect Extension`.
4. Open the tab you want to demo.
5. Click the extension icon and press `Arm Current Tab`.
6. Start recording in Frameforge. Click/typing activity in the armed tab will drive auto-zoom.

## Notes

- Auto-zoom v1 is intended for browser tab capture.
- If the source tab is closed, the extension disarms automatically.
