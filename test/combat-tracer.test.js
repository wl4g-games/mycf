import assert from "node:assert/strict";
import test from "node:test";

import { CombatTracerSystem, createCombatTracer } from "../src/combat-tracer.js";

const incomingHit = {
  type: "shot",
  actorId: "terror-2",
  victimId: "seal-0",
  team: "terror",
  weaponId: "ak47",
  profile: "rifle",
  hit: true,
  from: { x: 7, y: 3, z: .68 },
  to: { x: 2, y: 2, z: .58 },
};

test("accepted firearm events create a deterministic incoming injury tracer", () => {
  const tracer = createCombatTracer(incomingHit, "seal-0", .2);

  assert.equal(tracer.incomingHit, true);
  assert.equal(tracer.life, .2);
  assert.equal(tracer.maxLife, .2);
  assert.deepEqual(tracer.from, incomingHit.from);
  assert.deepEqual(tracer.to, incomingHit.to);
  assert.notStrictEqual(tracer.from, incomingHit.from);
});

test("melee and incomplete events never create fake bullet beams", () => {
  assert.equal(createCombatTracer({ ...incomingHit, profile: "knife" }, "seal-0"), null);
  assert.equal(createCombatTracer({ ...incomingHit, from: null }, "seal-0"), null);
  assert.equal(createCombatTracer(null, "seal-0"), null);
});

test("tracer lifetime and capacity remain bounded", () => {
  const system = new CombatTracerSystem({ lifetime: .1, limit: 2 });
  system.trigger({ ...incomingHit, actorId: "terror-0" }, "seal-0");
  system.trigger({ ...incomingHit, actorId: "terror-1" }, "seal-0");
  system.trigger({ ...incomingHit, actorId: "terror-2" }, "seal-0");

  assert.deepEqual(system.items.map(item => item.actorId), ["terror-1", "terror-2"]);
  system.advance(.04);
  assert.equal(system.items.length, 2);
  system.advance(.061);
  assert.equal(system.items.length, 0);
});
