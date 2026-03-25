import {
  advanceFreezeWatch,
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
import {
  createDesktopDemoBridge,
  exportDemoGif,
  isDesktopRuntime,
  openAccessibilitySettings,
  saveDemoVideo,
} from "./desktop-demo-bridge.mjs";

const canvas = document.getElementById("drCompositeCanvas");
const ctx = canvas.getContext("2d");

const screenVideo = document.getElementById("drScreenVideo");
const resultVideo = document.getElementById("drResultVideo");

const startSourcesBtn = document.getElementById("drStartSourcesBtn");
const replaceScreenBtn = document.getElementById("drReplaceScreenBtn");
const stopSourcesBtn = document.getElementById("drStopSourcesBtn");
const startRecordBtn = document.getElementById("drStartRecordBtn");
const stopRecordBtn = document.getElementById("drStopRecordBtn");
const reconnectMonitorBtn = document.getElementById("drReconnectMonitorBtn");

const sourcesStatus = document.getElementById("drSourcesStatus");
const recordingStatus = document.getElementById("drRecordingStatus");
const focusSummary = document.getElementById("drFocusSummary");
const elapsedTime = document.getElementById("drElapsedTime");
const eventSummary = document.getElementById("drEventSummary");
const monitorBadge = document.getElementById("drMonitorBadge");
const captureHint = document.getElementById("drCaptureHint");
const demoStatus = document.getElementById("drDemoStatus");

const demoModeToggle = document.getElementById("drDemoModeToggle");
const demoPresetSelect = document.getElementById("drDemoPresetSelect");
const triggerClickToggle = document.getElementById("drTriggerClickToggle");
const triggerTypeToggle = document.getElementById("drTriggerTypeToggle");
const zoomStrengthRange = document.getElementById("drZoomStrengthRange");
const zoomDurationRange = document.getElementById("drZoomDurationRange");
const cooldownRange = document.getElementById("drCooldownRange");
const typingHoldRange = document.getElementById("drTypingHoldRange");
const zoomStrengthValue = document.getElementById("drZoomStrengthValue");
const zoomDurationValue = document.getElementById("drZoomDurationValue");
const cooldownValue = document.getElementById("drCooldownValue");
const typingHoldValue = document.getElementById("drTypingHoldValue");
const resolutionSelect = document.getElementById("drResolutionSelect");
const fpsSelect = document.getElementById("drFpsSelect");
const previewFocusBtn = document.getElementById("drPreviewFocusBtn");
const openAccessibilityBtn = document.getElementById("drOpenAccessibilityBtn");

const resultEmpty = document.getElementById("drResultEmpty");
const resultReady = document.getElementById("drResultReady");
const recordedDuration = document.getElementById("drRecordedDuration");
const gifDuration = document.getElementById("drGifDuration");
const trimStartRange = document.getElementById("drTrimStartRange");
const trimEndRange = document.getElementById("drTrimEndRange");
const trimStartValue = document.getElementById("drTrimStartValue");
const trimEndValue = document.getElementById("drTrimEndValue");
const gifPresetSelect = document.getElementById("drGifPresetSelect");
const baseNameInput = document.getElementById("drBaseNameInput");
const saveVideoBtn = document.getElementById("drSaveVideoBtn");
const exportGifBtn = document.getElementById("drExportGifBtn");
const exportStatus = document.getElementById("drExportStatus");
const pathSummary = document.getElementById("drPathSummary");
const videoPath = document.getElementById("drVideoPath");
const gifPath = document.getElementById("drGifPath");

const GIF_PRESETS = {
  small: { width: 480, fps: 10, label: "Small" },
  medium: { width: 640, fps: 12, label: "Medium" },
  large: { width: 720, fps: 15, label: "Large" },
};

const MAX_GIF_DURATION_MS = 15_000;
const DEFAULT_GIF_DURATION_MS = 8_000;

const initialPreset = applyPreset(DEFAULT_DEMO_PRESET);

const state = {
  platformMode: isDesktopRuntime() ? "desktop" : "web",
  screenStream: null,
  mediaRecorder: null,
  recordedChunks: [],
  recordedBlob: null,
  recordedPreviewUrl: "",
  activeMimeType: "",
  activeExtension: "webm",
  canvasCaptureStream: null,
  drawFrameId: 0,
  drawFrameDriver: "idle",
  recordingStartedAt: 0,
  recordingTimerId: 0,
  recordingDurationMs: 0,
  wakeLock: null,
  sourceAction: "idle",
  screenSurfaceType: "unknown",
  hasLastScreenFrame: false,
  lastScreenFrameCanvas: null,
  lastScreenFrameCtx: null,
  screenFreezeWatch: {
    lastTime: null,
    lastTick: null,
    unchangedMs: 0,
    isFrozen: false,
  },
  freezeNoticeActive: false,
  demo: {
    enabled: true,
    triggerClick: true,
    triggerType: true,
    preset: initialPreset.preset,
    zoomStrength: initialPreset.zoomStrength,
    zoomDurationMs: initialPreset.zoomDurationMs,
    cooldownMs: initialPreset.cooldownMs,
    typingHoldMs: initialPreset.typingHoldMs,
  },
  demoTelemetry: {
    connected: false,
    armed: false,
    monitorStarted: false,
    accessibilityGranted: false,
    inputMonitoringGranted: false,
    nativeEventCount: 0,
    lastBridgeError: "",
    lastEventAt: 0,
    eventsReceived: 0,
    lastEventKind: "",
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
    focusStartX: 0.5,
    focusStartY: 0.5,
    focusTargetX: 0.5,
    focusTargetY: 0.5,
    kind: "click",
  },
  demoQueue: [],
  demoBridge: null,
  export: {
    trimStartMs: 0,
    trimEndMs: 0,
    savingVideo: false,
    exportingGif: false,
    lastVideoPath: "",
    lastGifPath: "",
  },
  previewFocusIndex: 0,
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

function setText(node, value) {
  node.textContent = value;
}

function setCaptureHint(message, tone = "idle") {
  captureHint.textContent = message;
  captureHint.dataset.tone = tone;
}

function setExportStatus(message, tone = "idle") {
  exportStatus.textContent = message;
  exportStatus.dataset.tone = tone;
}

function setMonitorBadge(message, tone = "idle") {
  monitorBadge.textContent = message;
  monitorBadge.dataset.tone = tone;
}

function refreshAccessibilityAction() {
  const shouldShow =
    state.platformMode === "desktop" &&
    (
      Boolean(state.demoTelemetry.lastBridgeError) ||
      !state.demoTelemetry.accessibilityGranted ||
      !state.demoTelemetry.inputMonitoringGranted ||
      !state.demoTelemetry.connected ||
      !state.demoTelemetry.eventsReceived
    );
  openAccessibilityBtn.hidden = !shouldShow;
}

function refreshEventSummary() {
  const count = state.demoTelemetry.eventsReceived;
  const lastKind = state.demoTelemetry.lastEventKind;

  if (!count) {
    eventSummary.textContent = "0 seen";
    return;
  }

  eventSummary.textContent = `${count} ${lastKind || "event"}`;
}

function hasLiveVideo(stream) {
  return Boolean(stream && stream.getVideoTracks().some((track) => track.readyState === "live"));
}

function isRecordingActive() {
  return Boolean(state.mediaRecorder && state.mediaRecorder.state === "recording");
}

function updateElapsedClock() {
  if (!state.recordingStartedAt) {
    elapsedTime.textContent = "00:00";
    return;
  }
  elapsedTime.textContent = formatDuration(Date.now() - state.recordingStartedAt);
}

function updateSliderReadouts() {
  zoomStrengthValue.textContent = `${zoomStrengthRange.value}%`;
  zoomDurationValue.textContent = `${zoomDurationRange.value}ms`;
  cooldownValue.textContent = `${cooldownRange.value}ms`;
  typingHoldValue.textContent = `${typingHoldRange.value}ms`;
}

function buildSuggestedBaseName() {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `demo-recorder-${stamp}`;
}

function sanitizeBaseName(value) {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "demo-recorder";
}

function refreshControls() {
  const hasScreen = hasLiveVideo(state.screenStream);
  const recording = isRecordingActive();
  const sourceBusy = state.sourceAction !== "idle";
  const hasResult = Boolean(state.recordedBlob);
  const gifError = hasResult ? validateTrimWindow() : "";

  startSourcesBtn.disabled = sourceBusy || recording || hasScreen;
  replaceScreenBtn.disabled = sourceBusy || !hasScreen;
  stopSourcesBtn.disabled = sourceBusy || recording || !hasScreen;
  startRecordBtn.disabled = sourceBusy || recording || !hasScreen;
  stopRecordBtn.disabled = !recording;
  resolutionSelect.disabled = hasScreen || recording;
  fpsSelect.disabled = hasScreen || recording;
  saveVideoBtn.disabled = !hasResult || recording || state.export.savingVideo || state.export.exportingGif;
  exportGifBtn.disabled =
    !hasResult || recording || state.export.savingVideo || state.export.exportingGif || Boolean(gifError);
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
    focusStartX: state.demoZoom.focusNormX || 0.5,
    focusStartY: state.demoZoom.focusNormY || 0.5,
    focusTargetX: state.demoZoom.focusNormX || 0.5,
    focusTargetY: state.demoZoom.focusNormY || 0.5,
    kind: "click",
  };
}

function clearDemoQueue() {
  state.demoQueue.length = 0;
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
    clearDemoQueue();
    resetDemoZoomState();
  }
}

