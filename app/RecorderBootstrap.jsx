"use client";

import { useEffect } from "react";

export default function RecorderBootstrap() {
  useEffect(() => {
    if (window.__frameforgeRecorderLoaded) {
      return;
    }
    window.__frameforgeRecorderLoaded = true;
    import("../src/recorder-runtime.mjs");
  }, []);

  return null;
}
