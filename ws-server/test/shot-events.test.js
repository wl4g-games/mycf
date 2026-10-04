import assert from "node:assert/strict";
import test from "node:test";

import { WEAPONS } from "../src/game-config.js";
import { AuthoritativeMatch } from "../src/match.js";

test("authoritative accepted shots include stable geometry for humans and bots", () => {
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

  const humanShots = events.filter(event => event.type === "shot");
  assert.equal(humanShots.length, 1);
  assert.equal(humanShots[0].actorId, actor.id);
  assert.equal(humanShots[0].userId, "human-1");
  assert.equal(humanShots[0].weaponId, "barrett");
  assert.equal(humanShots[0].profile, "sniper");
  assert.ok(Number.isFinite(humanShots[0].from.x));
  assert.ok(Number.isFinite(humanShots[0].to.x));

  const bot = match.actors.find(item => item.isBot);
  bot.cooldown = 0;
  match.attack(bot);
  const botShot = events.filter(event => event.type === "shot").at(-1);
  assert.equal(botShot.actorId, bot.id);
  assert.equal(botShot.userId, null);
  assert.equal(botShot.team, bot.team);
  assert.equal(typeof botShot.hit, "boolean");
});

test("authoritative bot misses and hits publish their resolved victim state", () => {
  const events = [];
  const match = new AuthoritativeMatch(
    { id: "BOTSHOT", mapId: "wild", modeId: "1v1" },
    [],
    event => events.push(event),
    () => {},
  );
  const bot = match.actors.find(actor => actor.team === "terror");
  const victim = match.actors.find(actor => actor.team === "seal");
  const weapon = WEAPONS[bot.weaponId];
  const initialHealth = victim.health;

  match.commitShot(bot, weapon, null, weapon.damage * .34);
  match.commitShot(bot, weapon, victim, weapon.damage * .34);

  const shots = events.filter(event => event.type === "shot");
  assert.deepEqual(shots.map(shot => shot.hit), [false, true]);
  assert.deepEqual(shots.map(shot => shot.victimId), [null, victim.id]);
  assert.ok(victim.health < initialHealth);
});
