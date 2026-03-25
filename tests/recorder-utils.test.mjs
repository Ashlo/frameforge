import test from "node:test";
import assert from "node:assert/strict";
import { advanceFreezeWatch, getBaseScreenRect, getScreenRenderMode } from "../src/recorder-utils.mjs";

test("getBaseScreenRect returns stretch rectangle", () => {
  const rect = getBaseScreenRect(1920, 1080, 1280, 720, "stretch");
  assert.deepEqual(rect, { x: 0, y: 0, width: 1280, height: 720 });
});

test("getBaseScreenRect contain keeps full source visible", () => {
  const rect = getBaseScreenRect(3440, 1440, 1920, 1080, "contain");
  assert.equal(rect.x, 0);
  assert.equal(rect.width, 1920);
  assert.equal(rect.height, 1920 / (3440 / 1440));
  assert.ok(rect.y > 0);
});

test("getBaseScreenRect cover fills and crops", () => {
  const rect = getBaseScreenRect(3440, 1440, 1920, 1080, "cover");
  assert.equal(rect.y, 0);
  assert.equal(rect.height, 1080);
  assert.ok(rect.width > 1920);
  assert.ok(rect.x < 0);
});

test("getBaseScreenRect returns null for invalid dimensions", () => {
  assert.equal(getBaseScreenRect(0, 1080, 1920, 1080, "contain"), null);
  assert.equal(getBaseScreenRect(1920, 0, 1920, 1080, "contain"), null);
  assert.equal(getBaseScreenRect(1920, 1080, 0, 1080, "contain"), null);
});

test("getScreenRenderMode chooses live first, then hold, then blank", () => {
  assert.equal(getScreenRenderMode({ screenReady: true, hasLastScreenFrame: false }), "live");
  assert.equal(getScreenRenderMode({ screenReady: false, hasLastScreenFrame: true }), "hold");
  assert.equal(getScreenRenderMode({ screenReady: false, hasLastScreenFrame: false }), "blank");
});

test("advanceFreezeWatch resets when inactive", () => {
  const next = advanceFreezeWatch({
    active: false,
    previous: { lastTime: 1.2, lastTick: 1000, unchangedMs: 3000, isFrozen: true },
    currentTime: 1.2,
    nowMs: 1100,
  });

  assert.deepEqual(next, {
    lastTime: null,
    lastTick: null,
    unchangedMs: 0,
    isFrozen: false,
  });
});

test("advanceFreezeWatch detects freeze when time does not advance", () => {
  const first = advanceFreezeWatch({
    active: true,
    previous: { lastTime: null, lastTick: null, unchangedMs: 0, isFrozen: false },
    currentTime: 5,
    nowMs: 1000,
  });

  const second = advanceFreezeWatch({
    active: true,
    previous: first,
    currentTime: 5,
    nowMs: 3400,
    thresholdMs: 2000,
  });

  assert.equal(second.isFrozen, true);
  assert.ok(second.unchangedMs >= 2400);
});

test("advanceFreezeWatch clears freeze when video time advances", () => {
  const frozen = {
    lastTime: 5,
    lastTick: 3400,
    unchangedMs: 2400,
    isFrozen: true,
  };

  const next = advanceFreezeWatch({
    active: true,
    previous: frozen,
    currentTime: 5.2,
    nowMs: 3600,
    thresholdMs: 2000,
  });

  assert.equal(next.isFrozen, false);
  assert.equal(next.unchangedMs, 0);
});
