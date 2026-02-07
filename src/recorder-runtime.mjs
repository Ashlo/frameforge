import {
  advanceFreezeWatch,
  deriveControlState,
  getBaseScreenRect,
  getScreenRenderMode,
} from "./recorder-utils.mjs";

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
const mirrorToggle = document.getElementById("mirrorToggle");
const webcamSizeValue = document.getElementById("webcamSizeValue");
const resetWebcamBtn = document.getElementById("resetWebcamBtn");

const sourcesStatus = document.getElementById("sourcesStatus");
const recordingStatus = document.getElementById("recordingStatus");
const elapsedTime = document.getElementById("elapsedTime");
const recordingStartTime = document.getElementById("recordingStartTime");

const state = {
  screenStream: null,
  webcamStream: null,
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
  activeExtension: "webm",
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

  startSourcesBtn.disabled = controls.startSourcesDisabled;
  stopSourcesBtn.disabled = controls.stopSourcesDisabled;
  replaceScreenBtn.disabled = controls.replaceScreenDisabled;
  startRecordBtn.disabled = controls.startRecordDisabled;
  stopRecordBtn.disabled = controls.stopRecordDisabled;
  resolutionSelect.disabled = controls.resolutionDisabled;
  fpsSelect.disabled = controls.fpsDisabled;
  formatSelect.disabled = controls.formatDisabled;
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
}

function updateScreenTransformFromUi() {
  state.screenTransform.fitMode = screenFitSelect.value;
  state.screenTransform.scale = Number.parseInt(screenScaleRange.value, 10) / 100;
  state.screenTransform.offsetX = Number.parseInt(screenXRange.value, 10) / 100;
  state.screenTransform.offsetY = Number.parseInt(screenYRange.value, 10) / 100;
  updateSliderReadouts();
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
  if (!hasLiveVideo(state.webcamStream)) {
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

function drawAdjustedScreen(videoEl, targetCtx = ctx) {
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
  targetCtx.drawImage(videoEl, drawX, drawY, scaledWidth, scaledHeight);
}

function snapshotCurrentScreenFrame() {
  ensureLastScreenFrameBuffer();
  if (!state.lastScreenFrameCtx) {
    return;
  }

  state.lastScreenFrameCtx.clearRect(0, 0, state.lastScreenFrameCanvas.width, state.lastScreenFrameCanvas.height);
  state.lastScreenFrameCtx.fillStyle = "#0d1014";
  state.lastScreenFrameCtx.fillRect(0, 0, state.lastScreenFrameCanvas.width, state.lastScreenFrameCanvas.height);
  drawAdjustedScreen(screenVideo, state.lastScreenFrameCtx);
  state.hasLastScreenFrame = true;
}

function drawScene() {
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
    drawAdjustedScreen(screenVideo);
    snapshotCurrentScreenFrame();
  } else if (screenRenderMode === "hold" && state.lastScreenFrameCanvas) {
    ctx.drawImage(state.lastScreenFrameCanvas, 0, 0, canvas.width, canvas.height);
  } else {
    // Keep output visually stable when no screen frame is available.
  }

  if (webcamVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
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

  state.drawFrameId = window.requestAnimationFrame(drawScene);
}

function stopDrawLoop() {
  if (state.drawFrameId) {
    window.cancelAnimationFrame(state.drawFrameId);
    state.drawFrameId = 0;
  }
}

function getRecordingProfile() {
  const pref = formatSelect.value;
  const webmCandidates = [
    { mimeType: "video/webm;codecs=vp9,opus", extension: "webm", label: "WebM (VP9)" },
    { mimeType: "video/webm;codecs=vp8,opus", extension: "webm", label: "WebM (VP8)" },
    { mimeType: "video/webm", extension: "webm", label: "WebM" },
  ];
  const mp4Candidates = [
    { mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", extension: "mp4", label: "MP4 (H.264/AAC)" },
    { mimeType: "video/mp4", extension: "mp4", label: "MP4" },
  ];

  let candidates = webmCandidates;
  if (pref === "mp4") {
    candidates = mp4Candidates;
  } else if (pref === "auto") {
    candidates = [...webmCandidates, ...mp4Candidates];
  }

  const supported = candidates.find((item) => MediaRecorder.isTypeSupported(item.mimeType));
  if (supported) {
    return supported;
  }

  return {
    mimeType: "",
    extension: pref === "mp4" ? "mp4" : "webm",
    label: "Browser Default",
  };
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
  screenVideo.srcObject = null;
  refreshControlState();

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
  try {
    if (!navigator.mediaDevices?.getDisplayMedia || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support required media capture APIs.");
    }

    setStatus(sourcesStatus, "requesting permissions...");
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

    setCanvasResolution();
    stopDrawLoop();
    drawScene();

    setUiForSourceState(true);
    setUiForRecordingState(false);
    setStatus(sourcesStatus, "ready");
    setStatus(recordingStatus, "idle");
  } catch (error) {
    stopSources();
    const message = error instanceof Error ? error.message : "Failed to start sources.";
    setStatus(sourcesStatus, `error: ${message}`);
  }
}

async function replaceScreenSource() {
  try {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("This browser does not support screen capture.");
    }

    setStatus(sourcesStatus, "select a screen...");
    const fps = Number.parseInt(fpsSelect.value, 10);
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: fps, max: fps }, cursor: "always" },
      audio: false,
    });

    await attachScreenStream(displayStream);

    if (!state.drawFrameId) {
      drawScene();
    }

    setUiForSourceState(true);
    if (!isRecordingActive()) {
      setUiForRecordingState(false);
    }
    setStatus(sourcesStatus, "ready");
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      setStatus(sourcesStatus, "screen selection canceled");
      return;
    }
    const message = error instanceof Error ? error.message : "Failed to replace screen.";
    setStatus(sourcesStatus, `error: ${message}`);
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
    return;
  }

  setStatus(sourcesStatus, "sources stopped, recording continues");
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
    if (state.activeMimeType.includes("mp4")) {
      state.activeExtension = "mp4";
    } else if (state.activeMimeType.includes("webm")) {
      state.activeExtension = "webm";
    }

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
    state.drag.active = false;
    state.drag.mode = "none";
    state.drag.pointerId = null;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    updateCanvasCursor(pointerToCanvas(event));
  }
});

canvas.addEventListener("pointercancel", () => {
  state.drag.active = false;
  state.drag.mode = "none";
  state.drag.pointerId = null;
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
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && isRecordingActive()) {
    acquireWakeLock().catch(() => {
      // ignore reacquire errors
    });
  }
});

setCanvasResolution();
updateScreenTransformFromUi();
updateSliderReadouts();
setUiForSourceState(false);
setUiForRecordingState(false);
updateElapsedClock();
updateRecordingStartTime();
