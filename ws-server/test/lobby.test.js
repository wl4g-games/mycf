import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { LobbyService } from "../src/lobby.js";

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.outbox = [];
  }
  send(raw) { this.outbox.push(JSON.parse(raw)); }
  close() { this.readyState = 3; this.emit("close"); }
  receive(type, payload = {}) { this.emit("message", Buffer.from(JSON.stringify({ type, payload }))); }
  take(type) {
    const index = this.outbox.findIndex(message => message.type === type);
    return index < 0 ? null : this.outbox.splice(index, 1)[0].payload;
  }
}

test("registered users can create, invite, accept and start an underfilled room", () => {
  const lobby = new LobbyService();
  const ownerSocket = new FakeSocket();
  const guestSocket = new FakeSocket();
  const owner = lobby.connect(ownerSocket, {});
  const guest = lobby.connect(guestSocket, {});
  ownerSocket.receive("register", { alias: "Owner", loadoutId: "recon", characterId: "glamAgentBlack" });
  guestSocket.receive("register", { alias: "Guest", loadoutId: "raider", characterId: "specialForces" });
  assert.ok(ownerSocket.take("registered"));
  assert.ok(guestSocket.take("registered"));
  ownerSocket.receive("create_room", { mapId: "wild", modeId: "8v8", conditionId: "extended" });
  const created = ownerSocket.take("room_state").room;
  assert.equal(created.members.length, 1);
  assert.equal(created.maxHumans, 16);
  assert.deepEqual(
    { conditionId: created.conditionId, killTarget: created.killTarget, timeLimit: created.timeLimit },
    { conditionId: "extended", killTarget: 30, timeLimit: 480 },
  );
  assert.equal(created.members[0].characterId, "glamAgentBlack");
  ownerSocket.receive("invite", { targetId: guest.id });
  const invitation = guestSocket.take("invite");
  assert.equal(invitation.room.id, created.id);
  guestSocket.receive("respond_invite", { roomId: created.id, accept: true });
  assert.equal(lobby.rooms.get(created.id).members.length, 2);
  ownerSocket.receive("start_room");
  const matchStart = ownerSocket.take("match_start");
  assert.equal(matchStart.assignment.team, "seal");
  assert.equal(matchStart.duration, 480);
  const match = lobby.rooms.get(created.id).match;
  assert.equal(match.actors.length, 16);
  assert.equal(match.actors.filter(actor => actor.isBot).length, 14);
  assert.equal(match.actorByUser.get(owner.id).characterId, "glamAgentBlack");
  match.finished = true;
});

test("a 1v1 room reports two seats and fills an early start with one AI opponent", () => {
  const lobby = new LobbyService();
  const ownerSocket = new FakeSocket();
  const owner = lobby.connect(ownerSocket, {});
  ownerSocket.receive("register", { alias: "Duelist", loadoutId: "recon" });
  assert.ok(ownerSocket.take("registered"));
  ownerSocket.receive("create_room", { mapId: "city", modeId: "1v1", conditionId: "invalid", killTarget: 1, timeLimit: 1 });
  const created = ownerSocket.take("room_state").room;
  assert.equal(created.maxHumans, 2);
  assert.deepEqual(
    { conditionId: created.conditionId, killTarget: created.killTarget, timeLimit: created.timeLimit },
    { conditionId: "standard", killTarget: 20, timeLimit: 300 },
  );
  ownerSocket.receive("start_room");
  assert.ok(ownerSocket.take("match_start"));
  const match = lobby.rooms.get(created.id).match;
  assert.equal(match.actors.length, 2);
  assert.equal(match.actors.filter(actor => actor.isBot).length, 1);
  assert.deepEqual(match.assignmentFor(owner.id), { actorId: "seal-0", team: "seal" });
  match.finished = true;
});