function getMissingPermissionLabel() {
  const missing = [];
  if (!state.demoTelemetry.accessibilityGranted) {
    missing.push("Accessibility");
  }
  if (!state.demoTelemetry.inputMonitoringGranted) {
    missing.push("Input Monitoring");
  }
  return missing.join(" + ");
}

function handleDemoBridgeStatus(payload = {}) {
  state.demoTelemetry.connected = Boolean(payload.connected);
  state.demoTelemetry.armed = Boolean(payload.armed);
  state.demoTelemetry.monitorStarted = Boolean(payload.monitorStarted);
  state.demoTelemetry.accessibilityGranted = Boolean(payload.accessibilityGranted);
  state.demoTelemetry.inputMonitoringGranted = Boolean(payload.inputMonitoringGranted);
  state.demoTelemetry.nativeEventCount = Number(payload.nativeEventCount || 0);
  if (payload.lastError) {
    state.demoTelemetry.lastBridgeError = payload.lastError;
  } else {
    state.demoTelemetry.lastBridgeError = "";
  }
}

function refreshDemoStatus() {
  if (state.platformMode !== "desktop") {
    setMonitorBadge("desktop only", "warn");
    demoStatus.textContent = "Open this app inside the Tauri desktop shell.";
    demoStatus.dataset.tone = "error";
    focusSummary.textContent = "desktop only";
    refreshEventSummary();
    refreshAccessibilityAction();
    return;
  }

  if (!state.demo.enabled) {
    setMonitorBadge("auto focus off", "idle");
    demoStatus.textContent = "Auto focus is disabled. Recording keeps a steady frame.";
    demoStatus.dataset.tone = "idle";
    focusSummary.textContent = "off";
    refreshEventSummary();
    refreshAccessibilityAction();
    return;
  }

  if (!state.demoTelemetry.accessibilityGranted || !state.demoTelemetry.inputMonitoringGranted) {
    const missing = getMissingPermissionLabel() || "Desktop input access";
    setMonitorBadge("permission needed", "error");
    demoStatus.textContent = `${missing} is still blocked for Frameforge Demo Recorder. Allow it in macOS Privacy & Security, then reopen the app.`;
    demoStatus.dataset.tone = "error";
    focusSummary.textContent = "blocked";
    refreshEventSummary();
    refreshAccessibilityAction();
    return;
  }

  if (state.demoTelemetry.lastBridgeError) {
    setMonitorBadge("monitor issue", "error");
    demoStatus.textContent = state.demoTelemetry.lastBridgeError;
    demoStatus.dataset.tone = "error";
    focusSummary.textContent = "static";
    refreshEventSummary();
    refreshAccessibilityAction();
    return;
  }

  if (!state.demoTelemetry.connected) {
    setMonitorBadge("monitor offline", "warn");
    demoStatus.textContent = state.demoTelemetry.monitorStarted
      ? "Desktop monitor stopped receiving events. Reopen the app to re-arm auto focus."
      : "Desktop monitor is starting. Recording still works without auto focus.";
    demoStatus.dataset.tone = "warn";
    focusSummary.textContent = "static";
    refreshEventSummary();
    refreshAccessibilityAction();
    return;
  }

  if (state.demoZoom.active) {
    setMonitorBadge("focus live", "ready");
    demoStatus.textContent = `Following ${state.demoZoom.kind} interaction with ${state.demo.preset} timing.`;
    demoStatus.dataset.tone = "ok";
    focusSummary.textContent = state.demoZoom.kind;
    refreshEventSummary();
    refreshAccessibilityAction();
    return;
  }

  setMonitorBadge("monitor armed", "ready");
  demoStatus.textContent = state.demoTelemetry.eventsReceived
    ? "Watching for clicks and typing to trigger smooth focus."
    : state.demoTelemetry.nativeEventCount
      ? "Desktop events are flowing. The next interaction should trigger focus."
      : "Watching for clicks and typing. If nothing reacts, reopen the bundled app after granting macOS input permissions.";
  demoStatus.dataset.tone = "ok";
  focusSummary.textContent = state.demoTelemetry.lastEventAt ? "armed" : "waiting";
  refreshEventSummary();
  refreshAccessibilityAction();
}

