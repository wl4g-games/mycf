import assert from "node:assert/strict";
import test from "node:test";

import { TouchAimState } from "../src/input.js";

test("a fire touch can drag aim while another touch controls movement", () => {
  const state = new TouchAimState();
  state.begin(11, 80, false);
  state.begin(22, 200, true);

  assert.equal(state.fireHeld, true);
  assert.ok(Math.abs(state.move(22, 245) - .234) < 1e-9);
  assert.ok(Math.abs(state.consumeYaw() - .234) < 1e-9);

  state.end(11);
  assert.equal(state.fireHeld, true);
  state.end(22);
  assert.equal(state.fireHeld, false);
});

test("touch cancellation clears only the matching aim and fire pointer", () => {
  const state = new TouchAimState();
  state.begin(31, 100, true);
  state.begin(32, 300, true);
  state.move(31, 120);
  state.end(31);

  assert.equal(state.fireHeld, true);
  assert.ok(Math.abs(state.consumeYaw() - .104) < 1e-9);
  state.end(32);
  assert.equal(state.fireHeld, false);
  assert.equal(state.consumeYaw(), 0);
});
