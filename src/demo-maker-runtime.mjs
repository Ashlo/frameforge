import {
  advanceFreezeWatch,
  deriveControlState,
  getBaseScreenRect,
  getScreenRenderMode,
} from "./recorder-utils.mjs";
import {
  DEFAULT_DEMO_PRESET,
  applyPreset,
  beginDemoZoom,
  enqueueDemoEvent,
  getDemoScreenEffect,
  normalizeDemoEvent,
  stepDemoZoom,
} from "./demo-engine.mjs";
import { createDemoBridge } from "./demo-bridge.mjs";
import { createDesktopDemoBridge, exportDemoMedia, isDesktopRuntime } from "./desktop-demo-bridge.mjs";

const canvas = document.getElementById("dmCompositeCanvas");
const ctx = canvas.getContext("2d");

const screenVideo = document.getElementById("dmScreenVideo");
const webcamVideo = document.getElementById("dmWebcamVideo");
const recordingPreviewVideo = document.getElementById("dmRecordingPreviewVideo");

const startSourcesBtn = document.getElementById("dmStartSourcesBtn");
const stopSourcesBtn = document.getElementById("dmStopSourcesBtn");
const replaceScreenBtn = document.getElementById("dmReplaceScreenBtn");
const startRecordBtn = document.getElementById("dmStartRecordBtn");
const stopRecordBtn = document.getElementById("dmStopRecordBtn");
const reconnectMonitorBtn = document.getElementById("dmReconnectMonitorBtn");

const captureHint = document.getElementById("dmCaptureHint");
const sourcesStatus = document.getElementById("dmSourcesStatus");
const recordingStatus = document.getElementById("dmRecordingStatus");
const elapsedTime = document.getElementById("dmElapsedTime");
const demoStatus = document.getElementById("dmDemoStatus");
const demoSummary = document.getElementById("dmDemoSummary");
const desktopModePill = document.getElementById("dmDesktopModePill");

const resolutionSelect = document.getElementById("dmResolutionSelect");
const fpsSelect = document.getElementById("dmFpsSelect");
const cameraEnabledToggle = document.getElementById("dmCameraEnabledToggle");
const webcamSizeRange = document.getElementById("dmWebcamSizeRange");
const webcamSizeValue = document.getElementById("dmWebcamSizeValue");

const demoModeToggle = document.getElementById("dmDemoModeToggle");
const demoPresetSelect = document.getElementById("dmDemoPresetSelect");
const triggerClickToggle = document.getElementById("dmTriggerClickToggle");
const triggerTypeToggle = document.getElementById("dmTriggerTypeToggle");
const zoomStrengthRange = document.getElementById("dmZoomStrengthRange");
const zoomDurationRange = document.getElementById("dmZoomDurationRange");
const cooldownRange = document.getElementById("dmCooldownRange");
const typingHoldRange = document.getElementById("dmTypingHoldRange");
const zoomStrengthValue = document.getElementById("dmZoomStrengthValue");
const zoomDurationValue = document.getElementById("dmZoomDurationValue");
const cooldownValue = document.getElementById("dmCooldownValue");
const typingHoldValue = document.getElementById("dmTypingHoldValue");

const exportPanel = document.getElementById("dmExportPanel");
const exportPlaceholder = document.getElementById("dmExportPlaceholder");
const recordedDurationValue = document.getElementById("dmRecordedDuration");
const clipDurationValue = document.getElementById("dmClipDuration");
const trimStartRange = document.getElementById("dmTrimStartRange");
const trimEndRange = document.getElementById("dmTrimEndRange");
const trimStartValue = document.getElementById("dmTrimStartValue");
const trimEndValue = document.getElementById("dmTrimEndValue");
const gifPresetSelect = document.getElementById("dmGifPresetSelect");
const videoNameInput = document.getElementById("dmVideoNameInput");
const exportBundleBtn = document.getElementById("dmExportBundleBtn");
const exportStatus = document.getElementById("dmExportStatus");
const exportResult = document.getElementById("dmExportResult");
const exportPaths = document.getElementById("dmExportPaths");

const GIF_PRESETS = {
  small: { width: 480, fps: 10, label: "Small" },
  medium: { width: 640, fps: 12, label: "Medium" },
  large: { width: 720, fps: 15, label: "Large" },
};

const initialDemoPreset = applyPreset(DEFAULT_DEMO_PRESET);
const platformMode = isDesktopRuntime() ? "desktop" : "web";
const WEBCAM_ASPECT = 16 / 9;
const MAX_GIF_DURATION_MS = 15_000;
const DEFAULT_GIF_DURATION_MS = 8_000;

const state = {
  platformMode,
  screenStream: null,
  webcamStream: null,
  screenSurfaceType: "unknown",
  mediaRecorder: null,
  recordedChunks: [],
  drawFrameId: 0,
  recordingTimerId: 0,
  recordingStartedAt: 0,
  recordingDurationMs: 0,
  canvasCaptureStream: null,
  hasLastScreenFrame: false,
  lastScreenFrameCanvas: null,
  lastScreenFrameCtx: null,
  recordedBlob: null,
  recordedPreviewUrl: "",
  activeMimeType: "",
  activeExtension: "webm",
  wakeLock: null,
  screenFreezeWatch: {
    lastTime: null,
    lastTick: null,
    unchangedMs: 0,
    isFrozen: false,
  },
  freezeNoticeActive: false,
  webcamOverlay: {
    x: 0,
    y: 0,
    width: 280,
    height: 158,
  },
  webcamEnabled: true,
  demo: {
    enabled: true,
    triggerClick: true,
    triggerType: true,
    preset: initialDemoPreset.preset,
    zoomStrength: initialDemoPreset.zoomStrength,
    zoomDurationMs: initialDemoPreset.zoomDurationMs,
    cooldownMs: initialDemoPreset.cooldownMs,
    typingHoldMs: initialDemoPreset.typingHoldMs,
  },
  demoTelemetry: {
    connected: false,
    sourceTabArmed: false,
    sourceTabId: null,
    sourceTabTitle: "",
    lastBridgeError: "",
  },
  demoZoom: {
    active: false,
    stage: "idle",
    startedAt: 0,
    zoomInEndsAt: 0,
    holdEndsAt: 0,
    zoomOutEndsAt: 0,
    cooldownUntil: 0,
    scaleCurrent: 1,
    scaleTarget: 1,
    focusNormX: 0.5,
    focusNormY: 0.5,
    kind: "click",
  },
  demoQueue: [],
  demoBridge: null,
  drag: {
    active: false,
    mode: "none",
    pointerId: null,
    offsetX: 0,
    offsetY: 0,
    startX: 0,
    startY: 0,
    startWidth: 0,
  },
  sourceAction: "idle",
  export: {
    exporting: false,
    trimStartMs: 0,
    trimEndMs: 0,
    lastVideoPath: "",
    lastGifPath: "",
  },
};

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function setStatus(el, value) {
  el.textContent = value;
}