function handleIncomingDemoEvent(rawEvent) {
  const event = normalizeDemoEvent(rawEvent);
  if (!event || !state.demo.enabled) {
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
  state.demoTelemetry.eventsReceived += 1;
  state.demoTelemetry.lastEventKind = event.kind;
  refreshEventSummary();
}

function triggerPreviewFocus(kind = "click") {
  const previewTargets = [
    { xNorm: 0.32, yNorm: 0.36 },
    { xNorm: 0.7, yNorm: 0.44 },
    { xNorm: 0.58, yNorm: 0.7 },
  ];
  const target = previewTargets[state.previewFocusIndex % previewTargets.length];
  state.previewFocusIndex += 1;

  handleIncomingDemoEvent({
    kind,
    t: Date.now(),
    xNorm: target.xNorm,
    yNorm: target.yNorm,
    intensity: kind === "type" ? 0.74 : 0.58,
  });
  refreshDemoStatus();
}

function updateDemoZoom(nowMs) {
  if (!state.demo.enabled) {
    clearDemoQueue();
    resetDemoZoomState({ keepCooldown: true });
    return;
  }

  if (!state.demoZoom.active && nowMs >= state.demoZoom.cooldownUntil && state.demoQueue.length > 0) {
    state.demoZoom = beginDemoZoom(state.demoZoom, state.demoQueue.shift(), state.demo, nowMs);
  }

  state.demoZoom = stepDemoZoom(state.demoZoom, state.demo, nowMs);
}

function ensureDemoBridge() {
  if (state.demoBridge) {
    return state.demoBridge;
  }

  state.demoBridge = createDesktopDemoBridge({
    onStatus: (payload) => {
      handleDemoBridgeStatus(payload);
      refreshDemoStatus();
    },
    onEvent: (payload) => {
      handleIncomingDemoEvent(payload);
    },
    onError: (payload) => {
      state.demoTelemetry.lastBridgeError = payload.message || "desktop bridge error";
      refreshDemoStatus();
    },
  });

  return state.demoBridge;
}

async function syncDemoConfigToBridge() {
  if (state.platformMode !== "desktop") {
    return;
  }

  const bridge = ensureDemoBridge();
  try {
    await bridge.setConfig({
      zoomStrength: state.demo.zoomStrength,
      zoomDurationMs: state.demo.zoomDurationMs,
      cooldownMs: state.demo.cooldownMs,
      typingHoldMs: state.demo.typingHoldMs,
      clickEnabled: state.demo.triggerClick,
      typeEnabled: state.demo.triggerType,
      screenWidth: window.screen?.width || 1920,
      screenHeight: window.screen?.height || 1080,
    });
  } catch (error) {
    state.demoTelemetry.lastBridgeError =
      error instanceof Error ? error.message : "Could not sync monitor configuration.";
    refreshDemoStatus();
  }
}

async function connectDemoBridge() {
  if (state.platformMode !== "desktop") {
    return;
  }

  demoStatus.textContent = "Connecting desktop input monitor…";
  demoStatus.dataset.tone = "pending";
  try {
    const bridge = ensureDemoBridge();
    const status = await bridge.connect();
    await syncDemoConfigToBridge();
    handleDemoBridgeStatus(status);
  } catch (error) {
    state.demoTelemetry.connected = false;
    state.demoTelemetry.lastBridgeError =
      error instanceof Error ? error.message : "Could not connect the desktop input monitor.";
  } finally {
    refreshDemoStatus();
  }
}

async function syncDemoEnabledToBridge() {
  if (state.platformMode !== "desktop") {
    return;
  }

  const bridge = ensureDemoBridge();
  try {
    const status = state.demo.enabled ? await bridge.connect() : await bridge.disarm();
    handleDemoBridgeStatus(status);
    if (state.demo.enabled) {
      await syncDemoConfigToBridge();
    }
  } catch (error) {
    state.demoTelemetry.lastBridgeError =
      error instanceof Error ? error.message : "Could not update desktop monitor state.";
  } finally {
    refreshDemoStatus();
  }
}

function setCanvasResolution() {
  const [width, height] = resolutionSelect.value.split("x").map((item) => Number.parseInt(item, 10));
  canvas.width = width;
  canvas.height = height;
  ensureLastScreenFrameBuffer();
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
  state.lastScreenFrameCtx?.clearRect(0, 0, canvas.width, canvas.height);
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
    setText(sourcesStatus, "frozen");
    setCaptureHint("The screen appears frozen. Replace the source to continue cleanly.", "warn");
  } else if (!state.screenFreezeWatch.isFrozen && state.freezeNoticeActive) {
    state.freezeNoticeActive = false;
    if (hasLiveVideo(state.screenStream)) {
      setText(sourcesStatus, "ready");
      setCaptureHint("Screen source is live and ready for a short walkthrough.", "ok");
    }
  }
}

