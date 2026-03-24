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
import { createDesktopDemoBridge, isDesktopRuntime } from "./desktop-demo-bridge.mjs";

const canvas = document.getElementById("compositeCanvas");
const ctx = canvas.getContext("2d");

const screenVideo = document.getElementById("screenVideo");
const webcamVideo = document.getElementById("webcamVideo");

const startSourcesBtn = document.getElementById("startSourcesBtn");
const stopSourcesBtn = document.getElementById("stopSourcesBtn");
const replaceScreenBtn = document.getElementById("replaceScreenBtn");
const startRecordBtn = document.getElementById("startRecordBtn");
const stopRecordBtn = document.getElementById("stopRecordBtn");
const downloadLink = document.getElementById("downloadLink");
const captureHint = document.getElementById("captureHint");
const togglePanelBtn = document.getElementById("togglePanelBtn");
const workspace = document.querySelector(".workspace");

const resolutionSelect = document.getElementById("resolutionSelect");
const fpsSelect = document.getElementById("fpsSelect");
const formatSelect = document.getElementById("formatSelect");
const screenFitSelect = document.getElementById("screenFitSelect");
const screenScaleRange = document.getElementById("screenScaleRange");
const screenXRange = document.getElementById("screenXRange");
const screenYRange = document.getElementById("screenYRange");
const screenScaleValue = document.getElementById("screenScaleValue");
const screenXValue = document.getElementById("screenXValue");
const screenYValue = document.getElementById("screenYValue");
const resetScreenBtn = document.getElementById("resetScreenBtn");
const webcamSizeRange = document.getElementById("webcamSizeRange");
const webcamShapeSelect = document.getElementById("webcamShapeSelect");
const cameraEnabledToggle = document.getElementById("cameraEnabledToggle");
const mirrorToggle = document.getElementById("mirrorToggle");
const webcamSizeValue = document.getElementById("webcamSizeValue");
const resetWebcamBtn = document.getElementById("resetWebcamBtn");
const demoModeToggle = document.getElementById("demoModeToggle");
const connectExtensionBtn = document.getElementById("connectExtensionBtn");
const demoResetBtn = document.getElementById("demoResetBtn");
const demoStatus = document.getElementById("demoStatus");
const demoPresetSelect = document.getElementById("demoPresetSelect");
const demoTriggerClickToggle = document.getElementById("demoTriggerClickToggle");
const demoTriggerTypeToggle = document.getElementById("demoTriggerTypeToggle");
const demoZoomStrengthRange = document.getElementById("demoZoomStrengthRange");
const demoZoomDurationRange = document.getElementById("demoZoomDurationRange");
const demoCooldownRange = document.getElementById("demoCooldownRange");
const demoTypingHoldRange = document.getElementById("demoTypingHoldRange");
const demoZoomStrengthValue = document.getElementById("demoZoomStrengthValue");
const demoZoomDurationValue = document.getElementById("demoZoomDurationValue");
const demoCooldownValue = document.getElementById("demoCooldownValue");
const demoTypingHoldValue = document.getElementById("demoTypingHoldValue");

const sourcesStatus = document.getElementById("sourcesStatus");
const recordingStatus = document.getElementById("recordingStatus");
const elapsedTime = document.getElementById("elapsedTime");
const recordingStartTime = document.getElementById("recordingStartTime");

const initialDemoPreset = applyPreset(DEFAULT_DEMO_PRESET);
const platformMode = isDesktopRuntime() ? "desktop" : "web";

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
  canvasCaptureStream: null,
  hasLastScreenFrame: false,
  lastScreenFrameCanvas: null,
  lastScreenFrameCtx: null,
  downloadUrl: "",
  fileWriter: null,
  writeQueue: Promise.resolve(),
  writingToDisk: false,
  bytesWritten: 0,
  diskWriteError: null,
  activeExtension: "mkv",
  activeMimeType: "",
  userRequestedStop: false,
  lastRecorderError: "",
  wakeLock: null,
  screenFreezeWatch: {
    lastTime: null,
    lastTick: null,
    unchangedMs: 0,
    isFrozen: false,
  },
  freezeNoticeActive: false,
  screenTransform: {
    fitMode: "contain",
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  },
  webcamOverlay: {
    x: 0,
    y: 0,
    width: 360,
    height: 202,
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
    lastEventAt: 0,
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
};

