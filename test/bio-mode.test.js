import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { BioBattle, HELICOPTER_WEAPONS } from "../ws-server/src/bio-mode.js";
import { AuthoritativeMatch } from "../ws-server/src/match.js";
import { GameState } from "../src/game.js";
import { MAPS, resolveMatchCondition } from "../src/config.js";
import { normalizeGameSetup } from "../src/repositories/game-setup-repository.js";
import { LanHost } from "../src/lan/host.ts";
import { LobbyService } from "../ws-server/src/lobby.js";
import { NetworkGameState } from "../src/network-game.js";

const audio = new Proxy({}, { get: () => () => {} });
const input = (movement = {}) => ({ yaw: 0, pitch: 0, items: [], fireHeld: false, movement: { x: 0, y: 0, ...movement } });
const setup = { battleModeId: "bio", bioDuration: 300, mapId: "city", modeId: "4v4", conditionId: "standard" };
function solo() { const game = new GameState(audio); game.configure(setup); game.start(); return game; }
function network(finish = () => {}, clock = () => 0) { return new AuthoritativeMatch({ id: "BIO", ...setup }, [{ id: "pilot", alias: "Pilot" }], () => {}, finish, { now: clock, epochNow: clock }); }

test("bio duration accepts only 3/5/10 minutes and team victory rules remain independent", () => {
  for (const seconds of [180, 300, 600]) assert.equal(resolveMatchCondition({ ...setup, bioDuration: seconds }).timeLimit, seconds);
  assert.equal(resolveMatchCondition({ ...setup, bioDuration: 1 }).timeLimit, 300);
  assert.equal(resolveMatchCondition({ conditionId: "extended" }).timeLimit, 480);
  assert.equal(normalizeGameSetup({ battleModeId: "invalid", bioDuration: -1 }).battleModeId, "team");
});

test("online and LAN rooms carry bio rules while preserving the original size capacity", () => {
  const host = new LanHost({ alias: "Pilot", loadoutId: "recon", characterId: "maleAgent" }, { ...setup, modeId: "16v16", mapId: "wild", bioDuration: 600 });
  assert.equal(host.room.battleModeId, "bio");
  assert.equal(host.room.mapId, "city");
  assert.equal(host.room.timeLimit, 600);
  assert.equal(host.room.maxHumans, 32);
  const lobby = new LobbyService();
  const messages = [];
  const socket = Object.assign(new EventEmitter(), { readyState: 1, send: message => messages.push(JSON.parse(message)) });
  const client = lobby.connect(socket);
  lobby.register(client, { alias: "Pilot", loadoutId: "raider" });
  lobby.createRoom(client, { ...setup, mapId: "wild", modeId: "8v8", bioDuration: 180 });
  const room = messages.findLast(message => message.type === "room_state").payload.room;
  assert.equal(room.battleModeId, "bio");
  assert.equal(room.timeLimit, 180);
  assert.equal(room.mapId, "city");
  assert.equal(room.maxHumans, 16);
});

test("titan attacks collapse whole buildings and open the same collision grid used by humans", () => {
  const game = solo();
  const building = game.bio.buildings[0], monster = game.bio.monsters[0];
  Object.assign(monster, { active: true, emerged: 4, x: building.x - 1, y: building.y + 1, spawnAt: 0 });
  for (let i = 0; i < 120; i++) { game.time -= .05; game.bio.update(game, .05); }
  assert.ok(game.bio.destroyed.includes(building.id));
  assert.equal(game.map.grid[building.y + 1][building.x + 1], ".");
  assert.equal(MAPS.city.grid[building.y + 1][building.x + 1], "B", "Static maps must remain reusable");
});

test("three titans have staggered authoritative schedules and distinct randomized emergence sources", () => {
  const battle = new BioBattle(MAPS.city, 8, 300, { random: () => .5 });
  assert.equal(battle.monsters.length, 3);
  assert.equal(new Set(battle.monsters.map(monster => monster.source)).size, 3);
  assert.ok(battle.monsters[1].spawnAt - battle.monsters[0].spawnAt > 10);
  assert.ok(battle.monsters[2].spawnAt > battle.monsters[1].spawnAt);
  const game = solo();
  game.time = 290;
  game.bio.update(game, .05);
  assert.equal(game.bio.monsters.filter(monster => monster.active).length, 1);
  assert.equal(game.vehicles.filter(vehicle => vehicle.type === "helicopter").length, 2);
});

test("all humans are allies, titan damage is authoritative, and eliminating all three wins", () => {
  for (const game of [solo(), network()]) {
    const attacker = game.actors[0], ally = game.actors.find(actor => actor.team !== attacker.team);
    const health = ally.health;
    game.damage(ally, 200, attacker, "ak47");
    assert.equal(ally.health, health);
    for (const monster of game.bio.monsters) {
      monster.active = true; monster.emerged = 4;
      game.damage(monster, monster.health + 1, attacker, "ak47");
    }
    game.bio.update(game, .01);
    assert.equal(game.bio.defeated, 3);
    assert.equal(game.finished, true);
    assert.equal(attacker.kills, 3);
  }
});

