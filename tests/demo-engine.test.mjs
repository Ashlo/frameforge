import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DEMO_PRESET,
  applyPreset,
  beginDemoZoom,
  enqueueDemoEvent,
  getDemoScreenEffect,
  normalizeDemoEvent,
  stepDemoZoom,
} from "../src/demo-engine.mjs";

test("applyPreset falls back to default preset", () => {
  const fallback = applyPreset("unknown-preset");
  assert.equal(fallback.preset, DEFAULT_DEMO_PRESET);
  assert.ok(fallback.zoomStrength > 0);
});

test("normalizeDemoEvent clamps coordinates and intensity", () => {
  const normalized = normalizeDemoEvent({
    kind: "click",
    t: 1000,
    xNorm: 5,
    yNorm: -2,
    intensity: 4,
  });

  assert.equal(normalized.kind, "click");
  assert.equal(normalized.xNorm, 1);
  assert.equal(normalized.yNorm, 0);
  assert.equal(normalized.intensity, 1);
});

test("enqueueDemoEvent keeps queue bounded", () => {
  const queue = [{ kind: "click", t: 1 }];
  const pushed = enqueueDemoEvent(queue, { kind: "click", t: 2 }, { maxQueue: 1 });
  assert.equal(pushed, true);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].t, 2);
});

test("beginDemoZoom and stepDemoZoom run full zoom cycle", () => {
  const settings = {
    zoomStrength: 0.56,
    zoomDurationMs: 980,
    cooldownMs: 320,
    typingHoldMs: 1280,
  };
  const event = {
    kind: "click",
    t: 0,
    xNorm: 0.03,
    yNorm: 0.95,
    intensity: 0.58,
  };

  let zoom = beginDemoZoom(null, event, settings, 1000);
  assert.equal(zoom.active, true);
  assert.equal(zoom.stage, "zoom-in");
  assert.ok(zoom.scaleTarget > 1.5);
  assert.equal(zoom.focusNormX, 0.5);
  assert.equal(zoom.focusNormY, 0.5);
  assert.ok(zoom.focusTargetX > event.xNorm);
  assert.ok(zoom.focusTargetY < event.yNorm);

  zoom = stepDemoZoom(zoom, settings, 1100);
  assert.equal(zoom.stage, "zoom-in");
  assert.ok(zoom.scaleCurrent > 1);
  assert.ok(zoom.focusNormX < 0.5);
  assert.ok(zoom.focusNormX > zoom.focusTargetX);

  zoom = stepDemoZoom(zoom, settings, zoom.zoomInEndsAt + 20);
  assert.equal(zoom.stage, "hold");
  assert.equal(zoom.scaleCurrent, zoom.scaleTarget);
  assert.equal(zoom.focusNormX, zoom.focusTargetX);
  assert.equal(zoom.focusNormY, zoom.focusTargetY);

  zoom = stepDemoZoom(zoom, settings, zoom.holdEndsAt + 30);
  assert.equal(zoom.stage, "zoom-out");
  assert.ok(zoom.scaleCurrent < zoom.scaleTarget);
  assert.equal(zoom.focusNormX, zoom.focusTargetX);

  zoom = stepDemoZoom(zoom, settings, zoom.zoomOutEndsAt + 1);
  assert.equal(zoom.active, false);
  assert.equal(zoom.stage, "cooldown");
  assert.equal(zoom.scaleCurrent, 1);
  assert.ok(zoom.cooldownUntil > zoom.zoomOutEndsAt);
});

test("getDemoScreenEffect returns bounded values", () => {
  const effect = getDemoScreenEffect({
    scaleCurrent: 7,
    focusNormX: -4,
    focusNormY: 2.1,
  });

  assert.equal(effect.scale, 2.1);
  assert.equal(effect.focusNormX, 0);
  assert.equal(effect.focusNormY, 1);
});