function updateElapsedClock() {
  if (!state.recordingStartedAt) {
    elapsedTime.textContent = "00:00";
    return;
  }
  elapsedTime.textContent = formatDuration(Date.now() - state.recordingStartedAt);
}

function setCaptureHint(message, tone = "idle") {
  captureHint.textContent = message;
  captureHint.dataset.tone = tone;
}

function setExportStatus(message, tone = "idle") {
  exportStatus.textContent = message;
  exportStatus.dataset.tone = tone;
}

function setDemoSummary(text, tone = "idle") {
  demoSummary.textContent = text;
  demoSummary.dataset.tone = tone;
}

function hasLiveVideo(stream) {
  return Boolean(stream && stream.getVideoTracks().some((track) => track.readyState === "live"));
}

function hasLiveSource(stream) {
  return Boolean(stream && stream.getTracks().some((track) => track.readyState === "live"));
}

function isRecordingActive() {
  return Boolean(state.mediaRecorder && state.mediaRecorder.state === "recording");
}

function updateDesktopPill() {
  if (platformMode === "desktop") {
    desktopModePill.textContent = "desktop monitor";
    desktopModePill.dataset.tone = "ready";
  } else {
    desktopModePill.textContent = "web fallback";
    desktopModePill.dataset.tone = "warn";
  }
}

function refreshControlState() {
  const hasScreen = hasLiveVideo(state.screenStream);
  const hasWebcam = hasLiveVideo(state.webcamStream);
  const hasAnySource = hasLiveSource(state.screenStream) || hasLiveSource(state.webcamStream);
  const recording = isRecordingActive();
  const controls = deriveControlState({ hasScreen, hasWebcam, hasAnySource, recording });
  const sourceBusy = state.sourceAction !== "idle";
  const exporting = state.export.exporting;

  startSourcesBtn.disabled = sourceBusy || exporting || controls.startSourcesDisabled;
  stopSourcesBtn.disabled = sourceBusy || exporting || controls.stopSourcesDisabled;
  replaceScreenBtn.disabled = sourceBusy || exporting || controls.replaceScreenDisabled;
  startRecordBtn.disabled = exporting || controls.startRecordDisabled;
  stopRecordBtn.disabled = exporting || controls.stopRecordDisabled;
  resolutionSelect.disabled = exporting || controls.resolutionDisabled;
  fpsSelect.disabled = exporting || controls.fpsDisabled;
  reconnectMonitorBtn.disabled = state.export.exporting;
  refreshExportUi();
}

function updateSliderReadouts() {
  webcamSizeValue.textContent = `${webcamSizeRange.value}%`;
  zoomStrengthValue.textContent = `${zoomStrengthRange.value}%`;
  zoomDurationValue.textContent = `${zoomDurationRange.value}ms`;
  cooldownValue.textContent = `${cooldownRange.value}ms`;
  typingHoldValue.textContent = `${typingHoldRange.value}ms`;
}

function updateDemoSettingsFromUi({ markCustom = false } = {}) {
  if (markCustom && demoPresetSelect.value !== "custom") {
    demoPresetSelect.value = "custom";
  }

  state.demo.enabled = demoModeToggle.checked;
  state.demo.triggerClick = triggerClickToggle.checked;
  state.demo.triggerType = triggerTypeToggle.checked;
  state.demo.preset = demoPresetSelect.value;
  state.demo.zoomStrength = clampNumber(Number.parseInt(zoomStrengthRange.value, 10) / 100, 0.05, 0.9);
  state.demo.zoomDurationMs = clampNumber(Number.parseInt(zoomDurationRange.value, 10), 200, 4000);
  state.demo.cooldownMs = clampNumber(Number.parseInt(cooldownRange.value, 10), 0, 5000);
  state.demo.typingHoldMs = clampNumber(Number.parseInt(typingHoldRange.value, 10), 200, 5000);
  updateSliderReadouts();

  if (!state.demo.enabled) {
    state.demoQueue.length = 0;
    resetDemoZoomState();
  }
}

function setDemoPresetInUi(presetName) {
  const preset = applyPreset(presetName);
  demoPresetSelect.value = preset.preset;
  zoomStrengthRange.value = String(Math.round(preset.zoomStrength * 100));
  zoomDurationRange.value = String(preset.zoomDurationMs);
  cooldownRange.value = String(preset.cooldownMs);
  typingHoldRange.value = String(preset.typingHoldMs);
  updateSliderReadouts();
}

function getScreenSurfaceType(stream) {
  const track = stream?.getVideoTracks?.()[0];
  if (!track || typeof track.getSettings !== "function") {
    return "unknown";
  }
  return track.getSettings().displaySurface || "unknown";
}

function isDemoSourceSupported() {
  if (state.platformMode === "desktop") {
    return true;
  }
  return state.screenSurfaceType === "browser";
}

function resetDemoZoomState({ keepCooldown = false } = {}) {
  const cooldownUntil = keepCooldown ? state.demoZoom.cooldownUntil : 0;
  state.demoZoom = {
    active: false,
    stage: "idle",
    startedAt: 0,
    zoomInEndsAt: 0,
    holdEndsAt: 0,
    zoomOutEndsAt: 0,
    cooldownUntil,
    scaleCurrent: 1,
    scaleTarget: 1,
    focusNormX: state.demoZoom.focusNormX || 0.5,
    focusNormY: state.demoZoom.focusNormY || 0.5,
    kind: "click",
  };
}

