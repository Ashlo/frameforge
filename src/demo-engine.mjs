const MIN_ZOOM_STRENGTH = 0.05;
const MAX_ZOOM_STRENGTH = 0.95;

const MIN_DURATION_MS = 200;
const MAX_DURATION_MS = 4000;
const MIN_COOLDOWN_MS = 0;
const MAX_COOLDOWN_MS = 5000;
const MIN_TYPING_HOLD_MS = 200;
const MAX_TYPING_HOLD_MS = 5000;

export const DEFAULT_DEMO_PRESET = "balanced";

export const DEMO_PRESETS = {
  subtle: {
    zoomStrength: 0.36,
    zoomDurationMs: 860,
    cooldownMs: 420,
    typingHoldMs: 1180,
  },
  balanced: {
    zoomStrength: 0.56,
    zoomDurationMs: 980,
    cooldownMs: 320,
    typingHoldMs: 1280,
  },
  intense: {
    zoomStrength: 0.78,
    zoomDurationMs: 1120,
    cooldownMs: 220,
    typingHoldMs: 1450,
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

function clampFocusWithMargin(value, margin, fallback = 0.5) {
  return clampNumber(toFiniteNumber(value, fallback), margin, 1 - margin);
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

function resolveFocusMargin(zoomStrength) {
  return clampNumber(0.08 + zoomStrength * 0.13, 0.12, 0.22);
}

function resolveEventIntensity(event) {
  const fallback = event?.kind === "click" ? 0.55 : 0.72;
  return clampNumber(toFiniteNumber(event?.intensity, fallback), 0, 1);
}

function resolveTargetStrength(event, settings) {
  const intensity = resolveEventIntensity(event);
  const multiplier =
    event?.kind === "type" ? lerp(0.72, 0.96, intensity) : lerp(1.05, 1.18, intensity);

  return clampNumber(settings.zoomStrength * multiplier, MIN_ZOOM_STRENGTH, MAX_ZOOM_STRENGTH);
}

function resolveCurrentFocus(zoom) {
  return {
    x: clampUnit(zoom?.focusNormX, 0.5),
    y: clampUnit(zoom?.focusNormY, 0.5),
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
  const targetStrength = resolveTargetStrength(event, settings);
  const scaleTarget = 1 + targetStrength;

  const zoomInMs = Math.max(180, Math.round(settings.zoomDurationMs * 0.46));
  const zoomOutMs = Math.max(260, settings.zoomDurationMs - zoomInMs);
  const holdMs =
    event?.kind === "type" ? settings.typingHoldMs : Math.max(220, Math.round(settings.zoomDurationMs * 0.34));

  const startedAt = toFiniteNumber(nowMs, performance.now());
  const zoomInEndsAt = startedAt + zoomInMs;
  const holdEndsAt = zoomInEndsAt + holdMs;
  const zoomOutEndsAt = holdEndsAt + zoomOutMs;
  const focusStart = resolveCurrentFocus(zoom);
  const focusMargin = resolveFocusMargin(targetStrength);
  const focusTargetX = clampFocusWithMargin(event?.xNorm, focusMargin, focusStart.x);
  const focusTargetY = clampFocusWithMargin(event?.yNorm, focusMargin, focusStart.y);

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
    focusNormX: focusStart.x,
    focusNormY: focusStart.y,
    focusStartX: focusStart.x,
    focusStartY: focusStart.y,
    focusTargetX,
    focusTargetY,
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
      focusNormX: clampUnit(zoom.focusNormX, 0.5),
      focusNormY: clampUnit(zoom.focusNormY, 0.5),
    };
  }

  const fromScale = 1;
  const toScale = clampNumber(toFiniteNumber(zoom.scaleTarget, 1.24), 1 + MIN_ZOOM_STRENGTH, 1 + MAX_ZOOM_STRENGTH);
  const focusStartX = clampUnit(zoom.focusStartX, zoom.focusNormX ?? 0.5);
  const focusStartY = clampUnit(zoom.focusStartY, zoom.focusNormY ?? 0.5);
  const focusTargetX = clampUnit(zoom.focusTargetX, focusStartX);
  const focusTargetY = clampUnit(zoom.focusTargetY, focusStartY);

  if (now <= zoom.zoomInEndsAt) {
    const progress = clampNumber(
      (now - zoom.startedAt) / Math.max(1, zoom.zoomInEndsAt - zoom.startedAt),
      0,
      1
    );
    const easedProgress = easeOutCubic(progress);
    return {
      ...zoom,
      stage: "zoom-in",
      scaleCurrent: lerp(fromScale, toScale, easedProgress),
      focusNormX: lerp(focusStartX, focusTargetX, easedProgress),
      focusNormY: lerp(focusStartY, focusTargetY, easedProgress),
    };
  }

  if (now <= zoom.holdEndsAt) {
    return {
      ...zoom,
      stage: "hold",
      scaleCurrent: toScale,
      focusNormX: focusTargetX,
      focusNormY: focusTargetY,
    };
  }

  if (now <= zoom.zoomOutEndsAt) {
    const progress = clampNumber((now - zoom.holdEndsAt) / Math.max(1, zoom.zoomOutEndsAt - zoom.holdEndsAt), 0, 1);
    return {
      ...zoom,
      stage: "zoom-out",
      scaleCurrent: lerp(toScale, fromScale, easeInOutCubic(progress)),
      focusNormX: focusTargetX,
      focusNormY: focusTargetY,
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
    scale: clampNumber(toFiniteNumber(safeZoom.scaleCurrent, 1), 1, 2.1),
    focusNormX: clampUnit(safeZoom.focusNormX, 0.5),
    focusNormY: clampUnit(safeZoom.focusNormY, 0.5),
  };
}
