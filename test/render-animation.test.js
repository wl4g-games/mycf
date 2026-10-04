import assert from "node:assert/strict";
import test from "node:test";

import { MotionTracker, advanceMotionState, gaitPose } from "../src/render-animation.js";

test("locomotion advances gait while idle motion settles", () => {
  let state = advanceMotionState(null, { x: 0, y: 0, angle: 0 }, .016);
  state = advanceMotionState(state, { x: .12, y: 0, angle: 0 }, .04);
  const moving = gaitPose(state);
  assert.ok(state.phase > 0);
  assert.ok(moving.activity > 0);
  assert.notEqual(moving.left, moving.right);

  for (let index = 0; index < 80; index += 1) {
    state = advanceMotionState(state, { x: .12, y: 0, angle: 0 }, .016);
  }
  assert.ok(state.activity < moving.activity);
});

test("teleports do not create a false running stride and stale actors are pruned", () => {
  const tracker = new MotionTracker();
  tracker.sample("actor-a", { x: 1, y: 1, angle: 0 }, .016);
  const teleported = tracker.sample("actor-a", { x: 12, y: 15, angle: 0 }, .016);
  tracker.sample("actor-b", { x: 2, y: 2, angle: 0 }, .016);

  assert.equal(teleported.phase, 0);
  assert.equal(teleported.activity, 0);
  tracker.retain(new Set(["actor-a"]));
  assert.ok(tracker.get("actor-a"));
  assert.equal(tracker.get("actor-b"), undefined);
});

test("zero animation delta freezes the sampled pose", () => {
  const moving = advanceMotionState(
    { x: 0, y: 0, angle: 0, phase: 1, activity: .7, turn: .2 },
    { x: .2, y: 0, angle: .1 },
    0,
  );
  assert.deepEqual(moving, { x: 0, y: 0, angle: 0, phase: 1, activity: .7, turn: .2 });
});