function refreshDemoStatus() {
  if (!state.demo.enabled) {
    demoStatus.textContent = "auto zoom off";
    demoStatus.closest(".demo-status")?.setAttribute("data-state", "idle");
    setDemoSummary("off", "idle");
    return;
  }

  if (state.demoTelemetry.lastBridgeError) {
    demoStatus.textContent = state.demoTelemetry.lastBridgeError;
    demoStatus.closest(".demo-status")?.setAttribute("data-state", "error");
    setDemoSummary("error", "error");
    return;
  }

  if (!state.demoTelemetry.connected) {
    const text =
      state.platformMode === "desktop"
        ? "desktop monitor disconnected"
        : "extension bridge not connected";
    demoStatus.textContent = text;
    demoStatus.closest(".demo-status")?.setAttribute("data-state", "warn");
    setDemoSummary("disconnected", "warn");
    return;
  }

  if (!state.demoTelemetry.sourceTabArmed) {
    const text = state.platformMode === "desktop" ? "monitor ready" : "waiting for source tab";
    demoStatus.textContent = text;
    demoStatus.closest(".demo-status")?.setAttribute("data-state", "warn");
    setDemoSummary(state.platformMode === "desktop" ? "monitor ready" : "connected", "warn");
    return;
  }

  if (hasLiveVideo(state.screenStream) && !isDemoSourceSupported()) {
    demoStatus.textContent = "unsupported source: use browser tab capture";
    demoStatus.closest(".demo-status")?.setAttribute("data-state", "warn");
    setDemoSummary("unsupported", "warn");
    return;
  }

  if (state.demoZoom.active) {
    demoStatus.textContent = "auto focus active";
    demoStatus.closest(".demo-status")?.setAttribute("data-state", "ready");
    setDemoSummary("active", "ready");
    return;
  }

  demoStatus.textContent =
    state.platformMode === "desktop" ? "desktop input monitor armed" : "ready for click + typing focus";
  demoStatus.closest(".demo-status")?.setAttribute("data-state", "ready");
  setDemoSummary("armed", "ready");
}

function handleDemoBridgeStatus(payload) {
  state.demoTelemetry.connected = Boolean(payload.connected);
  state.demoTelemetry.sourceTabArmed = Boolean(payload.armed);
  state.demoTelemetry.sourceTabId = payload.sourceTabId ?? null;
  state.demoTelemetry.sourceTabTitle = payload.sourceTabTitle || "";
  state.demoTelemetry.lastBridgeError = payload.lastError || "";
}

function handleIncomingDemoEvent(rawEvent) {
  const event = normalizeDemoEvent(rawEvent);
  if (!event || !state.demo.enabled || !isDemoSourceSupported()) {
    return;
  }
  if (event.kind === "click" && !state.demo.triggerClick) {
    return;
  }
  if (event.kind === "type" && !state.demo.triggerType) {
    return;
  }
  enqueueDemoEvent(state.demoQueue, event);
}

function ensureDemoBridge() {
  if (state.demoBridge) {
    return state.demoBridge;
  }

  const bridgeFactory = state.platformMode === "desktop" ? createDesktopDemoBridge : createDemoBridge;
  state.demoBridge = bridgeFactory({
    onStatus: (payload) => {
      handleDemoBridgeStatus(payload);
      refreshDemoStatus();
    },
    onEvent: (payload) => {
      handleIncomingDemoEvent(payload);
    },
    onError: (payload) => {
      state.demoTelemetry.lastBridgeError = payload.message || payload.code || "bridge error";
      refreshDemoStatus();
    },
  });
  return state.demoBridge;
}

async function connectDemoBridge() {
  reconnectMonitorBtn.disabled = true;
  try {
    const bridge = ensureDemoBridge();
    await bridge.connect();
    syncDemoConfigToBridge();
    const status = await bridge.getStatus();
    handleDemoBridgeStatus(status);
  } catch (error) {
    state.demoTelemetry.connected = false;
    state.demoTelemetry.lastBridgeError =
      error instanceof Error ? error.message : "Could not connect to demo monitor.";
  } finally {
    reconnectMonitorBtn.disabled = false;
    refreshDemoStatus();
  }
}

function syncDemoConfigToBridge() {
  if (!state.demoBridge || typeof state.demoBridge.setConfig !== "function") {
    return;
  }
  state.demoBridge
    .setConfig({
      zoomStrength: state.demo.zoomStrength,
      zoomDurationMs: state.demo.zoomDurationMs,
      cooldownMs: state.demo.cooldownMs,
      typingHoldMs: state.demo.typingHoldMs,
      clickEnabled: state.demo.triggerClick,
      typeEnabled: state.demo.triggerType,
      screenWidth: window.screen?.width || 1920,
      screenHeight: window.screen?.height || 1080,
    })
    .catch((error) => {
      state.demoTelemetry.lastBridgeError = error instanceof Error ? error.message : "bridge config failed";
      refreshDemoStatus();
    });
}

