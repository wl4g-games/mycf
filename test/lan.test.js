import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { LanHost } from "../src/lan/host.ts";
import { NetworkGameState } from "../src/network-game.js";
import {
  LAN_PROTOCOL_VERSION, decodeWireMessage, encodeWireMessage,
} from "../src/lan/protocol.ts";
import { decodeLanSignal, encodeLanSignal } from "../src/lan/qr-signaling.ts";
import {
  LAN_RTC_CONFIGURATION, createHostDataChannels, waitForIceGatheringComplete,
} from "../src/lan/peer.ts";

function signal(createdAt = Date.now()) {
  return {
    version: LAN_PROTOCOL_VERSION,
    kind: "offer",
    roomId: "ABC123",
    slotId: "slot-test",
    createdAt,
    description: {
      type: "offer",
      sdp: "v=0\r\na=candidate:1 1 UDP 2122260223 192.168.1.20 53244 typ host\r\na=end-of-candidates\r\n",
    },
  };
}

test("LAN QR signaling round-trips a complete non-trickle session description", () => {
  const encoded = encodeLanSignal(signal());
  assert.match(encoded, /^MYCF-LAN1:/);
  assert.ok(encoded.length < 2900);
  const decoded = decodeLanSignal(encoded, "offer");
  assert.equal(decoded.description.sdp.includes("typ host"), true);
  assert.equal(decoded.description.sdp.includes("end-of-candidates"), true);
  assert.equal(decoded.roomId, "ABC123");
});

test("LAN QR signaling rejects expired or mismatched descriptions", () => {
  const now = Date.now();
  const encoded = encodeLanSignal(signal(now));
  const originalNow = Date.now;
  Date.now = () => now + 11 * 60 * 1000;
  try {
    assert.throws(() => decodeLanSignal(encoded, "offer"), /expired/u);
  } finally {
    Date.now = originalNow;
  }
  assert.throws(() => decodeLanSignal(encodeLanSignal(signal()), "answer"), /could not be decoded|Expected/u);
});

test("LAN wire protocol retains the explicit input sequence and aim model", () => {
  const input = {
    type: "input",
    seq: 123,
    move: { x: .5, y: -1 },
    aim: { angle: 1.25, pitch: -.2 },
    fire: true,
    actions: [["grenade"]],
  };
  assert.deepEqual(decodeWireMessage(encodeWireMessage(input)), input);
  assert.equal(decodeWireMessage("not-json"), null);
});

test("LAN peers disable public ICE services and create two purpose-specific channels", () => {
  const calls = [];
  const peer = {
    createDataChannel(label, options) {
      calls.push({ label, options });
      return { label, ...options };
    },
  };
  const channels = createHostDataChannels(peer);
  assert.deepEqual(LAN_RTC_CONFIGURATION.iceServers, []);
  assert.deepEqual(calls, [
    { label: "state", options: { ordered: false, maxRetransmits: 0 } },
    { label: "reliable", options: { ordered: true } },
  ]);
  assert.equal(channels.state.label, "state");
  assert.equal(channels.reliable.label, "reliable");
});

test("LAN signaling waits for complete ICE gathering before exposing SDP", async () => {
  const listeners = new Set();
  const peer = {
    iceGatheringState: "gathering",
    localDescription: null,
    addEventListener(type, listener) { if (type === "icegatheringstatechange") listeners.add(listener); },
    removeEventListener(type, listener) { if (type === "icegatheringstatechange") listeners.delete(listener); },
  };
  const pending = waitForIceGatheringComplete(peer, 1000);
  peer.localDescription = signal().description;
  peer.iceGatheringState = "complete";
  for (const listener of listeners) listener();
  assert.deepEqual(await pending, signal().description);
  assert.equal(listeners.size, 0);
});

test("LAN room capacity follows the selected NvN mode and supports early AI fill", () => {
  const host = new LanHost({ alias: "Host", loadoutId: "recon", characterId: "maleAgent" }, {
    mapId: "city",
    modeId: "4v4",
    conditionId: "standard",
  });
  assert.equal(host.room.maxHumans, 8);
  assert.equal(host.minimumPlayers, 2);
  assert.equal(host.room.members.length, 1);
  assert.equal(host.startRoom(), false);
  const duel = new LanHost({ alias: "Duel", loadoutId: "recon", characterId: "maleAgent" }, {
    mapId: "city", modeId: "1v1", conditionId: "blitz",
  });
  const assault = new LanHost({ alias: "Assault", loadoutId: "recon", characterId: "maleAgent" }, {
    mapId: "wild", modeId: "16v16", conditionId: "marathon",
  });
  const medium = new LanHost({ alias: "Medium", loadoutId: "recon", characterId: "maleAgent" }, {
    mapId: "wild", modeId: "8v8", conditionId: "extended",
  });
  assert.equal(duel.room.maxHumans, 2);
  assert.equal(medium.room.maxHumans, 16);
  assert.equal(assault.room.maxHumans, 32);
});

test("the deployment screen exposes offline LAN role, QR, fallback, and debug controls", async () => {
  const [html, main, sources] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/main.js", import.meta.url), "utf8"),
    Promise.all(["peer.ts", "host.ts", "client.ts", "protocol.ts", "qr-signaling.ts"]
      .map(name => readFile(new URL(`../src/lan/${name}`, import.meta.url), "utf8"))),
  ]);
  for (const id of [
    "data-version=\"lan\"", "id=\"lan-create-button\"", "id=\"lan-join-button\"",
    "id=\"lan-qr-canvas\"", "id=\"lan-qr-reader\"", "id=\"lan-signal-value\"",
    "id=\"lan-debug\"",
  ]) assert.match(html, new RegExp(id));
  assert.match(main, /DEFAULT_CONDITION_ID, GAME_MODES,/u);
  assert.match(main, /new LanHost/u);
  assert.match(main, /new LanClient/u);
  assert.equal(sources.join("\n").includes("WebSocket"), false);
  assert.equal(sources.join("\n").includes("iceServers: []"), true);
});

test("LAN client snapshots interpolate remote actors instead of snapping", () => {
  const client = {
    interpolateSnapshots: true,
    self: { id: "local", alias: "Local", loadoutId: "recon", characterId: "maleAgent" },
    sendInput() { return true; },
  };
  const state = new NetworkGameState(client, {});
  state.start({
    room: { mapId: "city", modeId: "4v4", conditionId: "standard" },
    assignment: { actorId: "seal-0", team: "seal" },
    duration: 300,
  });
  const remote = {
    ...state.player,
    id: "terror-0",
    userId: "remote",
    isPlayer: false,
    team: "terror",
    x: state.player.x + 3,
    y: state.player.y,
    angle: 0,
  };
  state.actors.push(remote);
  const targetX = remote.x + 1;
  state.applySnapshot({
    mapId: "city",
    modeId: "4v4",
    conditionId: "standard",
    time: 299,
    score: { seal: 0, terror: 0 },
    finished: false,
    actors: [{ ...state.player }, { ...remote, x: targetX }],
    vehicles: state.vehicles.map(vehicle => ({ ...vehicle })),
    projectiles: [],
    effects: [],
    feed: [],
    playerId: state.player.id,
  });
  const sampled = state.actors.find(actor => actor.id === remote.id);
  assert.equal(sampled.x, remote.x);
  state.interpolateRemoteState(.05);
  assert.ok(sampled.x > remote.x && sampled.x < targetX);
});
