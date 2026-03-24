const CHANNEL_TO_EXTENSION = "frameforge:page-to-extension";
const CHANNEL_FROM_EXTENSION = "frameforge:extension-to-page";

function makeError(message) {
  return message instanceof Error ? message : new Error(String(message || "Unknown bridge error."));
}

export function createDemoBridge({ onStatus, onEvent, onError } = {}) {
  let requestSeq = 0;
  const pending = new Map();

  function clearPending(error) {
    for (const item of pending.values()) {
      window.clearTimeout(item.timerId);
      item.reject(error);
    }
    pending.clear();
  }

  function handleWindowMessage(event) {
    if (event.source !== window) {
      return;
    }

    const data = event.data;
    if (!data || data.channel !== CHANNEL_FROM_EXTENSION) {
      return;
    }

    if (typeof data.replyTo === "string") {
      const entry = pending.get(data.replyTo);
      if (!entry) {
        return;
      }

      pending.delete(data.replyTo);
      window.clearTimeout(entry.timerId);
      if (data.ok) {
        entry.resolve(data.payload || {});
      } else {
        entry.reject(makeError(data.error || "Extension request failed."));
      }
      return;
    }

    if (data.type === "DEMO_STATUS") {
      onStatus?.(data.payload || {});
      return;
    }

    if (data.type === "DEMO_EVENT") {
      onEvent?.(data.payload || {});
      return;
    }

    if (data.type === "DEMO_ERROR") {
      onError?.(data.payload || {});
    }
  }

  window.addEventListener("message", handleWindowMessage);

  function request(type, payload = {}, timeoutMs = 1400) {
    requestSeq += 1;
    const id = `ff-demo-${Date.now()}-${requestSeq}`;

    return new Promise((resolve, reject) => {
      const timerId = window.setTimeout(() => {
        pending.delete(id);
        reject(
          makeError(
            "Extension bridge not detected. Install/enable the Frameforge companion extension, then refresh this recorder tab."
          )
        );
      }, timeoutMs);

      pending.set(id, { resolve, reject, timerId });
      window.postMessage(
        {
          channel: CHANNEL_TO_EXTENSION,
          id,
          type,
          payload,
        },
        "*"
      );
    });
  }

  return {
    connect() {
      return request("DEMO_CONNECT");
    },
    getStatus() {
      return request("DEMO_GET_STATUS");
    },
    disarm() {
      return request("DEMO_DISARM");
    },
    destroy() {
      window.removeEventListener("message", handleWindowMessage);
      clearPending(makeError("Bridge disposed."));
    },
  };
}