async function acquireWakeLock() {
  if (!("wakeLock" in navigator) || state.wakeLock || !isRecordingActive()) {
    return;
  }
  try {
    const lock = await navigator.wakeLock.request("screen");
    state.wakeLock = lock;
    lock.addEventListener("release", () => {
      state.wakeLock = null;
      if (isRecordingActive() && document.visibilityState === "visible") {
        acquireWakeLock().catch(() => {});
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "wake lock unavailable";
    setStatus(sourcesStatus, `warning: ${message}`);
  }
}

async function releaseWakeLock() {
  if (!state.wakeLock) {
    return;
  }
  try {
    await state.wakeLock.release();
  } catch {
    // ignore
  } finally {
    state.wakeLock = null;
  }
}

function setCanvasResolution() {
  const [width, height] = resolutionSelect.value.split("x").map((value) => Number.parseInt(value, 10));
  canvas.width = width;
  canvas.height = height;
  ensureLastScreenFrameBuffer();
  setOverlaySizeFromSlider();
  placeOverlayAtBottomRight();
}

function ensureLastScreenFrameBuffer() {
  if (!state.lastScreenFrameCanvas) {
    state.lastScreenFrameCanvas = document.createElement("canvas");
    state.lastScreenFrameCtx = state.lastScreenFrameCanvas.getContext("2d");
  }
  if (
    state.lastScreenFrameCanvas.width !== canvas.width ||
    state.lastScreenFrameCanvas.height !== canvas.height
  ) {
    state.lastScreenFrameCanvas.width = canvas.width;
    state.lastScreenFrameCanvas.height = canvas.height;
  }
}

function clearLastScreenFrame() {
  state.hasLastScreenFrame = false;
  ensureLastScreenFrameBuffer();
  state.lastScreenFrameCtx?.clearRect(0, 0, state.lastScreenFrameCanvas.width, state.lastScreenFrameCanvas.height);
}

function resetScreenFreezeWatch() {
  state.screenFreezeWatch = {
    lastTime: null,
    lastTick: null,
    unchangedMs: 0,
    isFrozen: false,
  };
  state.freezeNoticeActive = false;
}

function updateScreenFreezeWatch({ screenReady }) {
  const shouldWatch = Boolean(hasLiveVideo(state.screenStream) && screenReady);
  state.screenFreezeWatch = advanceFreezeWatch({
    active: shouldWatch,
    previous: state.screenFreezeWatch,
    currentTime: screenVideo.currentTime || 0,
    nowMs: performance.now(),
  });

  if (state.screenFreezeWatch.isFrozen && !state.freezeNoticeActive) {
    state.freezeNoticeActive = true;
    setStatus(sourcesStatus, "screen appears frozen - click Replace Screen");
  } else if (!state.screenFreezeWatch.isFrozen && state.freezeNoticeActive) {
    state.freezeNoticeActive = false;
    if (hasLiveVideo(state.screenStream) && hasLiveVideo(state.webcamStream)) {
      setStatus(sourcesStatus, "ready");
    }
  }
}

function setOverlaySizeByWidth(widthCandidate, { keepAnchor = false } = {}) {
  const minPercent = Number.parseInt(webcamSizeRange.min, 10) || 12;
  const maxPercent = Number.parseInt(webcamSizeRange.max, 10) || 42;
  const minWidth = Math.max(120, Math.round((canvas.width * minPercent) / 100));
  const maxWidthFromSlider = Math.round((canvas.width * maxPercent) / 100);

  let maxWidth = maxWidthFromSlider;
  if (keepAnchor) {
    const maxWidthByX = Math.max(1, canvas.width - state.webcamOverlay.x);
    const maxWidthByY = Math.max(1, (canvas.height - state.webcamOverlay.y) * WEBCAM_ASPECT);
    maxWidth = Math.min(maxWidth, maxWidthByX, maxWidthByY);
  }

  const effectiveMaxWidth = Math.max(minWidth, Math.round(maxWidth));
  const width = Math.round(clampNumber(widthCandidate, minWidth, effectiveMaxWidth));
  const height = Math.round(width / WEBCAM_ASPECT);

  state.webcamOverlay.width = width;
  state.webcamOverlay.height = height;
  clampOverlayInsideCanvas();

  webcamSizeRange.value = String(clampNumber(Math.round((width / canvas.width) * 100), minPercent, maxPercent));
  updateSliderReadouts();
}

function setOverlaySizeFromSlider() {
  const ratio = Number.parseInt(webcamSizeRange.value, 10) / 100;
  setOverlaySizeByWidth(canvas.width * ratio);
}

function placeOverlayAtBottomRight() {
  const margin = Math.max(18, Math.round(canvas.width * 0.012));
  state.webcamOverlay.x = canvas.width - state.webcamOverlay.width - margin;
  state.webcamOverlay.y = canvas.height - state.webcamOverlay.height - margin;
  clampOverlayInsideCanvas();
}

function clampOverlayInsideCanvas() {
  const overlay = state.webcamOverlay;
  overlay.x = Math.min(Math.max(0, overlay.x), canvas.width - overlay.width);
  overlay.y = Math.min(Math.max(0, overlay.y), canvas.height - overlay.height);
}

function getResizeHandleRect() {
  const size = clampNumber(Math.round(Math.min(state.webcamOverlay.width, state.webcamOverlay.height) * 0.18), 14, 26);
  return {
    x: state.webcamOverlay.x + state.webcamOverlay.width - size,
    y: state.webcamOverlay.y + state.webcamOverlay.height - size,
    width: size,
    height: size,
  };
}

function pointInsideRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function pointInsideWebcam(point) {
  return pointInsideRect(point, {
    x: state.webcamOverlay.x,
    y: state.webcamOverlay.y,
    width: state.webcamOverlay.width,
    height: state.webcamOverlay.height,
  });
}

function getWebcamPointerTarget(point) {
  if (!state.webcamEnabled || !hasLiveVideo(state.webcamStream)) {
    return "none";
  }
  if (pointInsideRect(point, getResizeHandleRect())) {
    return "resize";
  }
  if (pointInsideWebcam(point)) {
    return "move";
  }
  return "none";
}

function updateCanvasCursor(point) {
  if (state.drag.active) {
    return;
  }
  const target = getWebcamPointerTarget(point);
  if (target === "resize") {
    canvas.style.cursor = "nwse-resize";
  } else if (target === "move") {
    canvas.style.cursor = "grab";
  } else {
    canvas.style.cursor = "default";
  }
}

function clearWebcamDragState() {
  if (state.drag.pointerId !== null && canvas.hasPointerCapture(state.drag.pointerId)) {
    canvas.releasePointerCapture(state.drag.pointerId);
  }
  state.drag.active = false;
  state.drag.mode = "none";
  state.drag.pointerId = null;
}

function drawRoundedRectPath(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawAdjustedScreen(videoEl, targetCtx = ctx, demoEffect = { scale: 1, focusNormX: 0.5, focusNormY: 0.5 }) {
  const fitRect = getBaseScreenRect(videoEl.videoWidth, videoEl.videoHeight, canvas.width, canvas.height, "contain");
  if (!fitRect) {
    return;
  }

  let finalX = fitRect.x;
  let finalY = fitRect.y;
  let finalWidth = fitRect.width;
  let finalHeight = fitRect.height;
  const demoScale = clampNumber(Number(demoEffect.scale) || 1, 1, 2);

  if (demoScale > 1.001) {
    const focusNormX = clampNumber(Number(demoEffect.focusNormX) || 0.5, 0, 1);
    const focusNormY = clampNumber(Number(demoEffect.focusNormY) || 0.5, 0, 1);
    const focusX = fitRect.x + fitRect.width * focusNormX;
    const focusY = fitRect.y + fitRect.height * focusNormY;
    finalWidth = fitRect.width * demoScale;
    finalHeight = fitRect.height * demoScale;
    finalX = focusX - finalWidth * focusNormX;
    finalY = focusY - finalHeight * focusNormY;
  }

  targetCtx.drawImage(videoEl, finalX, finalY, finalWidth, finalHeight);
}

function snapshotCurrentScreenFrame(demoEffect) {
  ensureLastScreenFrameBuffer();
  if (!state.lastScreenFrameCtx) {
    return;
  }
  state.lastScreenFrameCtx.clearRect(0, 0, state.lastScreenFrameCanvas.width, state.lastScreenFrameCanvas.height);
  state.lastScreenFrameCtx.fillStyle = "#0d1014";
  state.lastScreenFrameCtx.fillRect(0, 0, state.lastScreenFrameCanvas.width, state.lastScreenFrameCanvas.height);
  drawAdjustedScreen(screenVideo, state.lastScreenFrameCtx, demoEffect);
  state.hasLastScreenFrame = true;
}

function updateDemoZoom(nowMs) {
  if (!state.demo.enabled || !isDemoSourceSupported()) {
    state.demoQueue.length = 0;
    resetDemoZoomState({ keepCooldown: true });
    return;
  }

  if (!state.demoZoom.active && nowMs >= state.demoZoom.cooldownUntil && state.demoQueue.length > 0) {
    const next = state.demoQueue.shift();
    state.demoZoom = beginDemoZoom(state.demoZoom, next, state.demo, nowMs);
  }

  state.demoZoom = stepDemoZoom(state.demoZoom, state.demo, nowMs);
}

function drawScene() {
  const previousDemoStage = state.demoZoom.stage;
  updateDemoZoom(performance.now());
  const demoEffect = getDemoScreenEffect(state.demoZoom);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0d1014";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const screenReady = screenVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  updateScreenFreezeWatch({ screenReady });
  const screenRenderMode = getScreenRenderMode({
    screenReady,
    hasLastScreenFrame: state.hasLastScreenFrame,
  });

  if (screenRenderMode === "live") {
    drawAdjustedScreen(screenVideo, ctx, demoEffect);
    snapshotCurrentScreenFrame(demoEffect);
  } else if (screenRenderMode === "hold" && state.lastScreenFrameCanvas) {
    ctx.drawImage(state.lastScreenFrameCanvas, 0, 0, canvas.width, canvas.height);
  }

  if (state.webcamEnabled && webcamVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    const { x, y, width, height } = state.webcamOverlay;
    ctx.save();
    drawRoundedRectPath(x, y, width, height, 24);
    ctx.clip();
    ctx.translate(x + width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(webcamVideo, 0, 0, width, height);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 3;
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 12;
    drawRoundedRectPath(x, y, width, height, 24);
    ctx.stroke();
    ctx.restore();

    const handle = getResizeHandleRect();
    ctx.save();
    ctx.fillStyle = "rgba(43, 135, 255, 0.95)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = 2;
    ctx.fillRect(handle.x, handle.y, handle.width, handle.height);
    ctx.strokeRect(handle.x, handle.y, handle.width, handle.height);
    ctx.beginPath();
    ctx.moveTo(handle.x + 4, handle.y + handle.height - 4);
    ctx.lineTo(handle.x + handle.width - 4, handle.y + 4);
    ctx.stroke();
    ctx.restore();
  }

  if (previousDemoStage !== state.demoZoom.stage) {
    refreshDemoStatus();
  }

  state.drawFrameId = window.requestAnimationFrame(drawScene);
}

function stopDrawLoop() {
  if (state.drawFrameId) {
    window.cancelAnimationFrame(state.drawFrameId);
    state.drawFrameId = 0;
  }
}

function getRecordingProfile() {
  const candidates = [
    { mimeType: "video/webm;codecs=vp9,opus", extension: "webm" },
    { mimeType: "video/webm;codecs=vp8,opus", extension: "webm" },
    { mimeType: "video/webm", extension: "webm" },
  ];
  const supported = candidates.find((item) => MediaRecorder.isTypeSupported(item.mimeType));
  if (!supported) {
    throw new Error("WebM recording is not supported in this browser.");
  }
  return supported;
}

function buildSuggestedFilename(extension) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `frameforge-demo-${stamp}.${extension}`;
}

async function waitForVideoReady(videoEl) {
  if (videoEl.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
    return;
  }
  await new Promise((resolve) => {
    const onLoaded = () => {
      videoEl.removeEventListener("loadeddata", onLoaded);
      resolve();
    };
    videoEl.addEventListener("loadeddata", onLoaded);
  });
}

function stopStream(stream) {
  if (!stream) {
    return;
  }
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function describeCaptureError(error, mode = "start") {
  if (!(error instanceof DOMException)) {
    return error instanceof Error ? error.message : `Failed to ${mode} sources.`;
  }

  if (error.name === "AbortError") {
    return mode === "replace" ? "Screen selection canceled." : "Capture selection canceled.";
  }
  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    return state.platformMode === "desktop"
      ? "Permission denied. Enable Screen Recording, Camera, and Microphone for Frameforge Desktop in macOS System Settings > Privacy & Security."
      : "Permission denied. Allow browser screen, camera, and microphone access and retry.";
  }
  if (error.name === "NotReadableError") {
    return "Capture device is busy or unavailable. Close other capture apps and retry.";
  }
  return error.message || `Failed to ${mode} sources.`;
}

function assertCaptureApisAvailable() {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices?.getDisplayMedia || !mediaDevices?.getUserMedia) {
    throw new Error("Required capture APIs are not available in this runtime.");
  }
}

async function attachScreenStream(displayStream) {
  const previousScreenStream = state.screenStream;
  state.screenStream = displayStream;
  state.screenSurfaceType = getScreenSurfaceType(displayStream);
  resetScreenFreezeWatch();
  screenVideo.srcObject = displayStream;
  await screenVideo.play();
  await waitForVideoReady(screenVideo);
  if (previousScreenStream && previousScreenStream !== displayStream) {
    stopStream(previousScreenStream);
  }
  const [screenTrack] = displayStream.getVideoTracks();
  if (screenTrack) {
    const trackId = screenTrack.id;
    screenTrack.addEventListener(
      "ended",
      () => {
        const currentTrack = state.screenStream?.getVideoTracks()[0];
        if (!currentTrack || currentTrack.id !== trackId) {
          return;
        }
        resetScreenFreezeWatch();
        state.screenStream = null;
        state.screenSurfaceType = "unknown";
        screenVideo.srcObject = null;
        refreshControlState();
        refreshDemoStatus();
        setStatus(sourcesStatus, isRecordingActive() ? "screen lost, recording continues" : "screen lost - click Replace Screen");
      },
      { once: true }
    );
  }
  refreshDemoStatus();
}

async function attachWebcamStream(webcamStream) {
  const previousWebcamStream = state.webcamStream;
  state.webcamStream = webcamStream;
  webcamVideo.srcObject = webcamStream;
  await webcamVideo.play();
  await waitForVideoReady(webcamVideo);
  if (previousWebcamStream && previousWebcamStream !== webcamStream) {
    stopStream(previousWebcamStream);
  }
  const [webcamTrack] = webcamStream.getVideoTracks();
  if (webcamTrack) {
    const trackId = webcamTrack.id;
    webcamTrack.addEventListener(
      "ended",
      () => {
        const currentTrack = state.webcamStream?.getVideoTracks()[0];
        if (!currentTrack || currentTrack.id !== trackId) {
          return;
        }
        state.webcamStream = null;
        webcamVideo.srcObject = null;
        refreshControlState();
        setStatus(sourcesStatus, isRecordingActive() ? "webcam lost, recording continues" : "webcam lost - restart sources");
      },
      { once: true }
    );
  }
}

function setSourceAction(action) {
  state.sourceAction = action;
  if (action === "starting") {
    startSourcesBtn.textContent = "Requesting...";
    replaceScreenBtn.textContent = "Replace Screen";
  } else if (action === "replacing") {
    startSourcesBtn.textContent = "Start Sources";
    replaceScreenBtn.textContent = "Selecting...";
  } else {
    startSourcesBtn.textContent = "Start Sources";
    replaceScreenBtn.textContent = "Replace Screen";
  }
  refreshControlState();
}

async function startSources() {
  setSourceAction("starting");
  try {
    assertCaptureApisAvailable();
    setStatus(sourcesStatus, "requesting permissions...");
    setCaptureHint("Waiting for OS/browser capture prompts...", "pending");
    clearLastScreenFrame();
    resetScreenFreezeWatch();

    const fps = Number.parseInt(fpsSelect.value, 10);
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: fps, max: fps }, cursor: "always" },
      audio: false,
    });
    const webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: fps } },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    await attachScreenStream(displayStream);
    await attachWebcamStream(webcamStream);
    state.demoQueue.length = 0;
    resetDemoZoomState();
    setCanvasResolution();
    stopDrawLoop();
    drawScene();

    setStatus(sourcesStatus, "ready");
    setStatus(recordingStatus, "idle");
    setCaptureHint("Sources live. Record when you are ready.", "ok");
    refreshControlState();
  } catch (error) {
    stopSources();
    const message = describeCaptureError(error, "start");
    setStatus(sourcesStatus, `error: ${message}`);
    setCaptureHint(message, "error");
    console.error("[frameforge-demo-maker] startSources failed:", error);
  } finally {
    setSourceAction("idle");
  }
}

