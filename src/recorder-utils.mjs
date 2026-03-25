export function getBaseScreenRect(sourceWidth, sourceHeight, targetWidth, targetHeight, fitMode = "contain") {
  if (!sourceWidth || !sourceHeight || !targetWidth || !targetHeight) {
    return null;
  }

  if (fitMode === "stretch") {
    return {
      x: 0,
      y: 0,
      width: targetWidth,
      height: targetHeight,
    };
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  let drawWidth = targetWidth;
  let drawHeight = targetHeight;
  let drawX = 0;
  let drawY = 0;

  if (fitMode === "cover") {
    if (sourceAspect > targetAspect) {
      drawHeight = targetHeight;
      drawWidth = targetHeight * sourceAspect;
      drawX = (targetWidth - drawWidth) / 2;
    } else {
      drawWidth = targetWidth;
      drawHeight = targetWidth / sourceAspect;
      drawY = (targetHeight - drawHeight) / 2;
    }
  } else {
    if (sourceAspect > targetAspect) {
      drawWidth = targetWidth;
      drawHeight = targetWidth / sourceAspect;
      drawY = (targetHeight - drawHeight) / 2;
    } else {
      drawHeight = targetHeight;
      drawWidth = targetHeight * sourceAspect;
      drawX = (targetWidth - drawWidth) / 2;
    }
  }

  return {
    x: drawX,
    y: drawY,
    width: drawWidth,
    height: drawHeight,
  };
}

export function getScreenRenderMode({ screenReady, hasLastScreenFrame }) {
  if (screenReady) {
    return "live";
  }
  if (hasLastScreenFrame) {
    return "hold";
  }
  return "blank";
}

export function advanceFreezeWatch({
  active,
  previous,
  currentTime,
  nowMs,
  thresholdMs = 2000,
  epsilon = 0.0005,
}) {
  if (!active) {
    return {
      lastTime: null,
      lastTick: null,
      unchangedMs: 0,
      isFrozen: false,
    };
  }

  if (previous.lastTick === null || previous.lastTime === null) {
    return {
      lastTime: currentTime,
      lastTick: nowMs,
      unchangedMs: 0,
      isFrozen: false,
    };
  }

  const elapsed = Math.max(0, nowMs - previous.lastTick);
  const isSameFrameTime = Math.abs(currentTime - previous.lastTime) <= epsilon;
  const unchangedMs = isSameFrameTime ? previous.unchangedMs + elapsed : 0;

  return {
    lastTime: currentTime,
    lastTick: nowMs,
    unchangedMs,
    isFrozen: unchangedMs >= thresholdMs,
  };
}
