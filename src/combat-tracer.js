const TRAJECTORY_PROFILES = new Set(["sniper", "pistol", "rifle", "machinegun", "dual", "bow"]);
const DEFAULT_LIFETIME = .16;
const MAX_TRACERS = 96;

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

export function createCombatTracer(event, localPlayerId, lifetime = DEFAULT_LIFETIME) {
  if (!event || event.type !== "shot" || !TRAJECTORY_PROFILES.has(event.profile)) return null;
  if (!finitePoint(event.from) || !finitePoint(event.to)) return null;
  const duration = Math.max(.04, Number(lifetime) || DEFAULT_LIFETIME);
  return {
    actorId: event.actorId,
    victimId: event.victimId ?? null,
    team: event.team,
    weaponId: event.weaponId,
    profile: event.profile,
    from: { ...event.from },
    to: { ...event.to },
    hit: Boolean(event.hit),
    incomingHit: Boolean(event.hit && localPlayerId && event.victimId === localPlayerId),
    life: duration,
    maxLife: duration,
  };
}

export class CombatTracerSystem {
  constructor({ lifetime = DEFAULT_LIFETIME, limit = MAX_TRACERS } = {}) {
    this.lifetime = lifetime;
    this.limit = limit;
    this.items = [];
  }

  trigger(event, localPlayerId) {
    const tracer = createCombatTracer(event, localPlayerId, this.lifetime);
    if (!tracer) return null;
    this.items.push(tracer);
    if (this.items.length > this.limit) this.items.splice(0, this.items.length - this.limit);
    return tracer;
  }

  advance(dt) {
    const delta = Math.max(0, Number(dt) || 0);
    if (delta <= 0) return this.items;
    for (const tracer of this.items) tracer.life -= delta;
    this.items = this.items.filter(tracer => tracer.life > 0);
    return this.items;
  }

  clear() {
    this.items.length = 0;
  }
}