async function replaceScreenSource() {
  setSourceAction("replacing");
  try {
    if (typeof navigator.mediaDevices?.getDisplayMedia !== "function") {
      throw new Error("Screen capture API unavailable.");
    }
    setStatus(sourcesStatus, "select a screen...");
    setCaptureHint("Choose the screen or window to continue the demo.", "pending");
    const fps = Number.parseInt(fpsSelect.value, 10);
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: fps, max: fps }, cursor: "always" },
      audio: false,
    });
    await attachScreenStream(displayStream);
    state.demoQueue.length = 0;
    resetDemoZoomState();
    if (!state.drawFrameId) {
      drawScene();
    }
    setStatus(sourcesStatus, "ready");
    setCaptureHint("Screen source replaced.", "ok");
    refreshControlState();
  } catch (error) {
    const message = describeCaptureError(error, "replace");
    if (error instanceof DOMException && error.name === "AbortError") {
      setStatus(sourcesStatus, "screen selection canceled");
      setCaptureHint(message, "idle");
      return;
    }
    setStatus(sourcesStatus, `error: ${message}`);
    setCaptureHint(message, "error");
    console.error("[frameforge-demo-maker] replaceScreenSource failed:", error);
  } finally {
    setSourceAction("idle");
  }
}

function stopSources() {
  const recording = isRecordingActive();
  resetScreenFreezeWatch();
  if (!recording) {
    stopDrawLoop();
  }

  const oldScreenStream = state.screenStream;
  const oldWebcamStream = state.webcamStream;
  state.screenStream = null;
  state.webcamStream = null;
  state.screenSurfaceType = "unknown";
  screenVideo.srcObject = null;
  webcamVideo.srcObject = null;

  stopStream(oldScreenStream);
  stopStream(oldWebcamStream);

  if (!recording) {
    stopStream(state.canvasCaptureStream);
    state.canvasCaptureStream = null;
    clearLastScreenFrame();
    setStatus(sourcesStatus, "idle");
    setStatus(recordingStatus, "idle");
    setCaptureHint("Ready to request screen, camera, and microphone permissions.", "idle");
  } else {
    setStatus(sourcesStatus, "sources stopped, recording continues");
  }
  refreshControlState();
}

