import assert from "node:assert/strict";
import test from "node:test";

import { AuthoritativeMatch } from "../server/match.js";
import { GameState } from "../src/game.js";
import { NetworkGameState } from "../src/network-game.js";

function audioSpy() {
  const calls = [];
  return {
    calls,
    distantShot: profile => calls.push(["distantShot", profile]),
    gunshot: profile => calls.push(["gunshot", profile]),
    knife: profile => calls.push(["knife", profile]),
  };
}

test("solo emits one semantic shot event only for an accepted local attack", () => {
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
  assert.deepEqual(shots, [{
    type: "shot",
    payload: {
      actorId: game.player.id,
      weaponId: "barrett",
      profile: "sniper",
    },
  }]);
  assert.deepEqual(audio.calls, [["gunshot", "sniper"]]);
});

test("network relays an authoritative local shot while preserving shot audio", () => {
  const audio = audioSpy();
  const events = [];
  const game = new NetworkGameState(
    { self: { id: "human-1" } },
    audio,
    (type, payload) => events.push({ type, payload }),
  );

  game.handleCombatEvent({
    type: "shot",
    actorId: "seal-0",
    userId: "human-1",
    weaponId: "barrett",
    profile: "sniper",
  });
  game.handleCombatEvent({
    type: "shot",
    actorId: "terror-0",
    userId: "human-2",
    weaponId: "ak47",
    profile: "rifle",
  });

  assert.deepEqual(events, [{
    type: "shot",
    payload: { actorId: "seal-0", weaponId: "barrett", profile: "sniper" },
  }]);
  assert.deepEqual(audio.calls, [["gunshot", "sniper"], ["distantShot", "rifle"]]);
  assert.equal(game.shake, .48);
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

test("authoritative human shot events include the stable weapon id", () => {
  const events = [];
  const match = new AuthoritativeMatch(
    { id: "SHOT01", mapId: "city", modeId: "4v4" },
    [{ id: "human-1", alias: "Alpha", loadoutId: "recon" }],
    event => events.push(event),
    () => {},
  );
  const actor = match.actorByUser.get("human-1");
  actor.cooldown = 0;

  match.attack(actor);
  match.attack(actor);

  assert.deepEqual(events.filter(event => event.type === "shot"), [{
    type: "shot",
    actorId: actor.id,
    userId: "human-1",
    weaponId: "barrett",
    profile: "sniper",
  }]);
});
