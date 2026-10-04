import assert from "node:assert/strict";
import test from "node:test";

import { InputController, TouchAimState, mouseAimDelta } from "../src/input.js";

test("fire dragging adjusts yaw and pitch while another pointer remains active", () => {
  const state = new TouchAimState();
  state.begin(11, 80, 120, false);
  state.begin(22, 200, 260, true);

  assert.equal(state.fireHeld, true);
  const fireDrag = state.move(22, 245, 220);
  assert.ok(Math.abs(fireDrag.yaw - .234) < 1e-9);
  assert.ok(Math.abs(fireDrag.pitch + .168) < 1e-9);
  assert.ok(Math.abs(state.consumeYaw() - .234) < 1e-9);
  assert.ok(Math.abs(state.consumePitch() + .168) < 1e-9);

  state.end(11);
  assert.equal(state.fireHeld, true);
  state.end(22);
  assert.equal(state.fireHeld, false);
});

test("touch cancellation clears only the matching aim and fire pointer", () => {
  const state = new TouchAimState();
  state.begin(31, 100, 180, true);
  state.begin(32, 300, 260, true);
  state.move(31, 120, 195);
  state.end(31);

  assert.equal(state.fireHeld, true);
  assert.ok(Math.abs(state.consumeYaw() - .104) < 1e-9);
  assert.ok(Math.abs(state.consumePitch() - .063) < 1e-9);
  assert.deepEqual(state.move(31, 500, 500), { yaw: 0, pitch: 0 });
  const remainingDrag = state.move(32, 290, 240);
  assert.ok(Math.abs(remainingDrag.yaw + .052) < 1e-9);
  assert.ok(Math.abs(remainingDrag.pitch + .084) < 1e-9);
  state.end(32);
  assert.equal(state.fireHeld, false);
  assert.ok(Math.abs(state.consumeYaw() + .052) < 1e-9);
  assert.ok(Math.abs(state.consumePitch() + .084) < 1e-9);
});

test("multitouch aim deltas accumulate independently and clear atomically", () => {
  const state = new TouchAimState(.01, .02);
  state.begin(1, 10, 20, false);
  state.begin(2, 100, 200, true);

  state.move(1, 20, 10);
  state.move(2, 90, 215);
  assert.equal(state.consumeYaw(), 0);
  assert.ok(Math.abs(state.consumePitch() - .1) < 1e-9);

  state.move(2, 120, 180);
  state.clear();
  assert.equal(state.fireHeld, false);
  assert.equal(state.consumeYaw(), 0);
  assert.equal(state.consumePitch(), 0);
});

test("fire aim is two-dimensional while movement remains an independent input", () => {
  const controller = Object.create(InputController.prototype);
  controller.keys = new Set();
  controller.items = [];
  controller.yaw = 0;
  controller.pitch = 0;
  controller.mouseFireHeld = false;
  controller.touchMovement = { x: .3, y: -.4 };
  controller.touchAim = new TouchAimState(.01, .02);
  controller.touchAim.begin(42, 100, 200, true);
  controller.touchAim.move(42, 112, 191);

  const frame = controller.consume();
  assert.deepEqual(frame.movement, { x: .3, y: -.4 });
  assert.deepEqual(controller.touchMovement, { x: .3, y: -.4 });
  assert.ok(Math.abs(frame.yaw - .12) < 1e-9);
  assert.ok(Math.abs(frame.pitch + .18) < 1e-9);
  assert.equal(frame.fireHeld, true);
});

test("pointer-locked mouse movement produces matching horizontal and vertical aim", () => {
  assert.deepEqual(mouseAimDelta(20, -15), { yaw: .043, pitch: -.027 });
  assert.deepEqual(mouseAimDelta(Number.NaN, undefined), { yaw: 0, pitch: 0 });
});