function resetExportState() {
  if (state.recordedPreviewUrl) {
    URL.revokeObjectURL(state.recordedPreviewUrl);
  }
  state.recordedPreviewUrl = "";
  state.recordedBlob = null;
  state.recordingDurationMs = 0;
  state.export.trimStartMs = 0;
  state.export.trimEndMs = 0;
  state.export.lastVideoPath = "";
  state.export.lastGifPath = "";
  recordingPreviewVideo.removeAttribute("src");
  recordingPreviewVideo.load();
  exportResult.hidden = true;
  exportPaths.textContent = "";
  exportPanel.dataset.ready = "false";
}

function syncTrimWindow(durationMs) {
  const safeDuration = Math.max(0, durationMs);
  trimStartRange.max = String(safeDuration);
  trimEndRange.max = String(safeDuration);
  trimStartRange.step = "100";
  trimEndRange.step = "100";

  const defaultEnd = safeDuration <= DEFAULT_GIF_DURATION_MS ? safeDuration : DEFAULT_GIF_DURATION_MS;
  state.export.trimStartMs = 0;
  state.export.trimEndMs = defaultEnd;
  trimStartRange.value = String(state.export.trimStartMs);
  trimEndRange.value = String(state.export.trimEndMs);
}

function refreshTrimReadouts() {
  trimStartValue.textContent = formatDuration(state.export.trimStartMs);
  trimEndValue.textContent = formatDuration(state.export.trimEndMs);
  recordedDurationValue.textContent = formatDuration(state.recordingDurationMs);
  clipDurationValue.textContent = formatDuration(Math.max(0, state.export.trimEndMs - state.export.trimStartMs));
}

function validateClipWindow() {
  const clipDuration = state.export.trimEndMs - state.export.trimStartMs;
  if (clipDuration <= 0) {
    return "Trim end must be after trim start.";
  }
  if (clipDuration > MAX_GIF_DURATION_MS) {
    return "GIF clip must be 15 seconds or shorter.";
  }
  return "";
}

function refreshExportUi() {
  const ready = Boolean(state.recordedBlob);
  exportPanel.dataset.ready = ready ? "true" : "false";
  exportPlaceholder.hidden = ready;
  refreshTrimReadouts();

  const validationError = ready ? validateClipWindow() : "";
  const desktopRequired = state.platformMode !== "desktop";
  exportBundleBtn.disabled = !ready || state.export.exporting || desktopRequired || Boolean(validationError);

  if (!ready) {
    setExportStatus("The default GIF clip is capped at 15 seconds.", "idle");
    return;
  }
  if (desktopRequired) {
    setExportStatus("GIF export requires Frameforge Desktop. Open this route inside the desktop shell.", "error");
    return;
  }
  if (validationError) {
    setExportStatus(validationError, "error");
    return;
  }
  if (!state.export.exporting && !state.export.lastVideoPath) {
    const preset = GIF_PRESETS[gifPresetSelect.value] || GIF_PRESETS.medium;
    setExportStatus(`Ready to export ${preset.label.toLowerCase()} GIF and source video.`, "ok");
  }
}

