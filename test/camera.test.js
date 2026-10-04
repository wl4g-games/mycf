import assert from "node:assert/strict";
import test from "node:test";

import { MAX_CAMERA_PITCH, applyCameraPitch, cameraHorizon } from "../src/camera.js";

test("camera pitch is finite and clamped at both vertical limits", () => {
  assert.equal(applyCameraPitch(0, MAX_CAMERA_PITCH * 2), MAX_CAMERA_PITCH);
  assert.equal(applyCameraPitch(0, -MAX_CAMERA_PITCH * 2), -MAX_CAMERA_PITCH);
  assert.equal(applyCameraPitch(Number.NaN, Number.NaN), 0);
});

test("looking up lowers the horizon and looking down raises it", () => {
  const neutral = cameraHorizon(1000, 0);
  assert.ok(cameraHorizon(1000, -0.2) > neutral);
  assert.ok(cameraHorizon(1000, 0.2) < neutral);
});
