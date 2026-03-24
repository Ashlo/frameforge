let sourceArmed = false;
let typingBurstCount = 0;
let typingBurstTimerId = 0;
let typingFocus = { xNorm: 0.5, yNorm: 0.5 };

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getViewportSize() {
  return {
    width: Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1),
    height: Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1),
  };
}

function sendSourceEvent(payload) {
  if (!sourceArmed) {
    return;
  }

  chrome.runtime.sendMessage(
    {
      origin: "frameforge",
      type: "FF_SOURCE_EVENT",
      payload,
    },
    () => {
      void chrome.runtime.lastError;
    }
  );
}

function updateTypingFocusFromElement(element) {
  if (!element || typeof element.getBoundingClientRect !== "function") {
    typingFocus = { xNorm: 0.5, yNorm: 0.5 };
    return;
  }

  const rect = element.getBoundingClientRect();
  const { width, height } = getViewportSize();
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    typingFocus = { xNorm: 0.5, yNorm: 0.5 };
    return;
  }

  typingFocus = {
    xNorm: clampNumber((rect.left + rect.width / 2) / width, 0, 1),
    yNorm: clampNumber((rect.top + rect.height / 2) / height, 0, 1),
  };
}

function flushTypingBurst() {
  if (!sourceArmed || typingBurstCount <= 0) {
    typingBurstCount = 0;
    return;
  }

  const intensity = clampNumber(typingBurstCount / 6, 0, 1);
  sendSourceEvent({
    kind: "type",
    t: Date.now(),
    xNorm: typingFocus.xNorm,
    yNorm: typingFocus.yNorm,
    intensity,
  });
  typingBurstCount = 0;
}

function onClick(event) {
  if (!sourceArmed) {
    return;
  }

  const { width, height } = getViewportSize();
  sendSourceEvent({
    kind: "click",
    t: Date.now(),
    xNorm: clampNumber(event.clientX / width, 0, 1),
    yNorm: clampNumber(event.clientY / height, 0, 1),
    intensity: 0,
  });
}

function onKeyDown(event) {
  if (!sourceArmed) {
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  const key = event.key || "";
  const isTypingKey =
    key.length === 1 || key === "Backspace" || key === "Delete" || key === "Enter" || key === "Tab";
  if (!isTypingKey) {
    return;
  }

  updateTypingFocusFromElement(document.activeElement);
  typingBurstCount += 1;
  if (typingBurstTimerId) {
    window.clearTimeout(typingBurstTimerId);
  }
  typingBurstTimerId = window.setTimeout(() => {
    typingBurstTimerId = 0;
    flushTypingBurst();
  }, 420);
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.channel !== "frameforge" || message.type !== "FF_SET_ARMED") {
    return;
  }

  sourceArmed = Boolean(message.payload?.armed);
  if (!sourceArmed) {
    if (typingBurstTimerId) {
      window.clearTimeout(typingBurstTimerId);
      typingBurstTimerId = 0;
    }
    typingBurstCount = 0;
    typingFocus = { xNorm: 0.5, yNorm: 0.5 };
  }
});

document.addEventListener("click", onClick, true);
document.addEventListener("keydown", onKeyDown, true);
