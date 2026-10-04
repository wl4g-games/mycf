import assert from "node:assert/strict";
import test from "node:test";

import { MAPS, WEAPONS } from "../src/game-config.js";
import { createShotEvent, traceShotPath } from "../src/shot-geometry.js";

test("miss paths stop in open space before solid map geometry", () => {
  const actor = { id: "seal-0", team: "seal", x: 1.5, y: 1.5, angle: Math.PI, userId: null };
  const path = traceShotPath(MAPS.city, actor, 20);

  assert.ok(path.to.x > 1);
  assert.ok(path.to.x < actor.x);
  assert.equal(path.to.y, actor.y);
});

test("hit events terminate exactly on the authoritative victim", () => {
  const actor = { id: "seal-0", team: "seal", x: 4, y: 5, angle: 0, userId: "human-1" };
  const victim = { id: "terror-0", x: 8, y: 6 };
  const event = createShotEvent(MAPS.city, actor, WEAPONS.ak47, victim);

  assert.equal(event.hit, true);
  assert.equal(event.victimId, victim.id);
  assert.deepEqual(event.to, { x: victim.x, y: victim.y, z: .58 });
  assert.equal(event.userId, "human-1");
});
