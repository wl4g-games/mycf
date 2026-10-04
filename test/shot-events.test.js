import assert from "node:assert/strict";
import test from "node:test";

import { WEAPONS } from "../src/config.js";
import { createCombatTracer } from "../src/combat-tracer.js";
import { GameState } from "../src/game.js";
import { NetworkGameState } from "../src/network-game.js";

function audioSpy() {
  const calls = [];
  return {
    calls,
    weaponShot: ({ weaponId, profile, source, listener, hit }) => {
      calls.push(["weaponShot", weaponId, profile, Boolean(source), Boolean(listener), Boolean(hit)]);
    },
    hit: () => calls.push(["hit"]),
  };
}

test("solo emits a traced shot for every accepted actor attack and none for rejected attacks", () => {
  const audio = audioSpy();
  const events = [];
  const game = new GameState(audio, (type, payload) => events.push({ type, payload }));

  game.player.alive = false;
  game.player.cooldown = 0;
  game.attack(game.player);
  game.player.alive = true;
  game.player.cooldown = 1;
  game.attack(game.player);
  const bot = game.actors.find(actor => !actor.isPlayer);
  bot.cooldown = 0;
  game.attack(bot);
  game.player.cooldown = 0;
  game.attack(game.player);
  game.attack(game.player);

  const shots = events.filter(event => event.type === "shot");
  assert.equal(shots.length, 2);
  assert.equal(shots[0].payload.actorId, bot.id);
  assert.equal(shots[1].payload.actorId, game.player.id);
  assert.deepEqual(shots.map(event => event.payload.weaponId), [bot.weaponId, "barrett"]);
  for (const { payload } of shots) {
    assert.equal(payload.type, "shot");
    assert.ok(Number.isFinite(payload.from.x));
    assert.ok(Number.isFinite(payload.from.y));
    assert.ok(Number.isFinite(payload.to.x));
    assert.ok(Number.isFinite(payload.to.y));
  }
  assert.deepEqual(audio.calls[0], ["weaponShot", bot.weaponId, WEAPONS[bot.weaponId].visual, true, true, false]);
  assert.deepEqual(audio.calls.at(-1), ["weaponShot", "barrett", "sniper", false, false, false]);
});

test("solo bot hit and miss decisions produce matching authoritative tracer events", () => {
  const events = [];
  const game = new GameState(audioSpy(), (type, payload) => events.push({ type, payload }));
  const bot = game.actors.find(actor => actor.isBot && actor.team !== game.player.team);
  const weapon = WEAPONS[bot.weaponId];
  const initialHealth = game.player.health;

  game.commitShot(bot, weapon, null, weapon.damage * .34);
  game.commitShot(bot, weapon, game.player, weapon.damage * .34);

  const shots = events.filter(event => event.type === "shot").map(event => event.payload);
  assert.deepEqual(shots.map(shot => shot.hit), [false, true]);
  assert.deepEqual(shots.map(shot => shot.victimId), [null, game.player.id]);
  assert.ok(game.player.health < initialHealth);
});

test("network relays authoritative local and incoming shots with confirmed injury feedback", () => {
  const audio = audioSpy();
  const events = [];
  const game = new NetworkGameState(
    { self: { id: "human-1" } },
    audio,
    (type, payload) => events.push({ type, payload }),
  );
  game.player = { id: "seal-0", x: 0, y: 0, weaponId: "barrett" };

  game.handleCombatEvent({
    type: "shot",
    actorId: "seal-0",
    userId: "human-1",
    weaponId: "barrett",
    profile: "sniper",
    team: "seal",
    victimId: null,
    hit: false,
    from: { x: 0, y: 0, z: .68 },
    to: { x: 8, y: 0, z: .58 },
  });
  game.handleCombatEvent({
    type: "shot",
    actorId: "terror-0",
    userId: "human-2",
    weaponId: "ak47",
    profile: "rifle",
    team: "terror",
    victimId: "seal-0",
    hit: true,
    from: { x: 3, y: 4, z: .68 },
    to: { x: 0, y: 0, z: .58 },
  });

  assert.equal(events.length, 2);
  assert.deepEqual(events.map(event => event.payload.actorId), ["seal-0", "terror-0"]);
  assert.deepEqual(events[1].payload.to, { x: 0, y: 0, z: .58 });
  assert.equal(createCombatTracer(events[1].payload, "seal-0").incomingHit, true);
  assert.deepEqual(audio.calls, [
    ["weaponShot", "barrett", "sniper", false, false, false],
    ["weaponShot", "ak47", "rifle", true, true, true],
  ]);
  assert.equal(game.shake, .48);
  assert.equal(game.flash, .28);
});

test("network confirms every authoritative local hit without waiting for a kill", () => {
  const audio = audioSpy();
  const game = new NetworkGameState({ self: { id: "human-1" } }, audio);
  game.player = { id: "seal-0", x: 0, y: 0, weaponId: "ak47" };

  game.handleCombatEvent({
    type: "shot",
    actorId: "seal-0",
    userId: "human-1",
    weaponId: "ak47",
    profile: "rifle",
    team: "seal",
    victimId: "terror-0",
    hit: true,
    from: { x: 0, y: 0, z: .68 },
    to: { x: 3, y: 0, z: .58 },
  });

  assert.equal(game.hitMarker, .16);
  assert.deepEqual(audio.calls.at(-1), ["hit"]);
});

test("remote melee presentation stays on the semantic weapon audio path", () => {
  const audio = audioSpy();
  const events = [];
  const game = new NetworkGameState(
    { self: { id: "human-1" } },
    audio,
    (type, payload) => events.push({ type, payload }),
  );
  game.player = { id: "seal-0", x: 0, y: 0, weaponId: "barrett" };

  game.handleCombatEvent({
    type: "shot",
    actorId: "terror-0",
    userId: "human-2",
    weaponId: "axe",
    profile: "axe",
    team: "terror",
    victimId: null,
    hit: false,
    from: { x: 1, y: 1, z: .68 },
    to: { x: 1.5, y: 1.5, z: .58 },
  });

  assert.equal(events.length, 1);
  assert.deepEqual(audio.calls, [["weaponShot", "axe", "axe", true, true, false]]);
});

test("suspending a network match immediately clears latched movement and fire", () => {
  const packets = [];
  const client = {
    self: { id: "human-1", alias: "Alpha", loadoutId: "recon" },
    sendInput: packet => packets.push(packet),
  };
  const game = new NetworkGameState(client, audioSpy());
  game.start({
    room: { mapId: "city", modeId: "1v1" },
    assignment: { actorId: "seal-0", team: "seal" },
  });
  game.pendingActions.push(["fire"]);
  game.suspendInput();

  assert.deepEqual(packets, [{
    movement: { x: 0, y: 0 },
    angle: game.localAngle,
    fireHeld: false,
    actions: [],
  }]);
  assert.deepEqual(game.pendingActions, []);
  assert.equal(game.sendClock, 0);
});