test("expired solo and server clocks make humans lose even before the final spawn", () => {
  const game = solo();
  let winner;
  game.emit = (type, payload) => { if (type === "finish") winner = payload.winner; };
  game.time = .01; game.update(.02, input());
  assert.equal(winner, "monsters");
  let now = 0, result;
  const match = network(value => { result = value; }, () => now);
  now = 300001; match.update(.05);
  assert.equal(result.winner, "monsters");
  assert.ok(result.rankings.every(entry => entry.result === "loss"));
  const delayed = solo();
  delayed.update(.05, input(), 2);
  assert.equal(delayed.time, 298, "Slow rendering must not extend the bio mission clock");
});

test("network snapshots apply demolished cover to local prediction and carry altitude inputs", () => {
  const match = network();
  const building = match.bio.buildings[0];
  building.health = 0; match.bio.destroyed.push(building.id); match.bio.clearBuilding(building);
  const packets = [];
  const client = { self: { id: "pilot", alias: "Pilot" }, sendInput: packet => packets.push(packet) };
  const game = new NetworkGameState(client, audio);
  game.start({ room: setup, assignment: match.assignmentFor("pilot") });
  game.applySnapshot(match.snapshotFor("pilot"));
  assert.equal(game.map.grid[building.y][building.x], ".");
  const map = game.map;
  game.applySnapshot(match.snapshotFor("pilot"));
  assert.equal(game.map, map, "Identical snapshots must not rebuild static terrain");
  game.update(.05, input({ z: 1 }));
  assert.equal(packets[0].movement.z, 1);
  match.setInput("pilot", packets[0]);
  assert.equal(match.inputs.get("pilot").movement.z, 1);
});

test("helicopters rise above cover, switch weapons, fire rockets and require a ground landing before exit", () => {
  for (const game of [solo(), network()]) {
    const actor = game.player || game.actorByUser.get("pilot");
    const heli = game.vehicles.find(vehicle => vehicle.type === "helicopter");
    actor.x = heli.x; actor.y = heli.y;
    assert.equal(game.toggleVehicle(actor, heli.id), true);
    for (let i = 0; i < 30; i++) game.bio.fly(heli, actor, { x: 0, y: 0, z: 1 }, .05);
    assert.ok(heli.z > 3);
    assert.equal(actor.z, heli.z);
    assert.equal(game.toggleVehicle(actor), false);
    if (game.player) game.handleAction(["weaponSlot", "secondary"]); else game.handleAction(actor, ["weaponSlot", "secondary"]);
    assert.equal(heli.weaponSlot, "secondary");
    assert.equal(game.fireVehicle(actor), true);
    assert.equal(game.bio.rockets.length, 1);
    assert.equal(game.fireVehicle(actor), false);
    for (let i = 0; i < 31; i++) game.bio.fly(heli, actor, { x: 0, y: 0, z: -1 }, .05);
    assert.equal(heli.z, 0);
    assert.equal(game.toggleVehicle(actor), true);
    assert.equal(actor.z, 0);
  }
});

test("a physical rocket hits a titan and shared persistence restores buildings, flight and spawn schedules", () => {
  const match = network();
  const actor = match.actorByUser.get("pilot"), heli = match.vehicles.find(vehicle => vehicle.type === "helicopter");
  const monster = match.bio.monsters[0];
  Object.assign(monster, { active: true, emerged: 4, x: 17.5, y: 18, spawnAt: 0 });
  Object.assign(actor, { x: 17.5, y: 22, z: 2, angle: -Math.PI / 2, pitch: 0 });
  Object.assign(heli, { z: 2, weaponSlot: "secondary", driverId: actor.id });
  const before = monster.health;
  match.bio.fireRocket(actor, heli);
  for (let i = 0; i < 25; i++) { match.time -= .02; match.bio.update(match, .02); }
  assert.ok(monster.health <= before - HELICOPTER_WEAPONS.secondary.damage * .5);
  const building = match.bio.buildings[0];
  building.health = 0; match.bio.destroyed.push(building.id); match.bio.clearBuilding(building);
  const restored = AuthoritativeMatch.fromState(match.exportState(), () => {}, () => {});
  assert.equal(restored.bio.monsters[1].spawnAt, match.bio.monsters[1].spawnAt);
  assert.equal(restored.map.grid[building.y][building.x], ".");
  assert.equal(restored.vehicles.find(vehicle => vehicle.id === heli.id).z, 2);
  assert.deepEqual(restored.bio.destroyed, [building.id]);
});