const WEBCAM_ASPECT = 16 / 9;

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function updateElapsedClock() {
  if (!state.recordingStartedAt) {
    elapsedTime.textContent = "00:00:00";
    return;
  }

  const elapsedSec = Math.floor((Date.now() - state.recordingStartedAt) / 1000);
  const hours = String(Math.floor(elapsedSec / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, "0");
  const seconds = String(elapsedSec % 60).padStart(2, "0");
  elapsedTime.textContent = `${hours}:${minutes}:${seconds}`;
}

function updateRecordingStartTime() {
  if (!state.recordingStartedAt) {
    recordingStartTime.textContent = "--:--:--";
    return;
  }

  const startedAt = new Date(state.recordingStartedAt);
  recordingStartTime.textContent = startedAt.toLocaleTimeString([], { hour12: false });
}

function setStatus(el, value) {
  el.textContent = value;
}

function isRecordingActive() {
  return Boolean(state.mediaRecorder && state.mediaRecorder.state === "recording");
}

function hasLiveVideo(stream) {
  return Boolean(stream && stream.getVideoTracks().some((track) => track.readyState === "live"));
}

function hasLiveSource(stream) {
  return Boolean(stream && stream.getTracks().some((track) => track.readyState === "live"));
}

function refreshControlState() {
  const hasScreen = hasLiveVideo(state.screenStream);
  const hasWebcam = hasLiveVideo(state.webcamStream);
  const hasAnySource = hasLiveSource(state.screenStream) || hasLiveSource(state.webcamStream);
  const recording = isRecordingActive();
  const controls = deriveControlState({ hasScreen, hasWebcam, hasAnySource, recording });
  const sourceBusy = state.sourceAction !== "idle";

  startSourcesBtn.disabled = sourceBusy || controls.startSourcesDisabled;
  stopSourcesBtn.disabled = sourceBusy || controls.stopSourcesDisabled;
  replaceScreenBtn.disabled = sourceBusy || controls.replaceScreenDisabled;
  startRecordBtn.disabled = controls.startRecordDisabled;
  stopRecordBtn.disabled = controls.stopRecordDisabled;
  resolutionSelect.disabled = controls.resolutionDisabled;
  fpsSelect.disabled = controls.fpsDisabled;
  formatSelect.disabled = controls.formatDisabled;
}

function setCaptureHint(message, tone = "idle") {
  if (!captureHint) {
    return;
  }
  captureHint.textContent = message;
  captureHint.dataset.tone = tone;
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

function describeCaptureError(error, mode = "start") {
  if (!(error instanceof DOMException)) {
    return error instanceof Error ? error.message : `Failed to ${mode} sources.`;
  }

  if (error.name === "AbortError") {
    return mode === "replace" ? "Screen selection canceled." : "Capture selection canceled.";
  }

  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    if (state.platformMode === "desktop") {
      return "Permission denied. Enable Screen Recording, Camera, and Microphone for Frameforge Desktop in macOS System Settings > Privacy & Security, then retry.";
    }
    return "Permission denied. Allow screen, camera, and microphone access in your browser and retry.";
  }

  if (error.name === "NotReadableError") {
    return "Capture device is busy or unavailable. Close other capture apps and retry.";
  }

  if (error.name === "InvalidStateError") {
    return "Capture request must be triggered by a direct user action. Click the button again in the active window.";
  }

  return error.message || `Failed to ${mode} sources.`;
}

function assertCaptureApisAvailable() {
  const missing = [];
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices) {
    missing.push("mediaDevices");
  } else {
    if (typeof mediaDevices.getDisplayMedia !== "function") {
      missing.push("getDisplayMedia");
    }
    if (typeof mediaDevices.getUserMedia !== "function") {
      missing.push("getUserMedia");
    }
  }

  if (missing.length === 0) {
    return;
  }

  const missingList = missing.join(", ");
  if (state.platformMode === "desktop") {
    throw new Error(
      `Desktop capture API unavailable (${missingList}). On macOS, relaunch Frameforge Desktop after enabling Screen Recording, Camera, and Microphone permissions in System Settings > Privacy & Security.`
    );
  }

  throw new Error(`This browser does not expose required capture APIs (${missingList}).`);
}

function assertDisplayCaptureApiAvailable() {
  if (typeof navigator.mediaDevices?.getDisplayMedia === "function") {
    return;
  }
  if (state.platformMode === "desktop") {
    throw new Error(
      "Desktop screen capture API unavailable (getDisplayMedia). Relaunch the desktop app after granting Screen Recording permission in macOS System Settings > Privacy & Security."
    );
  }
  throw new Error("This browser does not expose getDisplayMedia.");
}