function drawAdjustedScreen(videoEl, targetCtx = ctx, demoEffect = { scale: 1, focusNormX: 0.5, focusNormY: 0.5 }) {
  const fitRect = getBaseScreenRect(videoEl.videoWidth, videoEl.videoHeight, canvas.width, canvas.height, "contain");
  if (!fitRect) {
    return;
  }

  let { x, y, width, height } = fitRect;
  const zoomScale = clampNumber(Number(demoEffect.scale) || 1, 1, 2);
  if (zoomScale > 1.001) {
    const focusNormX = clampNumber(Number(demoEffect.focusNormX) || 0.5, 0, 1);
    const focusNormY = clampNumber(Number(demoEffect.focusNormY) || 0.5, 0, 1);
    const focusX = x + width * focusNormX;
    const focusY = y + height * focusNormY;
    const nextWidth = width * zoomScale;
    const nextHeight = height * zoomScale;
    x = focusX - nextWidth * focusNormX;
    y = focusY - nextHeight * focusNormY;
    width = nextWidth;
    height = nextHeight;
  }

  targetCtx.drawImage(videoEl, x, y, width, height);
}

function snapshotCurrentScreenFrame(demoEffect) {
  ensureLastScreenFrameBuffer();
  if (!state.lastScreenFrameCtx) {
    return;
  }

  state.lastScreenFrameCtx.clearRect(0, 0, canvas.width, canvas.height);
  state.lastScreenFrameCtx.fillStyle = "#071018";
  state.lastScreenFrameCtx.fillRect(0, 0, canvas.width, canvas.height);
  drawAdjustedScreen(screenVideo, state.lastScreenFrameCtx, demoEffect);
  state.hasLastScreenFrame = true;
}