function captureRecordingBlob() {
  if (state.recordedChunks.length === 0) {
    return;
  }
  const finalMime = state.activeMimeType || "video/webm";
  state.recordedBlob = new Blob(state.recordedChunks, { type: finalMime });
  state.recordedPreviewUrl = URL.createObjectURL(state.recordedBlob);
  recordingPreviewVideo.src = state.recordedPreviewUrl;
  recordingPreviewVideo.load();
  syncTrimWindow(state.recordingDurationMs);
  refreshExportUi();
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Could not encode recording."));
    reader.readAsDataURL(blob);
  });
}

function sanitizeBaseName(value) {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "frameforge-demo";
}

async function exportBundle() {
  if (!state.recordedBlob || state.export.exporting) {
    return;
  }
  const clipError = validateClipWindow();
  if (clipError) {
    setExportStatus(clipError, "error");
    refreshExportUi();
    return;
  }
  if (state.platformMode !== "desktop") {
    setExportStatus("GIF export requires Frameforge Desktop.", "error");
    return;
  }

  state.export.exporting = true;
  refreshControlState();
  setExportStatus("Preparing video and GIF export...", "pending");
  exportBundleBtn.textContent = "Exporting...";

  try {
    const preset = GIF_PRESETS[gifPresetSelect.value] || GIF_PRESETS.medium;
    const videoBase64 = await blobToBase64(state.recordedBlob);
    const result = await exportDemoMedia({
      videoBytesBase64: videoBase64,
      videoExtension: state.activeExtension || "webm",
      suggestedBaseName: sanitizeBaseName(videoNameInput.value),
      gifStartMs: Math.round(state.export.trimStartMs),
      gifEndMs: Math.round(state.export.trimEndMs),
      gifWidth: preset.width,
      gifFps: preset.fps,
    });

    if (result?.canceled) {
      setExportStatus("Export canceled. Your recording is still ready to export.", "idle");
      return;
    }

    state.export.lastVideoPath = result.videoPath || "";
    state.export.lastGifPath = result.gifPath || "";
    exportResult.hidden = false;
    exportPaths.textContent = [state.export.lastVideoPath, state.export.lastGifPath].filter(Boolean).join("\n");

    if (result?.gifError) {
      setExportStatus(`Saved video, but GIF export failed: ${result.gifError}`, "error");
      return;
    }

    setExportStatus("Saved demo video and generated GIF.", "ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not export Demo Maker assets.";
    setExportStatus(message, "error");
  } finally {
    state.export.exporting = false;
    exportBundleBtn.textContent = "Export Video + GIF";
    refreshControlState();
  }
}

async function startRecording() {
  if (!state.screenStream || !state.webcamStream) {
    setStatus(recordingStatus, "missing sources");
    return;
  }
  try {
    if (state.mediaRecorder && state.mediaRecorder.state === "recording") {
      return;
    }
    if (typeof window.MediaRecorder === "undefined") {
      throw new Error("MediaRecorder is not available in this browser.");
    }

    resetExportState();
    const fps = Number.parseInt(fpsSelect.value, 10);
    if (state.canvasCaptureStream) {
      stopStream(state.canvasCaptureStream);
      state.canvasCaptureStream = null;
    }
    state.canvasCaptureStream = canvas.captureStream(fps);

    const composed = new MediaStream();
    const [canvasTrack] = state.canvasCaptureStream.getVideoTracks();
    if (canvasTrack) {
      composed.addTrack(canvasTrack);
    }
    const audioTracks = state.webcamStream.getAudioTracks();
    if (audioTracks.length === 0) {
      throw new Error("Microphone track is missing.");
    }
    for (const audioTrack of audioTracks) {
      composed.addTrack(audioTrack);
    }

    const profile = getRecordingProfile();
    state.activeMimeType = profile.mimeType;
    state.activeExtension = profile.extension;
    state.recordedChunks = [];
    state.mediaRecorder = new MediaRecorder(composed, { mimeType: profile.mimeType });

    state.mediaRecorder.addEventListener("error", (event) => {
      const msg = event.error?.message || "recorder error";
      setStatus(recordingStatus, `error: ${msg}`);
    });

    state.mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) {
        state.recordedChunks.push(event.data);
      }
    });

    state.mediaRecorder.addEventListener(
      "stop",
      async () => {
        if (state.recordingTimerId) {
          window.clearInterval(state.recordingTimerId);
          state.recordingTimerId = 0;
        }
        state.recordingDurationMs = state.recordingStartedAt ? Date.now() - state.recordingStartedAt : 0;
        state.recordingStartedAt = 0;
        updateElapsedClock();
        await releaseWakeLock();
        stopStream(state.canvasCaptureStream);
        state.canvasCaptureStream = null;
        captureRecordingBlob();
        state.recordedChunks = [];
        state.mediaRecorder = null;
        setStatus(recordingStatus, "ready to export");
        refreshControlState();
      },
      { once: true }
    );

    state.mediaRecorder.start(1000);
    state.recordingStartedAt = Date.now();
    updateElapsedClock();
    if (state.recordingTimerId) {
      window.clearInterval(state.recordingTimerId);
    }
    state.recordingTimerId = window.setInterval(updateElapsedClock, 250);
    setStatus(recordingStatus, `recording ${state.activeExtension.toUpperCase()}`);
    await acquireWakeLock();
    refreshControlState();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start recording.";
    setStatus(recordingStatus, `error: ${message}`);
    await releaseWakeLock();
    stopStream(state.canvasCaptureStream);
    state.canvasCaptureStream = null;
    refreshControlState();
  }
}

function stopRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state === "recording") {
    setStatus(recordingStatus, "finalizing...");
    state.mediaRecorder.stop();
  }
  refreshControlState();
}