async function acquireWakeLock() {
  if (!("wakeLock" in navigator)) {
    return;
  }
  if (state.wakeLock || !isRecordingActive()) {
    return;
  }

  try {
    const lock = await navigator.wakeLock.request("screen");
    state.wakeLock = lock;
    lock.addEventListener("release", () => {
      state.wakeLock = null;
      if (isRecordingActive() && document.visibilityState === "visible") {
        acquireWakeLock().catch(() => {
          // ignore auto-reacquire failure
        });
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
    // ignore release error
  } finally {
    state.wakeLock = null;
  }
}

function updateSliderReadouts() {
  screenScaleValue.textContent = `${screenScaleRange.value}%`;
  screenXValue.textContent = `${screenXRange.value}%`;
  screenYValue.textContent = `${screenYRange.value}%`;
  webcamSizeValue.textContent = `${webcamSizeRange.value}%`;
  demoZoomStrengthValue.textContent = `${demoZoomStrengthRange.value}%`;
  demoZoomDurationValue.textContent = `${demoZoomDurationRange.value}ms`;
  demoCooldownValue.textContent = `${demoCooldownRange.value}ms`;
  demoTypingHoldValue.textContent = `${demoTypingHoldRange.value}ms`;
}

function updateScreenTransformFromUi() {
  state.screenTransform.fitMode = screenFitSelect.value;
  state.screenTransform.scale = Number.parseInt(screenScaleRange.value, 10) / 100;
  state.screenTransform.offsetX = Number.parseInt(screenXRange.value, 10) / 100;
  state.screenTransform.offsetY = Number.parseInt(screenYRange.value, 10) / 100;
  updateSliderReadouts();
}

function setDemoStatus(text, tone = "idle") {
  demoStatus.textContent = text;
  const statusEl = demoStatus.closest(".demo-status");
  if (statusEl) {
    statusEl.dataset.state = tone;
  }
}

function getScreenSurfaceType(stream) {
  const track = stream?.getVideoTracks?.()[0];
  if (!track || typeof track.getSettings !== "function") {
    return "unknown";
  }
  const settings = track.getSettings();
  return settings.displaySurface || "unknown";
}

function isDemoSourceSupported() {
  if (state.platformMode === "desktop") {
    return true;
  }
  return state.screenSurfaceType === "browser";
}

function clearDemoQueue() {
  state.demoQueue.length = 0;
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

function setDemoPresetInUi(presetName) {
  const preset = applyPreset(presetName);
  demoPresetSelect.value = preset.preset;
  demoZoomStrengthRange.value = String(Math.round(preset.zoomStrength * 100));
  demoZoomDurationRange.value = String(preset.zoomDurationMs);
  demoCooldownRange.value = String(preset.cooldownMs);
  demoTypingHoldRange.value = String(preset.typingHoldMs);
  updateSliderReadouts();
}

function updateDemoSettingsFromUi({ markCustom = false } = {}) {
  if (markCustom && demoPresetSelect.value !== "custom") {
    demoPresetSelect.value = "custom";
  }

  state.demo.enabled = demoModeToggle.checked;
  state.demo.triggerClick = demoTriggerClickToggle.checked;
  state.demo.triggerType = demoTriggerTypeToggle.checked;
  state.demo.preset = demoPresetSelect.value;
  state.demo.zoomStrength = clampNumber(Number.parseInt(demoZoomStrengthRange.value, 10) / 100, 0.05, 0.9);
  state.demo.zoomDurationMs = clampNumber(Number.parseInt(demoZoomDurationRange.value, 10), 200, 4000);
  state.demo.cooldownMs = clampNumber(Number.parseInt(demoCooldownRange.value, 10), 0, 5000);
  state.demo.typingHoldMs = clampNumber(Number.parseInt(demoTypingHoldRange.value, 10), 200, 5000);
  updateSliderReadouts();

  if (!state.demo.enabled) {
    clearDemoQueue();
    resetDemoZoomState();
  }
}

function syncDemoConfigToBridge() {
  if (state.platformMode !== "desktop" || !state.demoBridge || typeof state.demoBridge.setConfig !== "function") {
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
      state.demoTelemetry.lastBridgeError = error instanceof Error ? error.message : "desktop bridge config failed";
      refreshDemoStatus();
    });
}

function resetDemoControls() {
  demoModeToggle.checked = true;
  demoTriggerClickToggle.checked = true;
  demoTriggerTypeToggle.checked = true;
  setDemoPresetInUi(DEFAULT_DEMO_PRESET);
  updateDemoSettingsFromUi();
  clearDemoQueue();
  resetDemoZoomState();
}

function handleDemoBridgeStatus(payload) {
  state.demoTelemetry.connected = Boolean(payload.connected);
  state.demoTelemetry.sourceTabArmed = Boolean(payload.armed);
  state.demoTelemetry.sourceTabId = payload.sourceTabId ?? null;
  state.demoTelemetry.sourceTabTitle = payload.sourceTabTitle || "";
  if (payload.lastError) {
    state.demoTelemetry.lastBridgeError = payload.lastError;
  } else if (payload.connected) {
    state.demoTelemetry.lastBridgeError = "";
  }
}

function refreshDemoStatus() {
  const sourceName =
    state.demoTelemetry.sourceTabTitle ||
    (state.demoTelemetry.sourceTabId ? `tab ${state.demoTelemetry.sourceTabId}` : "");
  if (state.platformMode === "desktop") {
    connectExtensionBtn.textContent = state.demoTelemetry.connected
      ? "Refresh Input Monitor"
      : "Enable Input Monitor";
  } else {
    connectExtensionBtn.textContent = state.demoTelemetry.connected ? "Refresh Extension Link" : "Connect Extension";
  }

  if (!state.demo.enabled) {
    setDemoStatus("demo mode off", "idle");
    return;
  }

  if (state.demoTelemetry.lastBridgeError) {
    const prefix = state.platformMode === "desktop" ? "desktop monitor error" : "extension error";
    setDemoStatus(`${prefix}: ${state.demoTelemetry.lastBridgeError}`, "error");
    return;
  }

  if (!state.demoTelemetry.connected) {
    if (state.platformMode === "desktop") {
      setDemoStatus("desktop monitor off - click Enable Input Monitor", "warn");
    } else {
      setDemoStatus("disconnected - click Connect Extension", "warn");
    }
    return;
  }

  if (!state.demoTelemetry.sourceTabArmed) {
    if (state.platformMode === "desktop") {
      setDemoStatus("connected, monitor idle", "warn");
    } else {
      setDemoStatus("connected, waiting for source tab", "warn");
    }
    return;
  }

  if (hasLiveVideo(state.screenStream) && !isDemoSourceSupported()) {
    setDemoStatus("unsupported source: use browser tab capture", "warn");
    return;
  }

  if (state.demoZoom.active) {
    setDemoStatus("auto-focus active", "ready");
    return;
  }

  if (sourceName) {
    if (state.platformMode === "desktop") {
      setDemoStatus("desktop input monitor active", "ready");
    } else {
      setDemoStatus(`armed on ${sourceName}`, "ready");
    }
    return;
  }

  if (state.platformMode === "desktop") {
    setDemoStatus("ready for global click + typing focus", "ready");
  } else {
    setDemoStatus("ready for click + typing focus", "ready");
  }
}

function handleIncomingDemoEvent(rawEvent) {
  const event = normalizeDemoEvent(rawEvent);
  if (!event) {
    return;
  }

  if (!state.demo.enabled || !isDemoSourceSupported()) {
    return;
  }

  if (event.kind === "click" && !state.demo.triggerClick) {
    return;
  }
  if (event.kind === "type" && !state.demo.triggerType) {
    return;
  }

  enqueueDemoEvent(state.demoQueue, event);
  state.demoTelemetry.lastEventAt = performance.now();
}

function updateDemoZoom(nowMs) {
  if (!state.demo.enabled || !isDemoSourceSupported()) {
    clearDemoQueue();
    resetDemoZoomState({ keepCooldown: true });
    return;
  }

  if (!state.demoZoom.active && nowMs >= state.demoZoom.cooldownUntil && state.demoQueue.length > 0) {
    const next = state.demoQueue.shift();
    state.demoZoom = beginDemoZoom(state.demoZoom, next, state.demo, nowMs);
  }

  state.demoZoom = stepDemoZoom(state.demoZoom, state.demo, nowMs);
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
  connectExtensionBtn.disabled = true;
  setDemoStatus(state.platformMode === "desktop" ? "starting desktop input monitor..." : "connecting extension...", "idle");
  try {
    const bridge = ensureDemoBridge();
    await bridge.connect();
    syncDemoConfigToBridge();
    const status = await bridge.getStatus();
    handleDemoBridgeStatus(status);
  } catch (error) {
    state.demoTelemetry.connected = false;
    state.demoTelemetry.lastBridgeError =
      error instanceof Error
        ? error.message
        : state.platformMode === "desktop"
          ? "Desktop input monitor connection failed."
          : "Extension bridge connection failed.";
  } finally {
    connectExtensionBtn.disabled = false;
    refreshDemoStatus();
  }
}

function destroyDemoBridge() {
  if (state.demoBridge) {
    if (typeof state.demoBridge.disarm === "function") {
      state.demoBridge.disarm().catch(() => {
        // ignore shutdown disarm errors
      });
    }
    state.demoBridge.destroy();
    state.demoBridge = null;
  }
}

function resetDownloadLink() {
  downloadLink.classList.remove("ready");
  downloadLink.removeAttribute("href");
  downloadLink.textContent = "Download Recording";
}

function revokeDownloadUrl() {
  if (state.downloadUrl) {
    URL.revokeObjectURL(state.downloadUrl);
    state.downloadUrl = "";
  }
}

function setCanvasResolution() {
  const [width, height] = resolutionSelect.value.split("x").map((n) => Number.parseInt(n, 10));
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
  if (!state.lastScreenFrameCtx) {
    return;
  }
  state.lastScreenFrameCtx.clearRect(0, 0, state.lastScreenFrameCanvas.width, state.lastScreenFrameCanvas.height);
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
  const maxPercent = Number.parseInt(webcamSizeRange.max, 10) || 70;
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

  const percent = Math.round((width / canvas.width) * 100);
  const clampedPercent = clampNumber(percent, minPercent, maxPercent);
  webcamSizeRange.value = String(clampedPercent);
  updateSliderReadouts();
}

function setOverlaySizeFromSlider() {
  const ratio = Number.parseInt(webcamSizeRange.value, 10) / 100;
  const width = canvas.width * ratio;
  setOverlaySizeByWidth(width);
}

function placeOverlayAtBottomRight() {
  const margin = Math.max(18, Math.round(canvas.width * 0.012));
  state.webcamOverlay.x = canvas.width - state.webcamOverlay.width - margin;
  state.webcamOverlay.y = canvas.height - state.webcamOverlay.height - margin;
  clampOverlayInsideCanvas();
}

function clampOverlayInsideCanvas() {
  const box = state.webcamOverlay;
  box.x = Math.min(Math.max(0, box.x), canvas.width - box.width);
  box.y = Math.min(Math.max(0, box.y), canvas.height - box.height);
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
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
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

function drawCircularPath(x, y, width, height) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const radius = Math.min(width, height) / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
}

function drawAdjustedScreen(
  videoEl,
  targetCtx = ctx,
  demoEffect = { scale: 1, focusNormX: 0.5, focusNormY: 0.5 }
) {
  const fitRect = getBaseScreenRect(
    videoEl.videoWidth,
    videoEl.videoHeight,
    canvas.width,
    canvas.height,
    state.screenTransform.fitMode
  );
  if (!fitRect) {
    return;
  }

  const scale = state.screenTransform.scale;
  const scaledWidth = fitRect.width * scale;
  const scaledHeight = fitRect.height * scale;
  const centerX = fitRect.x + fitRect.width / 2;
  const centerY = fitRect.y + fitRect.height / 2;
  const offsetXPx = state.screenTransform.offsetX * canvas.width;
  const offsetYPx = state.screenTransform.offsetY * canvas.height;

  const drawX = centerX - scaledWidth / 2 + offsetXPx;
  const drawY = centerY - scaledHeight / 2 + offsetYPx;

  let finalX = drawX;
  let finalY = drawY;
  let finalWidth = scaledWidth;
  let finalHeight = scaledHeight;

  const demoScale = clampNumber(Number(demoEffect.scale) || 1, 1, 2);
  if (demoScale > 1.001) {
    const focusNormX = clampNumber(Number(demoEffect.focusNormX) || 0.5, 0, 1);
    const focusNormY = clampNumber(Number(demoEffect.focusNormY) || 0.5, 0, 1);
    const focusX = drawX + scaledWidth * focusNormX;
    const focusY = drawY + scaledHeight * focusNormY;
    finalWidth = scaledWidth * demoScale;
    finalHeight = scaledHeight * demoScale;
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

function drawScene() {
  const nowMs = performance.now();
  const previousDemoStage = state.demoZoom.stage;
  updateDemoZoom(nowMs);
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
  } else {
    // Keep output visually stable when no screen frame is available.
  }

  if (state.webcamEnabled && webcamVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    const { x, y, width, height } = state.webcamOverlay;
    ctx.save();

    if (webcamShapeSelect.value === "circle") {
      drawCircularPath(x, y, width, height);
    } else {
      drawRoundedRectPath(x, y, width, height, 24);
    }
    ctx.clip();

    if (mirrorToggle.checked) {
      ctx.translate(x + width, y);
      ctx.scale(-1, 1);
      ctx.drawImage(webcamVideo, 0, 0, width, height);
    } else {
      ctx.drawImage(webcamVideo, x, y, width, height);
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 3;
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 12;
    if (webcamShapeSelect.value === "circle") {
      drawCircularPath(x, y, width, height);
    } else {
      drawRoundedRectPath(x, y, width, height, 24);
    }
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
  // Browsers do not expose native MKV recording via MediaRecorder.
  // We use a WebM-compatible stream and force MKV file export for user workflow consistency.
  const candidates = [
    { mimeType: "video/webm;codecs=vp9,opus", extension: "mkv", label: "MKV (VP9/Opus)" },
    { mimeType: "video/webm;codecs=vp8,opus", extension: "mkv", label: "MKV (VP8/Opus)" },
    { mimeType: "video/webm", extension: "mkv", label: "MKV (WebM-compatible)" },
  ];

  const supported = candidates.find((item) => MediaRecorder.isTypeSupported(item.mimeType));
  if (!supported) {
    throw new Error("MKV recording is not supported in this browser.");
  }
  return supported;
}

function buildSuggestedFilename(extension) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `frameforge-${stamp}.${extension}`;
}

function resetScreenControls() {
  screenFitSelect.value = "contain";
  screenScaleRange.value = "100";
  screenXRange.value = "0";
  screenYRange.value = "0";
  updateScreenTransformFromUi();
}

function resetWebcamControls() {
  webcamSizeRange.value = "24";
  webcamShapeSelect.value = "rounded";
  cameraEnabledToggle.checked = true;
  state.webcamEnabled = true;
  mirrorToggle.checked = true;
  setOverlaySizeFromSlider();
  placeOverlayAtBottomRight();
  updateSliderReadouts();
}

async function prepareRecordingSink(extension) {
  void extension;
  state.recordedChunks = [];
  state.writingToDisk = false;
  state.bytesWritten = 0;
  state.diskWriteError = null;
  state.writeQueue = Promise.resolve();
  state.fileWriter = null;
}

function queueDiskWrite(blobChunk) {
  if (!state.fileWriter) {
    return;
  }
  state.writeQueue = state.writeQueue
    .then(async () => {
      await state.fileWriter.write(blobChunk);
      state.bytesWritten += blobChunk.size;
    })
    .catch((error) => {
      if (!state.diskWriteError) {
        state.diskWriteError = error;
      }
    });
}

function setUiForSourceState(ready) {
  void ready;
  refreshControlState();
}

function setUiForRecordingState(isRecording) {
  void isRecording;
  refreshControlState();
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

function handleScreenTrackEnded(trackId) {
  const currentTrack = state.screenStream?.getVideoTracks()[0];
  if (!currentTrack || currentTrack.id !== trackId) {
    return;
  }

  resetScreenFreezeWatch();
  state.screenStream = null;
  state.screenSurfaceType = "unknown";
  clearDemoQueue();
  resetDemoZoomState();
  screenVideo.srcObject = null;
  refreshControlState();
  refreshDemoStatus();

  if (isRecordingActive()) {
    setStatus(sourcesStatus, "screen lost, recording continues - click Replace Screen");
  } else {
    setStatus(sourcesStatus, "screen lost - click Replace Screen");
  }
}

function handleWebcamTrackEnded(trackId) {
  const currentTrack = state.webcamStream?.getVideoTracks()[0];
  if (!currentTrack || currentTrack.id !== trackId) {
    return;
  }

  state.webcamStream = null;
  webcamVideo.srcObject = null;
  refreshControlState();

  if (isRecordingActive()) {
    setStatus(sourcesStatus, "webcam lost, recording continues without webcam");
  } else {
    setStatus(sourcesStatus, "webcam lost - restart sources");
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
        handleScreenTrackEnded(trackId);
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
        handleWebcamTrackEnded(trackId);
      },
      { once: true }
    );
  }
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

    clearDemoQueue();
    resetDemoZoomState();
    setCanvasResolution();
    stopDrawLoop();
    drawScene();

    setUiForSourceState(true);
    setUiForRecordingState(false);
    setStatus(sourcesStatus, "ready");
    setStatus(recordingStatus, "idle");
    setCaptureHint("Sources live. You can record now.", "ok");
    refreshDemoStatus();
  } catch (error) {
    stopSources();
    const message = describeCaptureError(error, "start");
    setStatus(sourcesStatus, `error: ${message}`);
    setCaptureHint(message, "error");
    console.error("[frameforge] startSources failed:", error);
    refreshDemoStatus();
  } finally {
    setSourceAction("idle");
  }
}

async function replaceScreenSource() {
  setSourceAction("replacing");
  try {
    assertDisplayCaptureApiAvailable();

    setStatus(sourcesStatus, "select a screen...");
    setCaptureHint("Choose the screen/window to replace.", "pending");
    const fps = Number.parseInt(fpsSelect.value, 10);
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: fps, max: fps }, cursor: "always" },
      audio: false,
    });

    await attachScreenStream(displayStream);
    clearDemoQueue();
    resetDemoZoomState();

    if (!state.drawFrameId) {
      drawScene();
    }

    setUiForSourceState(true);
    if (!isRecordingActive()) {
      setUiForRecordingState(false);
    }
    setStatus(sourcesStatus, "ready");
    setCaptureHint("Screen source replaced.", "ok");
    refreshDemoStatus();
  } catch (error) {
    const message = describeCaptureError(error, "replace");
    if (error instanceof DOMException && error.name === "AbortError") {
      setStatus(sourcesStatus, "screen selection canceled");
      setCaptureHint(message, "idle");
      refreshDemoStatus();
      return;
    }
    setStatus(sourcesStatus, `error: ${message}`);
    setCaptureHint(message, "error");
    console.error("[frameforge] replaceScreenSource failed:", error);
    refreshDemoStatus();
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
  }

  setUiForSourceState(false);
  if (!recording) {
    clearLastScreenFrame();
    setUiForRecordingState(false);
    setStatus(sourcesStatus, "idle");
    setStatus(recordingStatus, "idle");
    setCaptureHint("Ready to request screen, camera, and microphone permissions.", "idle");
    refreshDemoStatus();
    return;
  }

  setStatus(sourcesStatus, "sources stopped, recording continues");
  refreshDemoStatus();
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

    revokeDownloadUrl();
    resetDownloadLink();

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
    setStatus(recordingStatus, "prepare output...");

    try {
      await prepareRecordingSink(profile.extension);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus(recordingStatus, "save canceled");
        stopStream(state.canvasCaptureStream);
        state.canvasCaptureStream = null;
        return;
      }
      throw error;
    }

    state.activeMimeType = profile.mimeType;
    state.activeExtension = profile.extension;
    state.userRequestedStop = false;
    state.lastRecorderError = "";

    state.mediaRecorder = profile.mimeType
      ? new MediaRecorder(composed, { mimeType: profile.mimeType })
      : new MediaRecorder(composed);

    if (!state.activeMimeType && state.mediaRecorder.mimeType) {
      state.activeMimeType = state.mediaRecorder.mimeType;
    }
    state.activeExtension = "mkv";

    state.mediaRecorder.addEventListener("error", (event) => {
      const msg = event.error?.message || "recorder error";
      state.lastRecorderError = msg;
      setStatus(recordingStatus, `error: ${msg}`);
    });

    state.mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) {
        if (state.writingToDisk && state.fileWriter) {
          queueDiskWrite(event.data);
        } else {
          state.recordedChunks.push(event.data);
        }
      }
    });

    state.mediaRecorder.addEventListener(
      "stop",
      async () => {
        const wasUserStop = state.userRequestedStop;
        if (state.recordingTimerId) {
          window.clearInterval(state.recordingTimerId);
          state.recordingTimerId = 0;
        }
        state.recordingStartedAt = 0;
        updateElapsedClock();
        updateRecordingStartTime();

        await state.writeQueue;
        if (state.fileWriter) {
          try {
            await state.fileWriter.close();
          } catch (error) {
            if (!state.diskWriteError) {
              state.diskWriteError = error;
            }
          } finally {
            state.fileWriter = null;
          }
        }

        if (state.writingToDisk) {
          state.writingToDisk = false;
          if (state.diskWriteError) {
            const msg = state.diskWriteError instanceof Error ? state.diskWriteError.message : "disk write failed";
            setStatus(recordingStatus, `error: ${msg}`);
          } else {
            const sizeMb = Math.max(1, Math.round(state.bytesWritten / (1024 * 1024)));
            setStatus(recordingStatus, `saved to disk (${sizeMb} MB)`);
          }
        } else if (state.recordedChunks.length === 0) {
          setStatus(recordingStatus, "saved 0 bytes");
        } else {
          const finalMime = state.activeMimeType || "video/webm";
          const blob = new Blob(state.recordedChunks, { type: finalMime });
          const url = URL.createObjectURL(blob);
          revokeDownloadUrl();
          state.downloadUrl = url;

          downloadLink.href = url;
          downloadLink.download = buildSuggestedFilename(state.activeExtension);
          downloadLink.classList.add("ready");
          downloadLink.textContent = `Download Recording (${Math.round(blob.size / (1024 * 1024))} MB)`;
          // Try auto-download first; keep link visible as fallback if browser blocks it.
          downloadLink.click();
          setStatus(recordingStatus, "saved, download started");
        }

        state.recordedChunks = [];
        stopStream(state.canvasCaptureStream);
        state.canvasCaptureStream = null;
        await releaseWakeLock();

        if (!wasUserStop) {
          const suffix = state.lastRecorderError ? ` (${state.lastRecorderError})` : "";
          setStatus(recordingStatus, `stopped unexpectedly${suffix}`);
          setStatus(sourcesStatus, "capture interrupted by browser or OS - press Start Recording");
        }

        state.mediaRecorder = null;
        state.userRequestedStop = false;
        state.lastRecorderError = "";
        setUiForRecordingState(false);
      },
      { once: true }
    );

    state.mediaRecorder.start(1000);
    state.recordingStartedAt = Date.now();
    updateElapsedClock();
    updateRecordingStartTime();
    if (state.recordingTimerId) {
      window.clearInterval(state.recordingTimerId);
    }
    state.recordingTimerId = window.setInterval(updateElapsedClock, 250);

    setUiForRecordingState(true);
    await acquireWakeLock();
    const modeText = "auto-download mode";
    setStatus(recordingStatus, `recording ${state.activeExtension.toUpperCase()} (${modeText})`);
  } catch (error) {
    if (state.fileWriter) {
      try {
        await state.fileWriter.abort();
      } catch {
        // ignore abort cleanup failure
      }
    }
    state.fileWriter = null;
    state.writingToDisk = false;
    const message = error instanceof Error ? error.message : "Could not start recording.";
    setStatus(recordingStatus, `error: ${message}`);
    setUiForRecordingState(false);
    await releaseWakeLock();
    stopStream(state.canvasCaptureStream);
    state.canvasCaptureStream = null;
  }
}

function stopRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state === "recording") {
    state.userRequestedStop = true;
    setStatus(recordingStatus, "finalizing...");
    state.mediaRecorder.stop();
  }

  setUiForRecordingState(false);
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

canvas.addEventListener("pointerdown", (event) => {
  const p = pointerToCanvas(event);
  const target = getWebcamPointerTarget(p);
  if (target === "none") {
    return;
  }

  state.drag.active = true;
  state.drag.mode = target;
  state.drag.pointerId = event.pointerId;
  if (target === "move") {
    state.drag.offsetX = p.x - state.webcamOverlay.x;
    state.drag.offsetY = p.y - state.webcamOverlay.y;
    canvas.style.cursor = "grabbing";
  } else {
    state.drag.startX = p.x;
    state.drag.startY = p.y;
    state.drag.startWidth = state.webcamOverlay.width;
    canvas.style.cursor = "nwse-resize";
  }
  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
});

canvas.addEventListener("pointermove", (event) => {
  const p = pointerToCanvas(event);

  if (!state.drag.active || state.drag.pointerId !== event.pointerId) {
    updateCanvasCursor(p);
    return;
  }

  if (state.drag.mode === "move") {
    state.webcamOverlay.x = p.x - state.drag.offsetX;
    state.webcamOverlay.y = p.y - state.drag.offsetY;
    clampOverlayInsideCanvas();
    return;
  }

  const dx = p.x - state.drag.startX;
  const dy = p.y - state.drag.startY;
  const widthFromX = state.drag.startWidth + dx;
  const widthFromY = state.drag.startWidth + dy * WEBCAM_ASPECT;
  const useX = Math.abs(widthFromX - state.drag.startWidth) >= Math.abs(widthFromY - state.drag.startWidth);
  const nextWidth = useX ? widthFromX : widthFromY;
  setOverlaySizeByWidth(nextWidth, { keepAnchor: true });
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

resolutionSelect.addEventListener("change", () => {
  setCanvasResolution();
  resetDownloadLink();
  revokeDownloadUrl();
});

fpsSelect.addEventListener("change", () => {
  resetDownloadLink();
  revokeDownloadUrl();
});

formatSelect.addEventListener("change", () => {
  resetDownloadLink();
  revokeDownloadUrl();
});

screenFitSelect.addEventListener("change", () => {
  updateScreenTransformFromUi();
});

screenScaleRange.addEventListener("input", () => {
  updateScreenTransformFromUi();
});

screenXRange.addEventListener("input", () => {
  updateScreenTransformFromUi();
});

screenYRange.addEventListener("input", () => {
  updateScreenTransformFromUi();
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

demoTriggerClickToggle.addEventListener("change", () => {
  updateDemoSettingsFromUi();
  syncDemoConfigToBridge();
  refreshDemoStatus();
});

demoTriggerTypeToggle.addEventListener("change", () => {
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

demoZoomStrengthRange.addEventListener("input", () => {
  updateDemoSettingsFromUi({ markCustom: true });
  syncDemoConfigToBridge();
  refreshDemoStatus();
});

demoZoomDurationRange.addEventListener("input", () => {
  updateDemoSettingsFromUi({ markCustom: true });
  syncDemoConfigToBridge();
  refreshDemoStatus();
});

demoCooldownRange.addEventListener("input", () => {
  updateDemoSettingsFromUi({ markCustom: true });
  syncDemoConfigToBridge();
  refreshDemoStatus();
});

demoTypingHoldRange.addEventListener("input", () => {
  updateDemoSettingsFromUi({ markCustom: true });
  syncDemoConfigToBridge();
  refreshDemoStatus();
});

connectExtensionBtn.addEventListener("click", () => {
  connectDemoBridge();
});

demoResetBtn.addEventListener("click", () => {
  resetDemoControls();
  syncDemoConfigToBridge();
  refreshDemoStatus();
});

cameraEnabledToggle.addEventListener("change", () => {
  state.webcamEnabled = cameraEnabledToggle.checked;
  if (!state.webcamEnabled) {
    clearWebcamDragState();
    canvas.style.cursor = "default";
  }
});

resetScreenBtn.addEventListener("click", () => {
  resetScreenControls();
});

resetWebcamBtn.addEventListener("click", () => {
  resetWebcamControls();
});

togglePanelBtn.addEventListener("click", () => {
  workspace.classList.toggle("panel-hidden");
  const isHidden = workspace.classList.contains("panel-hidden");
  togglePanelBtn.textContent = isHidden ? "Show Settings" : "Focus Preview";
});

window.addEventListener("beforeunload", (event) => {
  if (isRecordingActive()) {
    event.preventDefault();
    event.returnValue = "";
  }
});

window.addEventListener("pagehide", () => {
  stopSources();
  destroyDemoBridge();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && isRecordingActive()) {
    acquireWakeLock().catch(() => {
      // ignore reacquire errors
    });
  }
});

window.addEventListener("resize", () => {
  syncDemoConfigToBridge();
});

setDemoPresetInUi(DEFAULT_DEMO_PRESET);
updateDemoSettingsFromUi();
setCanvasResolution();
updateScreenTransformFromUi();
updateSliderReadouts();
setUiForSourceState(false);
setUiForRecordingState(false);
updateElapsedClock();
updateRecordingStartTime();
state.webcamEnabled = cameraEnabledToggle.checked;
setCaptureHint(
  state.platformMode === "desktop"
    ? "Desktop mode: click Start Sources and approve macOS screen/camera/mic permissions when prompted."
    : "Click Start Sources to grant browser screen, camera, and microphone access.",
  "idle"
);
refreshDemoStatus();
