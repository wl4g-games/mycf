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
import {
  GrenadeThreatTracker, SpatialFootstepTracker, createGrenadeAudioCue, spatialize,
} from "../src/audio-spatial.js";

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

test("packaged incoming callouts bypass optional browser speech synthesis", () => {
  const calls = [];
  const audio = new GameAudio({
    locale: () => "zh-CN",
    calloutPlayer: {
      preload: async () => [],
      play: (context, destination, options) => {
        calls.push({ context, destination, options });
        return true;
      },
    },
  });
  audio.context = { state: "running" };
  audio.master = { id: "master" };

  assert.equal(audio.speakCallout("audio.grenadeIncoming", 2, { pan: -.8 }), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.locale, "zh-CN");
  assert.ok(calls[0].options.pan < 0);
});

test("nearby enemy grenades trigger once even when their initial throw was not incoming", () => {
  let now = 1000;
  const tracker = new GrenadeThreatTracker({ triggerDistance: 8, now: () => now });
  const player = { id: "seal-0", team: "seal", x: 0, y: 0, angle: 0, alive: true };
  const enemy = { id: "g-enemy", type: "grenade", team: "terror", x: 6, y: -2, throwableId: "skull" };
  const friendly = { id: "g-friendly", type: "grenade", team: "seal", x: 1, y: 0 };
  const game = { player, projectiles: [enemy, friendly] };

  const first = tracker.update(game);
  assert.equal(first.length, 1);
  assert.equal(first[0].projectileId, enemy.id);
  assert.equal(first[0].messageKey, "audio.grenadeIncoming");
  assert.ok(first[0].pan < 0);
  assert.deepEqual(tracker.update(game), []);

  tracker.reset();
  tracker.mark(enemy.id);
  assert.deepEqual(tracker.update(game), []);
  now += 6001;
  assert.equal(tracker.update(game).length, 1);
});

test("spatial footsteps include the local player and retain teammate or enemy identity", () => {
  const tracker = new SpatialFootstepTracker({ stride: .5, maxVoices: 4 });
  const player = { id: "seal-0", team: "seal", x: 0, y: 0, angle: 0, alive: true };
  const ally = { id: "seal-1", team: "seal", x: 2, y: 1, alive: true };
  const enemy = { id: "terror-0", team: "terror", x: 2, y: -1, alive: true };
  const game = { player, actors: [player, ally, enemy], tank: { driverId: null } };

  assert.deepEqual(tracker.update(game, .016), []);
  player.x += .55;
  ally.y += .55;
  enemy.y -= .55;
  const first = tracker.update(game, .1);
  assert.deepEqual(first.map(cue => cue.relation).sort(), ["ally", "enemy", "self"]);
  assert.equal(first.find(cue => cue.relation === "self").pan, 0);
  assert.ok(first.find(cue => cue.relation === "ally").pan > 0);
  assert.ok(first.find(cue => cue.relation === "enemy").pan < 0);
  assert.ok(first.every(cue => cue.side === "left"));

  player.x += .55;
  ally.y += .55;
  enemy.y -= .55;
  const second = tracker.update(game, .1);
  assert.ok(second.every(cue => cue.side === "right"));
});

test("footstep playback alternates local feet and preserves world-space stereo direction", () => {
  const audio = new GameAudio();
  const calls = [];
  audio.playPlan = (plan, options) => calls.push({ plan, options });

  audio.footstep({ relation: "self", side: "left", pan: 0, gain: 1, distance: 0 });
  audio.footstep({ relation: "self", side: "right", pan: 0, gain: 1, distance: 0 });
  audio.footstep({ relation: "ally", side: "right", pan: -.7, gain: .8, distance: 2 });
  audio.footstep({ relation: "enemy", side: "left", pan: .7, gain: .8, distance: 2 });

  assert.ok(calls[0].options.pan < -.1);
  assert.ok(calls[1].options.pan > .1);
  assert.ok(calls[2].options.pan < 0);
  assert.ok(calls[3].options.pan > 0);
  assert.equal(calls[0].plan.id, "footstep:self:left");
  assert.equal(calls[3].plan.id, "footstep:enemy:left");
});

test("spatial footsteps exclude every occupied vehicle driver", () => {
  const tracker = new SpatialFootstepTracker({ stride: .5 });
  const player = { id: "seal-0", team: "seal", x: 0, y: 0, angle: 0, alive: true };
  const tankDriver = { id: "seal-1", team: "seal", x: 2, y: 1, alive: true };
  const armoredDriver = { id: "terror-0", team: "terror", x: 2, y: -1, alive: true };
  const game = {
    player,
    actors: [player, tankDriver, armoredDriver],
    vehicles: [{ driverId: player.id }, { driverId: tankDriver.id }, { driverId: armoredDriver.id }],
  };

  tracker.update(game, .016);
  player.x += .6;
  tankDriver.y += .6;
  armoredDriver.y -= .6;
  assert.deepEqual(tracker.update(game, .1), []);
});

test("paused, teleported, and dead actors cannot create phantom footsteps", () => {
  const tracker = new SpatialFootstepTracker({ stride: .5, teleportDistance: 2 });
  const player = { id: "seal-0", team: "seal", x: 0, y: 0, angle: 0, alive: true };
  const enemy = { id: "terror-0", team: "terror", x: 2, y: -1, alive: true };
  const game = { player, actors: [player, enemy], vehicles: [] };

  tracker.update(game, .016);
  player.x += .8;
  enemy.y -= .8;
  assert.deepEqual(tracker.update(game, 0), []);

  player.x += .2;
  enemy.y -= .2;
  assert.deepEqual(tracker.update(game, .1), []);

  player.x += 3;
  enemy.y -= 3;
  assert.deepEqual(tracker.update(game, .1), []);

  enemy.alive = false;
  tracker.update(game, .1);
  enemy.alive = true;
  enemy.y += .8;
  assert.deepEqual(tracker.update(game, .1), []);

  player.alive = false;
  enemy.y += .8;
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
