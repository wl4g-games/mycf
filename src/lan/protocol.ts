export const LAN_PROTOCOL_VERSION = 1 as const;
export const LAN_MAX_PLAYERS = 32;
export const LAN_SNAPSHOT_HZ = 20;
export const LAN_SIGNAL_TTL_MS = 10 * 60 * 1000;

export type LanTeam = "seal" | "terror";
export type LanConnectionRole = "host" | "client";
export type LanSignalKind = "offer" | "answer";
export type LanAction = [type: string, value?: unknown];

export interface LanVector2 {
  x: number;
  y: number;
}

export interface LanAim {
  angle: number;
  pitch?: number;
}

export interface LanPlayerProfile {
  id: string;
  alias: string;
  loadoutId: string;
  characterId: string;
  isHost: boolean;
}

export interface LanRoomState {
  id: string;
  ownerId: string;
  mapId: string;
  modeId: string;
  conditionId: string;
  killTarget: number;
  timeLimit: number;
  status: "waiting" | "playing" | "finished";
  maxHumans: number;
  members: LanPlayerProfile[];
}

export interface LanInputMessage {
  type: "input";
  seq: number;
  move: LanVector2;
  aim: LanAim;
  fire: boolean;
  actions: LanAction[];
}

export interface LanActorState {
  id: string;
  userId: string | null;
  isBot: boolean;
  isPlayer: boolean;
  name: string;
  team: LanTeam;
  index: number;
  x: number;
  y: number;
  angle: number;
  health: number;
  alive: boolean;
  respawn: number;
  kills: number;
  deaths: number;
  damage: number;
  characterId: string;
  loadoutId: string;
  weaponSlot: string;
  weaponId: string;
  throwableId: string;
  scoped: boolean;
}

export interface LanVehicleState {
  id: string;
  type: string;
  x: number;
  y: number;
  angle: number;
  turretAngle: number;
  health: number;
  speed: number;
  cooldown: number;
  driverId: string | null;
  occupied: boolean;
}

export interface LanProjectileState {
  id?: string;
  type: string;
  throwableId?: string;
  team?: LanTeam;
  x: number;
  y: number;
  z: number;
}

export interface LanEffectState {
  type: string;
  x: number;
  y: number;
  radius?: number;
  life: number;
  color?: string;
}

export interface LanFeedEntry {
  killer: string;
  killerTeam: LanTeam;
  victim: string;
  victimTeam: LanTeam;
  weapon: string;
  life: number;
}

export interface LanSnapshot {
  mapId: string;
  modeId: string;
  conditionId: string;
  killTarget: number;
  timeLimit: number;
  endsAt: number;
  playerId: string | null;
  time: number;
  score: Record<LanTeam, number>;
  finished: boolean;
  actors: LanActorState[];
  vehicles: LanVehicleState[];
  tank: LanVehicleState;
  projectiles: LanProjectileState[];
  effects: LanEffectState[];
  feed: LanFeedEntry[];
}

export interface LanStateSnapshotMessage {
  type: "snapshot";
  seq: number;
  sentAt: number;
  snapshot: LanSnapshot;
}

export type LanStateMessage = LanInputMessage | LanStateSnapshotMessage;

export interface LanJoinMessage {
  type: "join";
  profile: Omit<LanPlayerProfile, "id" | "isHost">;
}

export interface LanJoinedMessage {
  type: "joined";
  self: LanPlayerProfile;
  room: LanRoomState;
}

export interface LanRoomStateMessage {
  type: "room_state";
  room: LanRoomState;
}

export interface LanMatchStartPayload {
  room: LanRoomState;
  assignment: { actorId: string; team: LanTeam };
  duration: number;
  endsAt: number;
}

export interface LanMatchStartMessage {
  type: "match_start";
  payload: LanMatchStartPayload;
}

export interface LanCombatEvent {
  type: string;
  actorId?: string;
  userId?: string | null;
  team?: LanTeam;
  victimId?: string | null;
  hit?: boolean;
  weaponId?: string;
  profile?: string;
  [key: string]: unknown;
}

export interface LanCombatEventMessage {
  type: "combat_event";
  event: LanCombatEvent;
}

export interface LanRankingEntry {
  actorId: string;
  userId: string | null;
  isPlayer: boolean;
  name: string;
  team: LanTeam;
  isBot: boolean;
  characterId: string;
  kills: number;
  deaths: number;
  kd: number;
  damage: number;
  points: number;
  result: "win" | "loss";
  rank: number;
}

export interface LanMatchResult {
  winner: LanTeam;
  score: Record<LanTeam, number>;
  conditionId: string;
  killTarget: number;
  timeLimit: number;
  rankings: LanRankingEntry[];
}

export interface LanMatchEndMessage {
  type: "match_end";
  result: LanMatchResult;
}

export interface LanVitalsMessage {
  type: "vitals";
  actorId: string;
  health: number;
  alive: boolean;
  kills: number;
  deaths: number;
  score: Record<LanTeam, number>;
}

export interface LanPingMessage {
  type: "ping";
  nonce: string;
  sentAt: number;
}

export interface LanPongMessage {
  type: "pong";
  nonce: string;
  sentAt: number;
}

export interface LanLeaveMessage { type: "leave"; }
export interface LanHostClosedMessage { type: "host_closed"; reason: string; }
export interface LanProfileMessage {
  type: "profile";
  loadoutId: string;
  characterId: string;
}
export interface LanErrorMessage { type: "error"; code: string; message: string; }

export type LanReliableMessage =
  | LanJoinMessage
  | LanJoinedMessage
  | LanRoomStateMessage
  | LanMatchStartMessage
  | LanCombatEventMessage
  | LanMatchEndMessage
  | LanVitalsMessage
  | LanPingMessage
  | LanPongMessage
  | LanLeaveMessage
  | LanHostClosedMessage
  | LanProfileMessage
  | LanErrorMessage;

export interface LanSignalEnvelope {
  version: typeof LAN_PROTOCOL_VERSION;
  kind: LanSignalKind;
  roomId: string;
  slotId: string;
  createdAt: number;
  description: RTCSessionDescriptionInit;
}

export interface LanPeerDebug {
  id: string;
  alias: string;
  connectionState: RTCPeerConnectionState;
  iceState: RTCIceConnectionState;
  stateChannel: RTCDataChannelState;
  reliableChannel: RTCDataChannelState;
  rttMs: number | null;
}

export interface LanRoomSettings {
  mapId: string;
  modeId: string;
  conditionId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function encodeWireMessage(message: LanStateMessage | LanReliableMessage): string {
  return JSON.stringify(message);
}

export function decodeWireMessage(value: unknown): LanStateMessage | LanReliableMessage | null {
  if (typeof value !== "string" || value.length > 256 * 1024) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) && typeof parsed.type === "string"
      ? parsed as unknown as LanStateMessage | LanReliableMessage
      : null;
  } catch {
    return null;
  }
}

export function createLanId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.()
    || Array.from(globalThis.crypto?.getRandomValues?.(new Uint8Array(12)) || new Uint8Array(12), byte => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${random}`;
}
