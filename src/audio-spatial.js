const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export const DEFAULT_FOOTSTEP_RANGE = 11;

export function spatialize(source, listener, maxDistance = 24) {
  if (!source || !listener || !Number.isFinite(source.x) || !Number.isFinite(source.y)) {
    return { audible: true, distance: 0, gain: 1, pan: 0 };
  }

  const dx = source.x - listener.x;
  const dy = source.y - listener.y;
  const distance = Math.hypot(dx, dy);
  const range = Math.max(1, Number(maxDistance) || 24);
  const angle = Number(listener.angle) || 0;
  const lateral = -dx * Math.sin(angle) + dy * Math.cos(angle);
  const pan = distance > .001 ? clamp(lateral / distance, -1, 1) : 0;
  const normalized = clamp(distance / range, 0, 1);

  return {
    audible: distance <= range,
    distance,
    gain: Math.pow(1 - normalized, 1.35),
    pan,
  };
}

export function combatRelation(event, listener) {
  if (!event || !listener) return "enemy";
  if (event.actorId === listener.id || (event.userId && event.userId === listener.userId)) return "self";
  return event.team === listener.team ? "ally" : "enemy";
}

export function distanceToSegment(point, start, end) {
  if (!point || !start || !end) return Infinity;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= .0001) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + dx * ratio), point.y - (start.y + dy * ratio));
}

export function createGrenadeAudioCue(event, listener) {
  const relation = combatRelation(event, listener);
  const spatial = spatialize(event?.from || event, listener, relation === "enemy" ? 15 : 11);
  const trajectoryDistance = event?.to
    ? distanceToSegment(listener, event.from, event.to)
    : spatial.distance;
  const travelX = (event?.to?.x ?? event?.from?.x ?? 0) - (event?.from?.x ?? 0);
  const travelY = (event?.to?.y ?? event?.from?.y ?? 0) - (event?.from?.y ?? 0);
  const towardListener = !event?.to
    || (listener.x - event.from.x) * travelX + (listener.y - event.from.y) * travelY > 0;
  const incoming = relation === "enemy" && towardListener && trajectoryDistance <= 5.2 && spatial.distance <= 24;
  const messageKeys = {
    self: "audio.grenadeOut",
    ally: "audio.friendlyGrenadeOut",
    enemy: "audio.grenadeIncoming",
  };

  return {
    ...spatial,
    relation,
    messageKey: messageKeys[relation],
    priority: relation === "enemy" ? 2 : 1,
    throwableId: event?.throwableId || "firework",
    incoming,
    trajectoryDistance,
    shouldSpeak: relation === "self" || (relation === "ally" && spatial.audible) || incoming,
  };
}

export class SpatialFootstepTracker {
  constructor({ stride = .62, maxDistance = DEFAULT_FOOTSTEP_RANGE, teleportDistance = 2.2, maxVoices = 4 } = {}) {
    this.stride = stride;
    this.maxDistance = maxDistance;
    this.teleportDistance = teleportDistance;
    this.maxVoices = maxVoices;
    this.states = new Map();
  }

  reset() {
    this.states.clear();
  }

  update(game, dt) {
    const listener = game?.player;
    if (!listener?.alive || !Array.isArray(game.actors)) {
      this.reset();
      return [];
    }

    const delta = Math.max(0, Number(dt) || 0);
    const vehicleDrivers = new Set(
      (Array.isArray(game.vehicles) ? game.vehicles : game.tank ? [game.tank] : [])
        .map(vehicle => vehicle?.driverId)
        .filter(driverId => driverId !== null && driverId !== undefined),
    );
    const active = new Set();
    const cues = [];
    for (const actor of game.actors) {
      if (!actor || !actor.alive || vehicleDrivers.has(actor.id)) continue;
      active.add(actor.id);
      let state = this.states.get(actor.id);
      if (!state) {
        state = { x: actor.x, y: actor.y, travel: 0, nextSide: "left" };
        this.states.set(actor.id, state);
        continue;
      }

      const movement = Math.hypot(actor.x - state.x, actor.y - state.y);
      state.x = actor.x;
      state.y = actor.y;
      if (delta <= 0 || movement > this.teleportDistance) {
        state.travel = 0;
        continue;
      }

      state.travel += movement;
      if (state.travel < this.stride) continue;
      state.travel %= this.stride;
      const spatial = spatialize(actor, listener, this.maxDistance);
      if (!spatial.audible) continue;
      cues.push({
        ...spatial,
        actorId: actor.id,
        relation: actor.id === listener.id ? "self" : actor.team === listener.team ? "ally" : "enemy",
        side: state.nextSide,
      });
      state.nextSide = state.nextSide === "left" ? "right" : "left";
    }

    for (const actorId of this.states.keys()) {
      if (!active.has(actorId)) this.states.delete(actorId);
    }

    return cues.sort((left, right) => left.distance - right.distance).slice(0, this.maxVoices);
  }
}
