import { VEHICLE_TYPES, distance } from "./game-config.js";

export const VEHICLE_ENTRY_GRACE = .65;
export const ACTOR_COLLISION_RADIUS = .24;

export function vehicleProfile(vehicle) {
  return VEHICLE_TYPES[vehicle?.type] || VEHICLE_TYPES.tank;
}

export function createVehicleStates(map) {
  const spawns = Array.isArray(map?.vehicles) && map.vehicles.length
    ? map.vehicles
    : [{ id: `${map?.id || "map"}-tank`, type: "tank", ...(map?.tank || {}) }];
  return spawns.map((spawn, index) => {
    const profile = VEHICLE_TYPES[spawn.type] || VEHICLE_TYPES.tank;
    const angle = Number.isFinite(spawn.angle) ? spawn.angle : 0;
    return {
      ...spawn,
      id: spawn.id || `${map?.id || "map"}-vehicle-${index}`,
      type: profile.id,
      angle,
      turretAngle: angle,
      health: profile.maxHealth,
      maxHealth: profile.maxHealth,
      occupied: false,
      driverId: null,
      speed: 0,
      cooldown: 0,
    };
  });
}

export function drivenVehicle(vehicles, actorId) {
  if (!actorId) return null;
  return vehicles.find(vehicle => vehicle.driverId === actorId) || null;
}

export function resolveInteractionVehicle(vehicles, actor, requestedId = null, grace = 0) {
  const active = drivenVehicle(vehicles, actor?.id);
  if (active) return active;
  if (!actor) return null;
  return vehicles
    .filter(vehicle => (!requestedId || vehicle.id === requestedId)
      && !vehicle.driverId
      && vehicle.health > 0
      && distance(actor, vehicle) <= vehicleProfile(vehicle).interactionRange + Math.max(0, grace))
    .sort((left, right) => distance(actor, left) - distance(actor, right) || left.id.localeCompare(right.id))[0] || null;
}

export function vehicleExitCandidates(vehicle) {
  const clearance = vehicleProfile(vehicle).radius + ACTOR_COLLISION_RADIUS + .2;
  const directions = [Math.PI / 2, -Math.PI / 2, Math.PI, 0];
  const candidates = [];
  for (const scale of [1, 1.35]) {
    for (const offset of directions) {
      const angle = vehicle.angle + offset;
      candidates.push({
        x: vehicle.x + Math.cos(angle) * clearance * scale,
        y: vehicle.y + Math.sin(angle) * clearance * scale,
      });
    }
  }
  return candidates;
}

export function collidesWithVehicle(vehicles, x, y, radius, ignoredVehicleId = null) {
  return vehicles.some(vehicle => vehicle.id !== ignoredVehicleId
    && vehicle.health > 0
    && Math.hypot(vehicle.x - x, vehicle.y - y) < vehicleProfile(vehicle).radius + radius);
}

export function collidesWithActor(actors, x, y, radius, ignoredActorId = null) {
  return actors.some(actor => actor.id !== ignoredActorId
    && actor.alive
    && Math.hypot(actor.x - x, actor.y - y) < ACTOR_COLLISION_RADIUS + radius);
}

export function advanceVehicle(vehicle, movement, dt, move) {
  const profile = vehicleProfile(vehicle);
  const drive = -(Number(movement?.y) || 0);
  const steer = Number(movement?.x) || 0;
  vehicle.speed += (drive * profile.acceleration - vehicle.speed * profile.drag) * dt;
  vehicle.speed = Math.max(-profile.reverseSpeed, Math.min(profile.maxSpeed, vehicle.speed));
  vehicle.angle = Math.atan2(
    Math.sin(vehicle.angle + steer * dt * (profile.steering + Math.abs(vehicle.speed) * profile.speedSteering)),
    Math.cos(vehicle.angle + steer * dt * (profile.steering + Math.abs(vehicle.speed) * profile.speedSteering)),
  );
  move(
    Math.cos(vehicle.angle) * vehicle.speed * dt,
    Math.sin(vehicle.angle) * vehicle.speed * dt,
    profile.radius,
  );
}