function drawEmptyState() {
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(237, 244, 255, 0.92)";
  ctx.font = '600 32px "Fraunces"';
  ctx.fillText("Choose a screen to start", 54, 86);
  ctx.fillStyle = "rgba(181, 196, 216, 0.9)";
  ctx.font = '500 19px "IBM Plex Sans"';
  ctx.fillText("Demo Recorder is optimized for short product walkthroughs and GIF-ready exports.", 54, 128);
  ctx.restore();
}

function renderSceneFrame() {
  const nowMs = performance.now();
  const previousStage = state.demoZoom.stage;
  updateDemoZoom(nowMs);
  const demoEffect = getDemoScreenEffect(state.demoZoom);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#071018";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const screenReady = screenVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  updateScreenFreezeWatch({ screenReady });
  const renderMode = getScreenRenderMode({
    screenReady,
    hasLastScreenFrame: state.hasLastScreenFrame,
  });

  if (renderMode === "live") {
    drawAdjustedScreen(screenVideo, ctx, demoEffect);
    snapshotCurrentScreenFrame(demoEffect);
  } else if (renderMode === "hold" && state.lastScreenFrameCanvas) {
    ctx.drawImage(state.lastScreenFrameCanvas, 0, 0, canvas.width, canvas.height);
  } else {
    drawEmptyState();
  }

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
  ctx.restore();

  if (previousStage !== state.demoZoom.stage) {
    refreshDemoStatus();
  }
}

function drawScene() {
  renderSceneFrame();
  scheduleNextFrame();
}

function cancelScheduledFrame() {
  if (!state.drawFrameId) {
    state.drawFrameDriver = "idle";
    return;
  }

  if (state.drawFrameDriver === "video" && typeof screenVideo.cancelVideoFrameCallback === "function") {
    screenVideo.cancelVideoFrameCallback(state.drawFrameId);
  } else {
    window.cancelAnimationFrame(state.drawFrameId);
  }

  state.drawFrameId = 0;
  state.drawFrameDriver = "idle";
}

function scheduleNextFrame() {
  if (state.drawFrameId) {
    return;
  }

  if (
    hasLiveVideo(state.screenStream) &&
    typeof screenVideo.requestVideoFrameCallback === "function" &&
    screenVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    state.drawFrameDriver = "video";
    state.drawFrameId = screenVideo.requestVideoFrameCallback(() => {
      state.drawFrameId = 0;
      drawScene();
    });
    return;
  }

  state.drawFrameDriver = "raf";
  state.drawFrameId = window.requestAnimationFrame(() => {
    state.drawFrameId = 0;
    drawScene();
  });
}

function startDrawLoop() {
  if (!state.drawFrameId) {
    drawScene();
  }
}

function stopDrawLoop() {
  cancelScheduledFrame();
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

function getScreenSurfaceType(stream) {
  const track = stream?.getVideoTracks?.()[0];
  if (!track || typeof track.getSettings !== "function") {
    return "unknown";
  }
  return track.getSettings().displaySurface || "unknown";
}

function assertCaptureApisAvailable() {
  if (typeof navigator.mediaDevices?.getDisplayMedia !== "function") {
    throw new Error("Screen capture is not available in this runtime.");
  }
}

function describeCaptureError(error, mode = "start") {
  if (!(error instanceof DOMException)) {
    return error instanceof Error ? error.message : `Failed to ${mode} source.`;
  }

  if (error.name === "AbortError") {
    return mode === "replace" ? "Screen selection canceled." : "Capture selection canceled.";
  }
  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    return "Permission denied. Enable Screen Recording for Frameforge Demo Recorder in macOS System Settings > Privacy & Security.";
  }
  if (error.name === "NotReadableError") {
    return "The source is busy or unavailable. Close other capture apps and retry.";
  }
  if (error.name === "InvalidStateError") {
    return "Capture must start from a direct button click in the active window.";
  }

  return error.message || `Failed to ${mode} source.`;
}

async function attachScreenStream(displayStream) {
  const previousStream = state.screenStream;
  state.screenStream = displayStream;
  state.screenSurfaceType = getScreenSurfaceType(displayStream);
  resetScreenFreezeWatch();
  screenVideo.srcObject = displayStream;
  await screenVideo.play();
  await waitForVideoReady(screenVideo);

  if (previousStream && previousStream !== displayStream) {
    stopStream(previousStream);
  }

  const [screenTrack] = displayStream.getVideoTracks();
  if (screenTrack) {
    const trackId = screenTrack.id;
    screenTrack.addEventListener(
      "ended",
      () => {
        const currentTrack = state.screenStream?.getVideoTracks?.()[0];
        if (!currentTrack || currentTrack.id !== trackId) {
          return;
        }

        resetScreenFreezeWatch();
        state.screenStream = null;
        state.screenSurfaceType = "unknown";
        screenVideo.srcObject = null;
        setText(sourcesStatus, isRecordingActive() ? "source lost" : "missing");
        setCaptureHint(
          isRecordingActive()
            ? "The source ended, but recording can continue with the last good frame. Replace the source when ready."
            : "The source ended. Replace the screen to keep going.",
          "warn"
        );
        refreshControls();
      },
      { once: true }
    );
  }
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
  } catch {
    // Non-fatal in desktop shells that do not expose wake lock.
  }
}

