import assert from "node:assert/strict";
import test from "node:test";

import {
  GameAudio,
  createBowSoundPlan,
  createExplosionSoundPlan,
  createGrenadeThrowSoundPlan,
  createMeleeSoundPlan,
  createWeaponSoundPlan,
} from "../src/audio.js";
import { SpatialFootstepTracker, createGrenadeAudioCue, spatialize } from "../src/audio-spatial.js";

test("weapon synthesis plans are original, layered, and distinct per weapon family", () => {
  const ids = ["barrett", "ak47", "policeMG", "whitePistol", "baike", "desertEagle", "dualPistols"];
  const signatures = ids.map(id => {
    const plan = createWeaponSoundPlan(id);
    const roles = new Set(plan.layers.map(layer => layer.role));
    assert.ok(roles.has("blast"), `${id} includes a muzzle blast`);
    assert.ok(roles.has("recoil"), `${id} includes a recoil body`);
    assert.ok(roles.has("mechanical"), `${id} includes an action sound`);
    assert.ok(roles.has("tail"), `${id} includes a decay tail`);
    return JSON.stringify(plan.layers);
  });

  assert.equal(new Set(signatures).size, ids.length);
  assert.notDeepEqual(createExplosionSoundPlan("smoke"), createExplosionSoundPlan("skull"));
});

test("bows and dual blades use dedicated non-firearm synthesis", () => {
  const bow = createBowSoundPlan(true);
  const bowRoles = bow.layers.map(layer => layer.role);
  assert.deepEqual(bowRoles.slice(0, 3), ["string", "release", "arrow"]);
  assert.ok(bowRoles.includes("impact"));
  assert.ok(!bowRoles.includes("blast"));

  const blades = createMeleeSoundPlan("dualBlades", "knife");
  assert.ok(blades.layers.some(layer => layer.role === "secondBlade"));

  const audio = new GameAudio();
  assert.equal(audio.weaponShot({ weaponId: "powerBow", profile: "bow", hit: true }).id, "powerBow");
  assert.equal(audio.weaponShot({ weaponId: "dualBlades", profile: "knife" }).id, "dualBlades");
});

test("grenade callouts distinguish own, friendly, and incoming throws", () => {
  const listener = { id: "seal-0", team: "seal", x: 0, y: 0, angle: 0 };
  const own = createGrenadeAudioCue({ actorId: "seal-0", team: "seal", from: { x: 0, y: 0 } }, listener);
  const ally = createGrenadeAudioCue({ actorId: "seal-1", team: "seal", from: { x: 2, y: 2 } }, listener);
  const enemy = createGrenadeAudioCue({ actorId: "terror-0", team: "terror", from: { x: 2, y: -2 } }, listener);

  assert.deepEqual(
    [own.relation, own.messageKey, ally.relation, ally.messageKey, enemy.relation, enemy.messageKey],
    ["self", "audio.grenadeOut", "ally", "audio.friendlyGrenadeOut", "enemy", "audio.grenadeIncoming"],
  );
  assert.ok(ally.pan > 0);
  assert.ok(enemy.pan < 0);
  assert.equal(enemy.priority, 2);
  const thrownAway = createGrenadeAudioCue({
    actorId: "terror-1",
    team: "terror",
    from: { x: 4, y: 0 },
    to: { x: 12, y: 0 },
  }, listener);
  assert.equal(thrownAway.incoming, false);
  assert.equal(thrownAway.shouldSpeak, false);
  assert.deepEqual(
    createGrenadeThrowSoundPlan("firework").layers.map(layer => layer.role),
    ["pin", "pin", "lever", "throw"],
  );
});

test("spatial footsteps alternate feet and retain teammate or enemy identity", () => {
  const tracker = new SpatialFootstepTracker({ stride: .5, maxVoices: 4 });
  const player = { id: "seal-0", team: "seal", x: 0, y: 0, angle: 0, alive: true };
  const ally = { id: "seal-1", team: "seal", x: 2, y: 1, alive: true };
  const enemy = { id: "terror-0", team: "terror", x: 2, y: -1, alive: true };
  const game = { player, actors: [player, ally, enemy], tank: { driverId: null } };

  assert.deepEqual(tracker.update(game, .016), []);
  ally.y += .55;
  enemy.y -= .55;
  const first = tracker.update(game, .1);
  assert.deepEqual(first.map(cue => cue.relation).sort(), ["ally", "enemy"]);
  assert.ok(first.find(cue => cue.relation === "ally").pan > 0);
  assert.ok(first.find(cue => cue.relation === "enemy").pan < 0);
  assert.ok(first.every(cue => cue.side === "left"));

  ally.y += .55;
  enemy.y -= .55;
  const second = tracker.update(game, .1);
  assert.ok(second.every(cue => cue.side === "right"));
});

test("spatial footsteps exclude every occupied vehicle driver", () => {
  const tracker = new SpatialFootstepTracker({ stride: .5 });
  const player = { id: "seal-0", team: "seal", x: 0, y: 0, angle: 0, alive: true };
  const tankDriver = { id: "seal-1", team: "seal", x: 2, y: 1, alive: true };
  const armoredDriver = { id: "terror-0", team: "terror", x: 2, y: -1, alive: true };
  const game = {
    player,
    actors: [player, tankDriver, armoredDriver],
    vehicles: [{ driverId: tankDriver.id }, { driverId: armoredDriver.id }],
  };

  tracker.update(game, .016);
  tankDriver.y += .6;
  armoredDriver.y -= .6;
  assert.deepEqual(tracker.update(game, .1), []);
});

test("spatial attenuation rejects distant sources and preserves left-right direction", () => {
  const listener = { x: 0, y: 0, angle: 0 };
  const right = spatialize({ x: 3, y: 4 }, listener, 10);
  const left = spatialize({ x: 3, y: -4 }, listener, 10);
  const distant = spatialize({ x: 30, y: 0 }, listener, 10);

  assert.equal(right.distance, 5);
  assert.ok(right.pan > 0);
  assert.ok(left.pan < 0);
  assert.equal(distant.audible, false);
  assert.equal(distant.gain, 0);
});
