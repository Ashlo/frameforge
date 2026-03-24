const MIN_ZOOM_STRENGTH = 0.05;
const MAX_ZOOM_STRENGTH = 0.9;

const MIN_DURATION_MS = 200;
const MAX_DURATION_MS = 4000;
const MIN_COOLDOWN_MS = 0;
const MAX_COOLDOWN_MS = 5000;
const MIN_TYPING_HOLD_MS = 200;
const MAX_TYPING_HOLD_MS = 5000;

export const DEFAULT_DEMO_PRESET = "subtle";

export const DEMO_PRESETS = {
  subtle: {
    zoomStrength: 0.24,
    zoomDurationMs: 700,
    cooldownMs: 650,
    typingHoldMs: 1200,
  },
  balanced: {
    zoomStrength: 0.36,
    zoomDurationMs: 820,
    cooldownMs: 540,
    typingHoldMs: 1150,
  },
  intense: {
    zoomStrength: 0.52,
    zoomDurationMs: 980,
    cooldownMs: 420,
    typingHoldMs: 1000,
  },
};

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function easeInOutCubic(t) {
  if (t < 0.5) {
    return 4 * t * t * t;
  }
  return 1 - ((-2 * t + 2) ** 3) / 2;
}

function clampUnit(value, fallback = 0.5) {
  return clampNumber(toFiniteNumber(value, fallback), 0, 1);
}

function clampDemoSettingBounds(settings) {
  return {
    zoomStrength: clampNumber(toFiniteNumber(settings.zoomStrength, 0.24), MIN_ZOOM_STRENGTH, MAX_ZOOM_STRENGTH),
    zoomDurationMs: clampNumber(
      Math.round(toFiniteNumber(settings.zoomDurationMs, 700)),
      MIN_DURATION_MS,
      MAX_DURATION_MS
    ),
    cooldownMs: clampNumber(Math.round(toFiniteNumber(settings.cooldownMs, 650)), MIN_COOLDOWN_MS, MAX_COOLDOWN_MS),
    typingHoldMs: clampNumber(
      Math.round(toFiniteNumber(settings.typingHoldMs, 1200)),
      MIN_TYPING_HOLD_MS,
      MAX_TYPING_HOLD_MS
    ),
  };
}

export function applyPreset(presetName) {
  const preset = DEMO_PRESETS[presetName] ? presetName : DEFAULT_DEMO_PRESET;
  return {
    preset,
    ...DEMO_PRESETS[preset],
  };
}

export function normalizeDemoEvent(rawEvent) {
  if (!rawEvent || (rawEvent.kind !== "click" && rawEvent.kind !== "type")) {
    return null;
  }

  return {
    kind: rawEvent.kind,
    t: toFiniteNumber(rawEvent.t, Date.now()),
    xNorm: clampUnit(rawEvent.xNorm, 0.5),
    yNorm: clampUnit(rawEvent.yNorm, 0.5),
    intensity: clampNumber(toFiniteNumber(rawEvent.intensity, 0), 0, 1),
  };
}

export function enqueueDemoEvent(queue, event, { maxQueue = 80 } = {}) {
  if (!Array.isArray(queue) || !event) {
    return false;
  }

  if (queue.length >= maxQueue) {
    queue.shift();
  }
  queue.push(event);
  return true;
}

export function beginDemoZoom(previousZoom, event, rawSettings, nowMs) {
  const zoom = previousZoom || {};
  const settings = clampDemoSettingBounds(rawSettings || {});
  const intensity = clampNumber(toFiniteNumber(event?.intensity, 0), 0, 1);

  const targetStrength =
    event?.kind === "type"
      ? settings.zoomStrength + settings.zoomStrength * 0.35 * intensity
      : settings.zoomStrength;
  const scaleTarget = 1 + clampNumber(targetStrength, MIN_ZOOM_STRENGTH, MAX_ZOOM_STRENGTH);

  const zoomInMs = Math.max(140, Math.round(settings.zoomDurationMs * 0.42));
  const zoomOutMs = Math.max(180, settings.zoomDurationMs - zoomInMs);
  const holdMs =
    event?.kind === "type" ? settings.typingHoldMs : Math.max(140, Math.round(settings.zoomDurationMs * 0.24));

  const startedAt = toFiniteNumber(nowMs, performance.now());
  const zoomInEndsAt = startedAt + zoomInMs;
  const holdEndsAt = zoomInEndsAt + holdMs;
  const zoomOutEndsAt = holdEndsAt + zoomOutMs;

  return {
    active: true,
    stage: "zoom-in",
    startedAt,
    zoomInEndsAt,
    holdEndsAt,
    zoomOutEndsAt,
    cooldownUntil: zoom.cooldownUntil || 0,
    scaleCurrent: 1,
    scaleTarget,
    focusNormX: clampUnit(event?.xNorm, zoom.focusNormX ?? 0.5),
    focusNormY: clampUnit(event?.yNorm, zoom.focusNormY ?? 0.5),
    kind: event?.kind || "click",
  };
}

export function stepDemoZoom(currentZoom, rawSettings, nowMs) {
  const zoom = currentZoom || {};
  const now = toFiniteNumber(nowMs, performance.now());
  const settings = clampDemoSettingBounds(rawSettings || {});

  if (!zoom.active) {
    return {
      ...zoom,
      stage: "idle",
      scaleCurrent: 1,
    };
  }

  const fromScale = 1;
  const toScale = clampNumber(toFiniteNumber(zoom.scaleTarget, 1.24), 1 + MIN_ZOOM_STRENGTH, 1 + MAX_ZOOM_STRENGTH);

  if (now <= zoom.zoomInEndsAt) {
    const progress = clampNumber(
      (now - zoom.startedAt) / Math.max(1, zoom.zoomInEndsAt - zoom.startedAt),
      0,
      1
    );
    return {
      ...zoom,
      stage: "zoom-in",
      scaleCurrent: lerp(fromScale, toScale, easeOutCubic(progress)),
    };
  }

  if (now <= zoom.holdEndsAt) {
    return {
      ...zoom,
      stage: "hold",
      scaleCurrent: toScale,
    };
  }

  if (now <= zoom.zoomOutEndsAt) {
    const progress = clampNumber((now - zoom.holdEndsAt) / Math.max(1, zoom.zoomOutEndsAt - zoom.holdEndsAt), 0, 1);
    return {
      ...zoom,
      stage: "zoom-out",
      scaleCurrent: lerp(toScale, fromScale, easeInOutCubic(progress)),
    };
  }

  return {
    ...zoom,
    active: false,
    stage: "cooldown",
    scaleCurrent: 1,
    cooldownUntil: now + settings.cooldownMs,
  };
}

export function getDemoScreenEffect(zoom) {
  const safeZoom = zoom || {};
  return {
    scale: clampNumber(toFiniteNumber(safeZoom.scaleCurrent, 1), 1, 2),
    focusNormX: clampUnit(safeZoom.focusNormX, 0.5),
    focusNormY: clampUnit(safeZoom.focusNormY, 0.5),
  };
}