async function releaseWakeLock() {
  if (!state.wakeLock) {
    return;
  }
  try {
    await state.wakeLock.release();
  } catch {
    // Ignore release failures.
  } finally {
    state.wakeLock = null;
  }
}

function setSourceAction(action) {
  state.sourceAction = action;
  startSourcesBtn.textContent = action === "starting" ? "Requesting…" : "Start Source Capture";
  replaceScreenBtn.textContent = action === "replacing" ? "Selecting…" : "Replace Screen";
  refreshControls();
}

async function startSources() {
  setSourceAction("starting");
  try {
    assertCaptureApisAvailable();
    setText(sourcesStatus, "requesting");
    setCaptureHint("Choose the screen or window you want to turn into a short demo clip.", "pending");
    clearLastScreenFrame();
    resetScreenFreezeWatch();

    const fps = Number.parseInt(fpsSelect.value, 10);
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: fps, max: fps }, cursor: "always" },
      audio: false,
    });

    await attachScreenStream(displayStream);
    clearDemoQueue();
    resetDemoZoomState();
    setCanvasResolution();
    stopDrawLoop();
    startDrawLoop();

    setText(sourcesStatus, "ready");
    setText(recordingStatus, state.recordedBlob ? "ready to record" : "idle");
    setCaptureHint("Screen source is live. Record when you are ready.", "ok");
    refreshControls();
  } catch (error) {
    stopSources({ preserveResult: true });
    const message = describeCaptureError(error, "start");
    setText(sourcesStatus, "error");
    setCaptureHint(message, "error");
    console.error("[demo-recorder] startSources failed:", error);
  } finally {
    setSourceAction("idle");
  }
}

async function replaceScreenSource() {
  setSourceAction("replacing");
  try {
    assertCaptureApisAvailable();
    setText(sourcesStatus, "selecting");
    setCaptureHint("Choose a new screen to keep the current walkthrough moving.", "pending");

    const fps = Number.parseInt(fpsSelect.value, 10);
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: fps, max: fps }, cursor: "always" },
      audio: false,
    });

    await attachScreenStream(displayStream);
    clearDemoQueue();
    resetDemoZoomState();
    startDrawLoop();

    setText(sourcesStatus, "ready");
    setCaptureHint("Screen source replaced.", "ok");
    refreshControls();
  } catch (error) {
    const message = describeCaptureError(error, "replace");
    if (error instanceof DOMException && error.name === "AbortError") {
      setText(sourcesStatus, "ready");
      setCaptureHint(message, "idle");
      return;
    }
    setText(sourcesStatus, "error");
    setCaptureHint(message, "error");
    console.error("[demo-recorder] replaceScreenSource failed:", error);
  } finally {
    setSourceAction("idle");
  }
}

function stopSources({ preserveResult = true } = {}) {
  const recording = isRecordingActive();
  resetScreenFreezeWatch();

  if (!recording) {
    stopDrawLoop();
  }

  const previousScreenStream = state.screenStream;
  state.screenStream = null;
  state.screenSurfaceType = "unknown";
  screenVideo.srcObject = null;
  stopStream(previousScreenStream);

  if (!recording) {
    stopStream(state.canvasCaptureStream);
    state.canvasCaptureStream = null;
    clearLastScreenFrame();
    setText(sourcesStatus, "idle");
    setText(recordingStatus, preserveResult && state.recordedBlob ? "ready to export" : "idle");
    setCaptureHint("Choose a screen or window to start the next walkthrough.", "idle");
    renderSceneFrame();
  } else {
    setText(sourcesStatus, "recording without source");
    setCaptureHint("The source was stopped. Recording continues from the last good frame.", "warn");
  }

  refreshControls();
}

function getRecordingProfile() {
  const candidates = [
    { mimeType: "video/webm;codecs=vp9", extension: "webm" },
    { mimeType: "video/webm;codecs=vp8", extension: "webm" },
    { mimeType: "video/webm", extension: "webm" },
  ];

  const supported = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate.mimeType));
  if (!supported) {
    throw new Error("This runtime does not support WebM recording.");
  }
  return supported;
}

function resetRecordedResult() {
  if (state.recordedPreviewUrl) {
    URL.revokeObjectURL(state.recordedPreviewUrl);
  }

  state.recordedPreviewUrl = "";
  state.recordedBlob = null;
  state.recordedChunks = [];
  state.recordingDurationMs = 0;
  state.export.trimStartMs = 0;
  state.export.trimEndMs = 0;
  state.export.lastVideoPath = "";
  state.export.lastGifPath = "";
  resultVideo.removeAttribute("src");
  resultVideo.load();
  videoPath.textContent = "Not saved yet";
  gifPath.textContent = "Not exported yet";
  pathSummary.hidden = true;
  refreshResultUi();
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
  trimStartRange.value = "0";
  trimEndRange.value = String(defaultEnd);
}

