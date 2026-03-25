"use client";

import { useEffect } from "react";

export default function DemoMakerBootstrap() {
  useEffect(() => {
    if (window.__frameforgeDemoMakerLoaded) {
      return;
    }
    window.__frameforgeDemoMakerLoaded = true;
    import("../src/demo-maker-runtime.mjs");
  }, []);

  return null;
}