function pointerToCanvas(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function handleTrimStartInput() {
  const nextStart = Number.parseInt(trimStartRange.value, 10);
  state.export.trimStartMs = Math.max(0, Math.min(nextStart, state.export.trimEndMs - 100));
  trimStartRange.value = String(state.export.trimStartMs);
  refreshExportUi();
}

function handleTrimEndInput() {
  const nextEnd = Number.parseInt(trimEndRange.value, 10);
  state.export.trimEndMs = Math.min(Math.max(nextEnd, state.export.trimStartMs + 100), state.recordingDurationMs);
  trimEndRange.value = String(state.export.trimEndMs);
  refreshExportUi();
}

canvas.addEventListener("pointerdown", (event) => {
  const point = pointerToCanvas(event);
  const target = getWebcamPointerTarget(point);
  if (target === "none") {
    return;
  }

  state.drag.active = true;
  state.drag.mode = target;
  state.drag.pointerId = event.pointerId;
  if (target === "move") {
    state.drag.offsetX = point.x - state.webcamOverlay.x;
    state.drag.offsetY = point.y - state.webcamOverlay.y;
    canvas.style.cursor = "grabbing";
  } else {
    state.drag.startX = point.x;
    state.drag.startY = point.y;
    state.drag.startWidth = state.webcamOverlay.width;
    canvas.style.cursor = "nwse-resize";
  }
  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
});

canvas.addEventListener("pointermove", (event) => {
  const point = pointerToCanvas(event);
  if (!state.drag.active || state.drag.pointerId !== event.pointerId) {
    updateCanvasCursor(point);
    return;
  }

  if (state.drag.mode === "move") {
    state.webcamOverlay.x = point.x - state.drag.offsetX;
    state.webcamOverlay.y = point.y - state.drag.offsetY;
    clampOverlayInsideCanvas();
    return;
  }

  const dx = point.x - state.drag.startX;
  const dy = point.y - state.drag.startY;
  const widthFromX = state.drag.startWidth + dx;
  const widthFromY = state.drag.startWidth + dy * WEBCAM_ASPECT;
  const useX = Math.abs(widthFromX - state.drag.startWidth) >= Math.abs(widthFromY - state.drag.startWidth);
  setOverlaySizeByWidth(useX ? widthFromX : widthFromY, { keepAnchor: true });
});

canvas.addEventListener("pointerup", (event) => {
  if (state.drag.active && state.drag.pointerId === event.pointerId) {
    clearWebcamDragState();
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    updateCanvasCursor(pointerToCanvas(event));
  }
});

canvas.addEventListener("pointercancel", () => {
  clearWebcamDragState();
  canvas.style.cursor = "default";
});

canvas.addEventListener("pointerleave", () => {
  if (!state.drag.active) {
    canvas.style.cursor = "default";
  }
});

startSourcesBtn.addEventListener("click", startSources);
stopSourcesBtn.addEventListener("click", stopSources);
replaceScreenBtn.addEventListener("click", replaceScreenSource);
startRecordBtn.addEventListener("click", startRecording);
stopRecordBtn.addEventListener("click", stopRecording);
reconnectMonitorBtn.addEventListener("click", connectDemoBridge);

resolutionSelect.addEventListener("change", () => {
  setCanvasResolution();
  resetExportState();
});

fpsSelect.addEventListener("change", () => {
  resetExportState();
});

cameraEnabledToggle.addEventListener("change", () => {
  state.webcamEnabled = cameraEnabledToggle.checked;
  if (!state.webcamEnabled) {
    clearWebcamDragState();
    canvas.style.cursor = "default";
  }
  refreshControlState();
});

webcamSizeRange.addEventListener("input", () => {
  setOverlaySizeFromSlider();
  updateSliderReadouts();
});

demoModeToggle.addEventListener("change", () => {
  updateDemoSettingsFromUi();
  syncDemoConfigToBridge();
  refreshDemoStatus();
});

triggerClickToggle.addEventListener("change", () => {
  updateDemoSettingsFromUi();
  syncDemoConfigToBridge();
  refreshDemoStatus();
});

triggerTypeToggle.addEventListener("change", () => {
  updateDemoSettingsFromUi();
  syncDemoConfigToBridge();
  refreshDemoStatus();
});

demoPresetSelect.addEventListener("change", () => {
  if (demoPresetSelect.value !== "custom") {
    setDemoPresetInUi(demoPresetSelect.value);
  }
  updateDemoSettingsFromUi();
  syncDemoConfigToBridge();
  refreshDemoStatus();
});

zoomStrengthRange.addEventListener("input", () => {
  updateDemoSettingsFromUi({ markCustom: true });
  syncDemoConfigToBridge();
  refreshDemoStatus();
});

zoomDurationRange.addEventListener("input", () => {
  updateDemoSettingsFromUi({ markCustom: true });
  syncDemoConfigToBridge();
  refreshDemoStatus();
});

cooldownRange.addEventListener("input", () => {
  updateDemoSettingsFromUi({ markCustom: true });
  syncDemoConfigToBridge();
  refreshDemoStatus();
});

typingHoldRange.addEventListener("input", () => {
  updateDemoSettingsFromUi({ markCustom: true });
  syncDemoConfigToBridge();
  refreshDemoStatus();
});

trimStartRange.addEventListener("input", handleTrimStartInput);
trimEndRange.addEventListener("input", handleTrimEndInput);
gifPresetSelect.addEventListener("change", refreshExportUi);
videoNameInput.addEventListener("input", () => {
  exportResult.hidden = true;
});
exportBundleBtn.addEventListener("click", exportBundle);

recordingPreviewVideo.addEventListener("loadedmetadata", () => {
  if (Number.isFinite(recordingPreviewVideo.duration) && recordingPreviewVideo.duration > 0) {
    state.recordingDurationMs = Math.round(recordingPreviewVideo.duration * 1000);
    syncTrimWindow(state.recordingDurationMs);
    refreshExportUi();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (isRecordingActive()) {
    event.preventDefault();
    event.returnValue = "";
  }
});

window.addEventListener("pagehide", () => {
  stopSources();
  state.demoBridge?.destroy();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && isRecordingActive()) {
    acquireWakeLock().catch(() => {});
  }
});

window.addEventListener("resize", () => {
  syncDemoConfigToBridge();
});

videoNameInput.value = buildSuggestedFilename("webm").replace(/\.webm$/, "");
updateDesktopPill();
setDemoPresetInUi(DEFAULT_DEMO_PRESET);
updateDemoSettingsFromUi();
setCanvasResolution();
updateSliderReadouts();
refreshControlState();
setCaptureHint(
  platformMode === "desktop"
    ? "Desktop mode: click Start Sources and approve macOS screen, camera, and microphone permissions."
    : "Web fallback: screen capture works here, but GIF export requires the desktop app.",
  "idle"
);
setStatus(sourcesStatus, "idle");
setStatus(recordingStatus, "idle");
updateElapsedClock();
refreshDemoStatus();

if (platformMode === "desktop") {
  connectDemoBridge().catch(() => {});
}
