import assert from "node:assert/strict";
import test from "node:test";

import { Renderer } from "../src/renderer.js";

function rendererFixture() {
  const renderer = Object.create(Renderer.prototype);
  renderer.width = 1000;
  renderer.height = 600;
  renderer.motionTracker = { get: () => ({ activity: 0, phase: 0 }) };
  renderer.weaponViewmodel = { muzzlePosition: () => ({ x: 680, y: 430 }) };
  return renderer;
}

const camera = { id: "seal-0", x: 0, y: 0, angle: 0, alive: true, scoped: false, weaponId: "ak47" };
const view = { focal: 620, horizon: 270, fov: 1.16 };

test("local tracers begin at the rendered muzzle and advance into the scene", () => {
  const renderer = rendererFixture();
  const segment = renderer.tracerSegment({
    actorId: camera.id,
    from: { x: .3, y: 0, z: .68 },
    to: { x: 8, y: .4, z: .58 },
  }, { player: camera }, view.focal, view.horizon, view.fov);

  assert.deepEqual(segment.start, { x: 680, y: 430 });
  assert.ok(Number.isFinite(segment.end.x));
  assert.ok(Number.isFinite(segment.end.y));
});

test("confirmed incoming hits remain directional when the shooter is behind", () => {
  const renderer = rendererFixture();
  const segment = renderer.tracerSegment({
    actorId: "terror-0",
    incomingHit: true,
    from: { x: -4, y: -1, z: .68 },
    to: { x: 0, y: 0, z: .58 },
  }, { player: camera }, view.focal, view.horizon, view.fov);

  assert.equal(segment.end.x, renderer.width / 2);
  assert.equal(segment.end.y, renderer.height / 2);
  assert.ok(segment.start.x === renderer.width * .08 || segment.start.x === renderer.width * .92);
  assert.ok(Number.isFinite(segment.start.y));
});

test("ordinary remote tracers clip the near plane and reject fully hidden paths", () => {
  const renderer = rendererFixture();
  const crossing = renderer.tracerSegment({
    actorId: "terror-0",
    incomingHit: false,
    from: { x: -1, y: .1, z: .68 },
    to: { x: 4, y: .1, z: .58 },
  }, { player: camera }, view.focal, view.horizon, view.fov);
  assert.ok(Number.isFinite(crossing.start.x));
  assert.ok(Number.isFinite(crossing.start.y));
  assert.ok(Number.isFinite(crossing.end.x));
  assert.ok(Number.isFinite(crossing.end.y));

  const hidden = renderer.tracerSegment({
    actorId: "terror-0",
    incomingHit: false,
    from: { x: -1, y: 0, z: .68 },
    to: { x: -4, y: 0, z: .58 },
  }, { player: camera }, view.focal, view.horizon, view.fov);
  assert.equal(hidden, null);
});
