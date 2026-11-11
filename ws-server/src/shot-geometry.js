import { isSolid } from "./game-config.js";

const MUZZLE_HEIGHT = .68;
const IMPACT_HEIGHT = .58;
const TRACE_STEP = .08;
export const MAX_AIM_PITCH = 1.4;

export function clampAimPitch(pitch = 0) {
  return Number.isFinite(pitch) ? Math.max(-MAX_AIM_PITCH, Math.min(MAX_AIM_PITCH, pitch)) : 0;
}

export function withinTargetElevation(actor, target) {
  const distance = Math.hypot(target.x - actor.x, target.y - actor.y);
  const height = MUZZLE_HEIGHT - Math.tan(clampAimPitch(actor.pitch)) * distance;
  return height >= 0 && height <= .84;
}

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function traceShotPath(map, actor, range, victim = null) {
  const angle = victim
    ? Math.atan2(victim.y - actor.y, victim.x - actor.x)
    : actor.angle;
  const pitch = victim ? 0 : clampAimPitch(actor.pitch);
  const directionX = Math.cos(angle) * Math.cos(pitch);
  const directionY = Math.sin(angle) * Math.cos(pitch);
  const muzzleHeight = MUZZLE_HEIGHT + (Number(actor.z) || 0);
  const from = {
    x: actor.x + directionX * .32,
    y: actor.y + directionY * .32,
    z: muzzleHeight,
  };

  if (finitePoint(victim)) {
    return {
      from,
      to: { x: victim.x, y: victim.y, z: victim.isMonster ? Math.max(.1, Math.min(victim.height, muzzleHeight - Math.tan(actor.pitch || 0) * Math.hypot(victim.x - actor.x, victim.y - actor.y))) : IMPACT_HEIGHT },
    };
  }

  let travelled = 0;
  let endX = from.x;
  let endY = from.y;
  while (travelled < range) {
    const nextDistance = Math.min(range, travelled + TRACE_STEP);
    const nextX = from.x + directionX * nextDistance;
    const nextY = from.y + directionY * nextDistance;
    if ((!(actor.z > .8) && isSolid(map, nextX, nextY)) || muzzleHeight - Math.sin(pitch) * nextDistance < 0) break;
    endX = nextX;
    endY = nextY;
    travelled = nextDistance;
  }

  return {
    from,
    to: { x: endX, y: endY, z: pitch || actor.z ? Math.max(0, muzzleHeight - Math.sin(pitch) * travelled) : IMPACT_HEIGHT },
  };
}

export function createShotEvent(map, actor, weapon, victim = null) {
  const path = traceShotPath(map, actor, weapon.range, victim);
  return {
    type: "shot",
    actorId: actor.id,
    userId: actor.userId ?? null,
    team: actor.team,
    weaponId: weapon.id,
    profile: weapon.visual,
    victimId: victim?.id ?? null,
    hit: Boolean(victim),
    ...path,
  };
}
