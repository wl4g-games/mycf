import assert from "node:assert/strict";
import test from "node:test";
import { GameState } from "../src/game.js";
import { NetworkGameState } from "../src/network-game.js";
import { MAPS } from "../src/config.js";
import { traceShotPath, clampAimPitch, MAX_AIM_PITCH } from "../src/shot-geometry.js";
import { AuthoritativeMatch } from "../ws-server/src/match.js";

const silentAudio = new Proxy({}, { get: () => () => {} });

test("solo and authoritative matches reject shots aimed above or below a target", () => {
  const solo = new GameState(silentAudio);
  solo.configure({ modeId: "1v1" });
  const remote = new AuthoritativeMatch({ id: "AIM3D", mapId: "city", modeId: "1v1", conditionId: "standard" }, [{ id: "user-1", alias: "Aim", loadoutId: "raider" }], () => {}, () => {});
  for (const game of [solo, remote]) {
    const actor = game.actors.find(item => item.team === "seal");
    const enemy = game.actors.find(item => item.team === "terror");
    Object.assign(actor, { x: 4, y: 1.5, angle: 0, pitch: 0 });
    Object.assign(enemy, { x: 8, y: 1.5 });
    assert.equal(game.findTargetInArc(actor, 20, .05), enemy);
    actor.pitch = -.8;
    assert.equal(game.findTargetInArc(actor, 20, .05), null);
    actor.pitch = .8;
    assert.equal(game.findTargetInArc(actor, 20, .05), null);
  }
});

test("pitched miss trajectories move vertically and sanitize non-finite input", () => {
  const actor = { x: 12.5, y: 2, angle: Math.PI / 2, pitch: -.5 };
  assert.ok(traceShotPath(MAPS.city, actor, 3).to.z > .68);
  actor.pitch = .5;
  const ground = traceShotPath(MAPS.city, actor, 3);
  assert.ok(ground.to.z >= 0 && ground.to.z < .68);
  assert.equal(clampAimPitch(Infinity), 0);
  assert.equal(clampAimPitch(100), MAX_AIM_PITCH);
});

test("network input sends absolute pitch and server snapshots preserve its sanitized value", () => {
  const packets = [];
  const game = new NetworkGameState({ self: { id: "user-1", alias: "Aim" }, sendInput: packet => packets.push(packet) }, silentAudio);
  game.start({ room: { mapId: "city", modeId: "1v1" }, assignment: { actorId: "seal-0", team: "seal" } });
  game.update(.05, { yaw: 0, pitch: -.6, movement: { x: 0, y: 0 }, fireHeld: false, items: [] });
  assert.equal(packets[0].pitch, -.6);
  const match = new AuthoritativeMatch({ id: "AIM3D", mapId: "city", modeId: "1v1", conditionId: "standard" }, [{ id: "user-1", alias: "Aim" }], () => {}, () => {});
  match.setInput("user-1", packets[0]);
  match.update(.01);
  assert.equal(match.snapshotFor("user-1").actors.find(actor => actor.userId === "user-1").pitch, -.6);
  match.setInput("user-1", { pitch: -100 });
  assert.equal(match.inputs.get("user-1").pitch, -MAX_AIM_PITCH);
});