function refreshTrimReadouts() {
  trimStartValue.textContent = formatDuration(state.export.trimStartMs);
  trimEndValue.textContent = formatDuration(state.export.trimEndMs);
  recordedDuration.textContent = formatDuration(state.recordingDurationMs);
  gifDuration.textContent = formatDuration(Math.max(0, state.export.trimEndMs - state.export.trimStartMs));
}

function validateTrimWindow() {
  const clipDuration = state.export.trimEndMs - state.export.trimStartMs;
  if (clipDuration <= 0) {
    return "Trim end must be after trim start.";
  }
  if (clipDuration > MAX_GIF_DURATION_MS) {
    return "GIF clips are capped at 15 seconds for V1.";
  }
  return "";
}

function refreshResultUi() {
  const hasResult = Boolean(state.recordedBlob);
  resultEmpty.hidden = hasResult;
  resultReady.hidden = !hasResult;
  refreshTrimReadouts();

  if (!hasResult) {
    setExportStatus("Save the video first, or export a clipped GIF directly from this same recording.", "idle");
    refreshControls();
    return;
  }

  const trimError = validateTrimWindow();
  if (trimError) {
    setExportStatus(trimError, "error");
  } else if (state.export.exportingGif) {
    setExportStatus("Generating GIF from the trimmed clip…", "pending");
  } else if (state.export.savingVideo) {
    setExportStatus("Saving the finished video…", "pending");
  } else {
    const preset = GIF_PRESETS[gifPresetSelect.value] || GIF_PRESETS.medium;
    setExportStatus(`Ready to save the source video or export a ${preset.label.toLowerCase()} GIF.`, "ok");
  }

  if (state.export.lastVideoPath || state.export.lastGifPath) {
    pathSummary.hidden = false;
  }

  refreshControls();
}

function captureRecordingBlob() {
  if (state.recordedChunks.length === 0) {
    return;
  }

  const finalMime = state.activeMimeType || "video/webm";
  state.recordedBlob = new Blob(state.recordedChunks, { type: finalMime });
  state.recordedPreviewUrl = URL.createObjectURL(state.recordedBlob);
  resultVideo.src = state.recordedPreviewUrl;
  resultVideo.load();
  syncTrimWindow(state.recordingDurationMs);
  refreshResultUi();
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Could not encode the recording."));
    reader.readAsDataURL(blob);
  });
}

