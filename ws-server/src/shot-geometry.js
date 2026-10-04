import { isSolid } from "./game-config.js";

const MUZZLE_HEIGHT = .68;
const IMPACT_HEIGHT = .58;
const TRACE_STEP = .08;

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function traceShotPath(map, actor, range, victim = null) {
  const angle = victim
    ? Math.atan2(victim.y - actor.y, victim.x - actor.x)
    : actor.angle;
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const from = {
    x: actor.x + directionX * .32,
    y: actor.y + directionY * .32,
    z: MUZZLE_HEIGHT,
  };

  if (finitePoint(victim)) {
    return {
      from,
      to: { x: victim.x, y: victim.y, z: IMPACT_HEIGHT },
    };
  }

  let travelled = 0;
  let endX = from.x;
  let endY = from.y;
  while (travelled < range) {
    const nextDistance = Math.min(range, travelled + TRACE_STEP);
    const nextX = from.x + directionX * nextDistance;
    const nextY = from.y + directionY * nextDistance;
    if (isSolid(map, nextX, nextY)) break;
    endX = nextX;
    endY = nextY;
    travelled = nextDistance;
  }

  return {
    from,
    to: { x: endX, y: endY, z: IMPACT_HEIGHT },
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
