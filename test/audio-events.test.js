import assert from "node:assert/strict";
import test from "node:test";

import { GameState } from "../src/game.js";
import { NetworkGameState } from "../src/network-game.js";

const silentAudio = new Proxy({}, { get: () => () => {} });

test("solo grenade throws emit relationship and trajectory metadata", () => {
  const events = [];
  const game = new GameState(silentAudio, (type, payload) => events.push({ type, payload }));
  const enemy = game.actors.find(actor => actor.team !== game.player.team);
  game.player.cooldown = 0;
  enemy.cooldown = 0;

  game.throwGrenade(game.player);
  game.throwGrenade(enemy);

  const throws = events.filter(event => event.type === "grenade_throw").map(event => event.payload);
  assert.equal(throws.length, 2);
  assert.deepEqual(throws.map(event => event.actorId), [game.player.id, enemy.id]);
  assert.deepEqual(throws.map(event => event.team), [game.player.team, enemy.team]);
  for (const event of throws) {
    assert.ok(Number.isFinite(event.from.x));
    assert.ok(Number.isFinite(event.from.y));
    assert.ok(Number.isFinite(event.to.x));
    assert.ok(Number.isFinite(event.to.y));
  }
});

test("network grenade events relay unchanged to the presentation layer", () => {
  const events = [];
  const game = new NetworkGameState(
    { self: { id: "human-1" } },
    silentAudio,
    (type, payload) => events.push({ type, payload }),
  );
  game.player = { id: "seal-0", team: "seal", x: 0, y: 0 };
  const event = {
    type: "grenade_throw",
    actorId: "terror-0",
    userId: "human-2",
    team: "terror",
    throwableId: "skull",
    from: { x: 4, y: -2, z: .65 },
    to: { x: 0, y: 0, z: 0 },
  };

  game.handleCombatEvent(event);

  assert.deepEqual(events, [{ type: "grenade_throw", payload: event }]);
});
