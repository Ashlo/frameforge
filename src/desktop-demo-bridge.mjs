function getTauriApi() {
  const tauri = window.__TAURI__;
  if (!tauri?.invoke || !tauri?.event?.listen) {
    throw new Error("Desktop bridge unavailable. Start Demo Recorder inside the Tauri desktop app.");
  }
  return tauri;
}

export function isDesktopRuntime() {
  return Boolean(window.__TAURI__?.invoke && window.__TAURI__?.event?.listen);
}

export function createDesktopDemoBridge({ onStatus, onEvent, onError } = {}) {
  const tauri = getTauriApi();
  const unlistenFns = [];

  const pushError = (error) => {
    onError?.({
      message: error instanceof Error ? error.message : String(error || "desktop bridge error"),
    });
  };

  const listenStatusPromise = tauri.event.listen("demo_monitor_status", (event) => {
    onStatus?.(event.payload || {});
  });

  const listenDemoPromise = tauri.event.listen("demo_event", (event) => {
    onEvent?.(event.payload || {});
  });

  Promise.all([listenStatusPromise, listenDemoPromise])
    .then((fns) => {
      for (const fn of fns) {
        if (typeof fn === "function") {
          unlistenFns.push(fn);
        }
      }
    })
    .catch(pushError);

  async function connect() {
    return tauri.invoke("demo_set_enabled", { enabled: true });
  }

  async function getStatus() {
    return tauri.invoke("demo_get_status");
  }

  async function setConfig(config) {
    return tauri.invoke("demo_set_config", { config });
  }

  async function disarm() {
    return tauri.invoke("demo_set_enabled", { enabled: false });
  }

  function destroy() {
    while (unlistenFns.length > 0) {
      const fn = unlistenFns.pop();
      try {
        fn?.();
      } catch {
        // ignore teardown issues
      }
    }
  }

  return {
    connect,
    getStatus,
    setConfig,
    disarm,
    destroy,
  };
}

export async function saveDemoVideo(request) {
  return getTauriApi().invoke("demo_save_video", { request });
}

export async function exportDemoGif(request) {
  return getTauriApi().invoke("demo_export_gif", { request });
}

export async function openAccessibilitySettings() {
  return getTauriApi().invoke("demo_open_accessibility_settings");
}