async function handleSaveVideo() {
  if (!state.recordedBlob || state.export.savingVideo) {
    return;
  }

  state.export.savingVideo = true;
  refreshControls();
  refreshResultUi();

  try {
    const result = await saveDemoVideo({
      videoBytesBase64: await blobToBase64(state.recordedBlob),
      videoExtension: state.activeExtension || "webm",
      suggestedBaseName: sanitizeBaseName(baseNameInput.value),
    });

    if (result?.canceled) {
      setExportStatus("Video save canceled. The recording is still ready to export.", "idle");
      return;
    }

    state.export.lastVideoPath = result?.videoPath || "";
    videoPath.textContent = state.export.lastVideoPath || "Saved";
    pathSummary.hidden = false;
    setExportStatus("Video saved successfully.", "ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the video.";
    setExportStatus(message, "error");
  } finally {
    state.export.savingVideo = false;
    refreshResultUi();
  }
}

async function handleExportGif() {
  if (!state.recordedBlob || state.export.exportingGif) {
    return;
  }

  const trimError = validateTrimWindow();
  if (trimError) {
    setExportStatus(trimError, "error");
    refreshResultUi();
    return;
  }

  state.export.exportingGif = true;
  refreshControls();
  refreshResultUi();

  try {
    const preset = GIF_PRESETS[gifPresetSelect.value] || GIF_PRESETS.medium;
    const result = await exportDemoGif({
      videoBytesBase64: await blobToBase64(state.recordedBlob),
      videoExtension: state.activeExtension || "webm",
      suggestedBaseName: sanitizeBaseName(baseNameInput.value),
      gifStartMs: Math.round(state.export.trimStartMs),
      gifEndMs: Math.round(state.export.trimEndMs),
      gifWidth: preset.width,
      gifFps: preset.fps,
    });

    if (result?.canceled) {
      setExportStatus("GIF export canceled. The recording is still intact.", "idle");
      return;
    }

    state.export.lastGifPath = result?.gifPath || "";
    gifPath.textContent = state.export.lastGifPath || "Exported";
    pathSummary.hidden = false;
    setExportStatus("GIF exported successfully.", "ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not export the GIF.";
    setExportStatus(message, "error");
  } finally {
    state.export.exportingGif = false;
    refreshResultUi();
  }
}

async function startRecording() {
  if (!state.screenStream) {
    setText(recordingStatus, "missing source");
    return;
  }

  try {
    if (state.mediaRecorder?.state === "recording") {
      return;
    }

    if (typeof window.MediaRecorder === "undefined") {
      throw new Error("MediaRecorder is not available in this runtime.");
    }

    resetRecordedResult();

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

    const profile = getRecordingProfile();
    state.activeMimeType = profile.mimeType;
    state.activeExtension = profile.extension;
    state.recordedChunks = [];
    state.mediaRecorder = new MediaRecorder(composed, { mimeType: profile.mimeType });

    state.mediaRecorder.addEventListener("error", (event) => {
      const message = event.error?.message || "recorder error";
      setText(recordingStatus, `error: ${message}`);
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
        setText(recordingStatus, "ready to export");
        refreshControls();
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
    setText(recordingStatus, "recording");
    setCaptureHint("Recording the composed demo scene. Stop when the clip feels tight.", "ok");
    await acquireWakeLock();
    refreshControls();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start recording.";
    setText(recordingStatus, "error");
    setCaptureHint(message, "error");
    stopStream(state.canvasCaptureStream);
    state.canvasCaptureStream = null;
    await releaseWakeLock();
    refreshControls();
  }
}

function stopRecording() {
  if (state.mediaRecorder?.state === "recording") {
    setText(recordingStatus, "finalizing");
    setCaptureHint("Finalizing the clip and preparing preview + export.", "pending");
    state.mediaRecorder.stop();
  }
  refreshControls();
}

function handleTrimStartInput() {
  const nextValue = Number.parseInt(trimStartRange.value, 10);
  state.export.trimStartMs = Math.max(0, Math.min(nextValue, state.export.trimEndMs - 100));
  trimStartRange.value = String(state.export.trimStartMs);
  refreshResultUi();
}

function handleTrimEndInput() {
  const nextValue = Number.parseInt(trimEndRange.value, 10);
  state.export.trimEndMs = Math.min(Math.max(nextValue, state.export.trimStartMs + 100), state.recordingDurationMs);
  trimEndRange.value = String(state.export.trimEndMs);
  refreshResultUi();
}

startSourcesBtn.addEventListener("click", startSources);
replaceScreenBtn.addEventListener("click", replaceScreenSource);
stopSourcesBtn.addEventListener("click", () => stopSources({ preserveResult: true }));
startRecordBtn.addEventListener("click", startRecording);
stopRecordBtn.addEventListener("click", stopRecording);
reconnectMonitorBtn.addEventListener("click", connectDemoBridge);

demoModeToggle.addEventListener("change", () => {
  updateDemoSettingsFromUi();
  syncDemoEnabledToBridge();
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

resolutionSelect.addEventListener("change", () => {
  setCanvasResolution();
  if (!isRecordingActive() && !state.drawFrameId) {
    renderSceneFrame();
  }
});

fpsSelect.addEventListener("change", refreshControls);
trimStartRange.addEventListener("input", handleTrimStartInput);
trimEndRange.addEventListener("input", handleTrimEndInput);
gifPresetSelect.addEventListener("change", refreshResultUi);
previewFocusBtn.addEventListener("click", () => {
  triggerPreviewFocus("click");
});
openAccessibilityBtn.addEventListener("click", async () => {
  try {
    await openAccessibilitySettings();
  } catch (error) {
    state.demoTelemetry.lastBridgeError =
      error instanceof Error ? error.message : "Could not open macOS Input Monitoring settings.";
    refreshDemoStatus();
  }
});
baseNameInput.addEventListener("input", () => {
  state.export.lastVideoPath = "";
  state.export.lastGifPath = "";
  videoPath.textContent = "Not saved yet";
  gifPath.textContent = "Not exported yet";
  pathSummary.hidden = true;
  refreshResultUi();
});
saveVideoBtn.addEventListener("click", handleSaveVideo);
exportGifBtn.addEventListener("click", handleExportGif);

resultVideo.addEventListener("loadedmetadata", () => {
  if (Number.isFinite(resultVideo.duration) && resultVideo.duration > 0) {
    state.recordingDurationMs = Math.round(resultVideo.duration * 1000);
    syncTrimWindow(state.recordingDurationMs);
    refreshResultUi();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (isRecordingActive()) {
    event.preventDefault();
    event.returnValue = "";
  }
});

window.addEventListener("pagehide", () => {
  stopSources({ preserveResult: true });
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

baseNameInput.value = buildSuggestedBaseName();
setDemoPresetInUi(DEFAULT_DEMO_PRESET);
updateDemoSettingsFromUi();
setCanvasResolution();
updateSliderReadouts();
setText(sourcesStatus, "idle");
setText(recordingStatus, "idle");
setText(focusSummary, "static");
refreshEventSummary();
updateElapsedClock();
refreshResultUi();
setCaptureHint(
  state.platformMode === "desktop"
    ? "Choose a screen or window to start a short product demo. Auto focus will arm in the background."
    : "This workspace is desktop-only. Open it inside the Tauri shell to record demos.",
  state.platformMode === "desktop" ? "idle" : "error"
);
refreshControls();
refreshDemoStatus();
startDrawLoop();

if (state.platformMode === "desktop") {
  connectDemoBridge().catch(() => {});
}
