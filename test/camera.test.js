import assert from "node:assert/strict";
import test from "node:test";

import { MAX_CAMERA_PITCH, applyCameraPitch } from "../src/camera.js";

test("camera pitch is finite and clamped at both vertical limits", () => {
  assert.equal(applyCameraPitch(0, MAX_CAMERA_PITCH * 2), MAX_CAMERA_PITCH);
  assert.equal(applyCameraPitch(0, -MAX_CAMERA_PITCH * 2), -MAX_CAMERA_PITCH);
  assert.equal(applyCameraPitch(Number.NaN, Number.NaN), 0);
});

test("3D camera pitch supports looking almost vertically in both directions", () => {
  assert.ok(MAX_CAMERA_PITCH > Math.PI / 3);
  assert.ok(MAX_CAMERA_PITCH < Math.PI / 2);
  assert.equal(applyCameraPitch(.2, -.5), -.3);
});
