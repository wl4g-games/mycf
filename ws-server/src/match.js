import {
  BOT_NAMES, GAME_MODES, LOADOUTS, MAPS, TEAM, THROWABLES, WEAPONS,
  botCharacterId, clamp, createMatchResult, distance, isSolid, normalizeAngle, resolveCharacterId,
  resolveMatchCondition, spawnCells,
} from "./game-config.js";
import { createShotEvent } from "./shot-geometry.js";
import {
  ACTOR_COLLISION_RADIUS, VEHICLE_ENTRY_GRACE, advanceVehicle, collidesWithActor, collidesWithVehicle,
  createVehicleStates, drivenVehicle, resolveInteractionVehicle, vehicleExitCandidates, vehicleProfile,
} from "./vehicle-system.js";

const TEAMS = [TEAM.SEAL, TEAM.TERROR];
const MATCH_STATE_VERSION = 1;
const randomItem = list => list[Math.floor(Math.random() * list.length)];

function publicProjectile(projectile) {
  return {
    id: projectile.id,
    type: projectile.type,
    throwableId: projectile.throwableId,
    team: projectile.team,
    x: projectile.x,
    y: projectile.y,
    z: projectile.z,
  };
}

function publicActor(actor, ownActor) {
  return {
    id: actor.id,
    userId: actor.userId,
    isBot: actor.isBot,
    isPlayer: Boolean(ownActor && actor.id === ownActor.id),
    name: actor.name,
    team: actor.team,
    index: actor.index,
    x: actor.x,
    y: actor.y,
    angle: actor.angle,
    health: actor.health,
    alive: actor.alive,
    respawn: actor.respawn,
    kills: actor.kills,
    deaths: actor.deaths,
    damage: actor.damage,
    characterId: actor.characterId,
    loadoutId: actor.loadoutId,
    weaponSlot: actor.weaponSlot,
    weaponId: actor.weaponId,
    throwableId: actor.throwableId,
    scoped: actor.scoped,
  };
}

export class AuthoritativeMatch {
  constructor(room, members, emit, finish, {
    now = () => performance.now(),
    epochNow = () => Date.now(),
  } = {}) {
    this.roomId = room.id;
    this.map = MAPS[room.mapId] || MAPS.city;
    this.mode = GAME_MODES[room.modeId] || GAME_MODES["4v4"];
    this.rules = resolveMatchCondition(room);
    this.emit = emit;
    this.onFinish = finish;
    this.now = now;
    this.epochNow = epochNow;
    this.deadline = this.now() + this.rules.timeLimit * 1000;
    this.endsAt = this.epochNow() + this.rules.timeLimit * 1000;
    this.time = this.rules.timeLimit;
    this.score = { seal: 0, terror: 0 };
    this.actors = [];
    this.projectileSequence = 0;
    this.projectiles = [];
    this.effects = [];
    this.feed = [];
    this.inputs = new Map();
    this.actorByUser = new Map();
    this.finished = false;
    this.vehicles = createVehicleStates(this.map);
    this.syncVehicleAliases();
    this.createActors(members);
  }

  static fromState(state, emit, finish, {
    now = () => performance.now(),
    epochNow = () => Date.now(),
  } = {}) {
    if (!state || state.schemaVersion !== MATCH_STATE_VERSION) {
      throw new Error("Unsupported match state schema.");
    }
    const match = Object.create(AuthoritativeMatch.prototype);
    match.roomId = String(state.roomId || "");
    match.map = MAPS[state.mapId] || MAPS.city;
    match.mode = GAME_MODES[state.modeId] || GAME_MODES["4v4"];
    match.rules = resolveMatchCondition({ conditionId: state.conditionId });
    match.emit = emit;
    match.onFinish = finish;
    match.now = now;
    match.epochNow = epochNow;
    match.endsAt = Number.isFinite(state.endsAt) ? state.endsAt : epochNow();
    const remainingMs = Math.max(0, match.endsAt - epochNow());
    match.deadline = now() + remainingMs;
    match.time = remainingMs / 1000;
    match.score = {
      seal: Number(state.score?.seal) || 0,
      terror: Number(state.score?.terror) || 0,
    };
    match.actors = Array.isArray(state.actors) ? state.actors.map(actor => ({ ...actor })) : [];
    const actorById = new Map(match.actors.map(actor => [actor.id, actor]));
    match.actorByUser = new Map(
      match.actors.filter(actor => actor.userId).map(actor => [actor.userId, actor]),
    );
    match.inputs = new Map(
      Array.isArray(state.inputs)
        ? state.inputs
          .filter(([userId]) => match.actorByUser.has(userId))
          .map(([userId, input]) => [userId, {
            movement: {
              x: clamp(Number(input?.movement?.x) || 0, -1, 1),
              y: clamp(Number(input?.movement?.y) || 0, -1, 1),
            },
            angle: normalizeAngle(Number(input?.angle) || 0),
            fireHeld: false,
            actions: [],
          }])
        : [],
    );
    for (const [userId, actor] of match.actorByUser) {
      if (!match.inputs.has(userId)) match.inputs.set(userId, match.emptyInput(actor.angle));
    }
    match.vehicles = Array.isArray(state.vehicles) && state.vehicles.length
      ? state.vehicles.map(vehicle => ({ ...vehicle }))
      : createVehicleStates(match.map);
    match.syncVehicleAliases();
    match.projectiles = Array.isArray(state.projectiles)
      ? state.projectiles.map(projectile => {
        const { ownerActorId, ...projectileState } = projectile;
        return {
          ...projectileState,
          owner: actorById.get(ownerActorId) || null,
        };
      })
      : [];
    match.projectileSequence = Math.max(0, Number(state.projectileSequence) || 0);
    match.effects = Array.isArray(state.effects) ? state.effects.map(effect => ({ ...effect })) : [];
    match.feed = Array.isArray(state.feed) ? state.feed.map(entry => ({ ...entry })) : [];
    match.finished = Boolean(state.finished);
    return match;
  }

  syncVehicleAliases() {
    this.tank = this.vehicles.find(vehicle => vehicle.type === "tank") || this.vehicles[0];
    this.armoredCar = this.vehicles.find(vehicle => vehicle.type === "armoredCar") || null;
  }

  createActors(members) {
    for (const team of TEAMS) {
      const cells = spawnCells(this.map, team);
      for (let index = 0; index < this.mode.teamSize; index += 1) {
        const preferred = (index * 7) % cells.length;
        const [x, y] = Array.from({ length: cells.length }, (_, offset) => cells[(preferred + offset) % cells.length])
          .find(([cellX, cellY]) => !this.collides(cellX + .5, cellY + .5, ACTOR_COLLISION_RADIUS))
          || cells[preferred];
        const rawName = BOT_NAMES[team][index] || `${team.toUpperCase()}-${index + 1}`;
        const loadout = team === TEAM.SEAL ? LOADOUTS.police : LOADOUTS.raider;
        this.actors.push({
          id: `${team}-${index}`,
          userId: null,
          isBot: true,
          name: rawName,
          team,
          index,
          x: x + .5,
          y: y + .5,
          angle: team === TEAM.SEAL ? -Math.PI / 2 : Math.PI / 2,
          health: 100,
          alive: true,
          respawn: 0,
          cooldown: Math.random(),
          decision: Math.random(),
          strafe: Math.random() > .5 ? 1 : -1,
          avoidTimer: 0,
          avoidAngle: 0,
          routeIndex: 0,
          kills: 0,
          deaths: 0,
          damage: 0,
          characterId: botCharacterId(team, index),
          loadoutId: loadout.id,
          weaponSlot: "primary",
          weaponId: loadout.primary,
          throwableId: loadout.throwable,
          scoped: false,
        });
      }
    }

    members.forEach((member, memberIndex) => {
      const team = TEAMS[memberIndex % TEAMS.length];
      const actorIndex = Math.floor(memberIndex / TEAMS.length);
      const actor = this.actors.find(item => item.team === team && item.index === actorIndex);
      if (!actor) return;
      const loadout = LOADOUTS[member.loadoutId] || LOADOUTS.recon;
      Object.assign(actor, {
        userId: member.id,
        isBot: false,
        name: member.alias,
        characterId: resolveCharacterId(member.characterId),
        loadoutId: loadout.id,
        weaponSlot: "primary",
        weaponId: loadout.primary,
        throwableId: loadout.throwable,
      });
      this.actorByUser.set(member.id, actor);
      this.inputs.set(member.id, this.emptyInput(actor.angle));
    });
  }

  emptyInput(angle = 0) {
    return { movement: { x: 0, y: 0 }, angle, fireHeld: false, actions: [] };
  }

  assignmentFor(userId) {
    const actor = this.actorByUser.get(userId);
    return actor ? { actorId: actor.id, team: actor.team } : null;
  }

  setInput(userId, payload = {}) {
    const actor = this.actorByUser.get(userId);
    if (!actor || this.finished) return;
    const movement = payload.movement || {};
    const input = this.inputs.get(userId) || this.emptyInput(actor.angle);
    input.movement = {
      x: clamp(Number(movement.x) || 0, -1, 1),
      y: clamp(Number(movement.y) || 0, -1, 1),
    };
    if (Number.isFinite(payload.angle)) input.angle = normalizeAngle(payload.angle);
    input.fireHeld = Boolean(payload.fireHeld);
    if (Array.isArray(payload.actions)) {
      input.actions.push(...payload.actions.slice(0, 8).filter(action => Array.isArray(action) && typeof action[0] === "string"));
      input.actions = input.actions.slice(-12);
    }
    this.inputs.set(userId, input);
  }

  update(dt) {
    if (this.finished) return;
    dt = Math.min(.05, Math.max(.001, dt));
    this.time = Math.max(0, (this.deadline - this.now()) / 1000);
    for (const vehicle of this.vehicles) vehicle.cooldown = Math.max(0, vehicle.cooldown - dt);
    for (const [userId, actor] of this.actorByUser) {
      if (!actor.alive) continue;
      const input = this.inputs.get(userId) || this.emptyInput(actor.angle);
      actor.cooldown = Math.max(0, actor.cooldown - dt);
      actor.angle = input.angle;
      const vehicle = drivenVehicle(this.vehicles, actor.id);
      if (vehicle) vehicle.turretAngle = actor.angle;
      for (const action of input.actions.splice(0)) this.handleAction(actor, action);
      this.updateHuman(actor, dt, input);
    }
    this.updateBots(dt);
    this.updateProjectiles(dt);
    this.updateRespawns(dt);
    this.effects = this.effects.filter(effect => (effect.life -= dt) > 0);
    this.feed = this.feed.filter(entry => (entry.life -= dt) > 0);
    if (this.time <= 0) this.finish(this.score.seal >= this.score.terror ? TEAM.SEAL : TEAM.TERROR);
  }

  updateHuman(actor, dt, input) {
    const vehicle = drivenVehicle(this.vehicles, actor.id);
    if (vehicle) {
      advanceVehicle(vehicle, input.movement, dt, (dx, dy, radius) => this.moveVehicle(vehicle, dx, dy, radius));
      actor.x = vehicle.x;
      actor.y = vehicle.y;
      if (input.fireHeld) this.fireVehicle(actor);
      return;
    }
    const speed = actor.scoped ? 1.35 : 3.1;
    const forward = -input.movement.y;
    const strafe = input.movement.x;
    const dx = (Math.cos(actor.angle) * forward + Math.cos(actor.angle + Math.PI / 2) * strafe) * speed * dt;
    const dy = (Math.sin(actor.angle) * forward + Math.sin(actor.angle + Math.PI / 2) * strafe) * speed * dt;
    this.moveEntity(actor, dx, dy, ACTOR_COLLISION_RADIUS);
    const weapon = WEAPONS[actor.weaponId];
    if (input.fireHeld && weapon?.automatic) this.attack(actor);
  }

  handleAction(actor, [type, value]) {
    const driving = Boolean(drivenVehicle(this.vehicles, actor.id));
    if (type === "weaponSlot" && !driving) this.selectSlot(actor, value);
    if (type === "backpack" && !driving) this.cycleLoadout(actor);
    if (type === "scope" && actor.weaponId === "barrett" && !driving) actor.scoped = !actor.scoped;
    if (type === "grenade" && !driving) this.throwGrenade(actor);
    if (type === "interact") this.toggleVehicle(actor, value);
    if (type === "fire") drivenVehicle(this.vehicles, actor.id) ? this.fireVehicle(actor) : this.attack(actor);
  }

  selectSlot(actor, slot) {
    const loadout = LOADOUTS[actor.loadoutId] || LOADOUTS.recon;
    const weaponId = loadout[slot];
    if (!weaponId || !WEAPONS[weaponId]) return;
    actor.weaponSlot = slot;
    actor.weaponId = weaponId;
    actor.scoped = false;
  }

  cycleLoadout(actor) {
    const ids = Object.keys(LOADOUTS);
    const loadout = LOADOUTS[ids[(ids.indexOf(actor.loadoutId) + 1) % ids.length]];
    actor.loadoutId = loadout.id;
    actor.weaponSlot = "primary";
    actor.weaponId = loadout.primary;
    actor.throwableId = loadout.throwable;
    actor.scoped = false;
  }

  attack(actor) {
    if (!actor.alive || actor.cooldown > 0) return;
    const weapon = WEAPONS[actor.weaponId] || WEAPONS.ak47;
    actor.cooldown = weapon.interval;
    const spread = actor.scoped && weapon.scopedSpread != null ? weapon.scopedSpread : weapon.spread;
    const victim = this.findTargetInArc(actor, weapon.range, spread);
    this.commitShot(actor, weapon, victim, weapon.damage);
  }

  commitShot(actor, weapon, victim, damage = 0) {
    this.emit(createShotEvent(this.map, actor, weapon, victim));
    if (victim && damage > 0) this.damage(victim, damage, actor, weapon.id);
  }

  findTargetInArc(actor, range, margin) {
    let selected = null;
    let best = Infinity;
    for (const target of this.actors) {
      if (!target.alive || target.team === actor.team || target === actor) continue;
      const targetDistance = distance(actor, target);
      if (targetDistance > range || !this.hasLineOfSight(actor, target)) continue;
      const angle = Math.abs(normalizeAngle(Math.atan2(target.y - actor.y, target.x - actor.x) - actor.angle));
      const allowed = Math.max(margin, Math.atan(.3 / targetDistance));
      if (angle < allowed && angle + targetDistance * .0005 < best) {
        selected = target;
        best = angle + targetDistance * .0005;
      }
    }
    return selected;
  }

  throwGrenade(actor) {
    if (actor.cooldown > 0) return;
    actor.cooldown = .62;
    const projectile = {
      id: `${this.roomId}-grenade-${++this.projectileSequence}`,
      type: "grenade",
      throwableId: actor.throwableId || "firework",
      x: actor.x + Math.cos(actor.angle) * .45,
      y: actor.y + Math.sin(actor.angle) * .45,
      z: .65,
      vx: Math.cos(actor.angle) * 6,
      vy: Math.sin(actor.angle) * 6,
      vz: 3.25,
      life: 1.65,
      owner: actor,
      team: actor.team,
    };
    this.projectiles.push(projectile);
    this.emit({
      type: "grenade_throw",
      projectileId: projectile.id,
      actorId: actor.id,
      userId: actor.userId,
      team: actor.team,
      throwableId: projectile.throwableId,
      from: { x: projectile.x, y: projectile.y, z: projectile.z },
      to: { x: projectile.x + projectile.vx * projectile.life, y: projectile.y + projectile.vy * projectile.life, z: 0 },
    });
  }

  toggleVehicle(actor, requestedId = null) {
    const active = drivenVehicle(this.vehicles, actor.id);
    if (active) {
      const exit = vehicleExitCandidates(active)
        .find(candidate => !this.collides(candidate.x, candidate.y, ACTOR_COLLISION_RADIUS, active.id)
          && !this.actors.some(other => other !== actor && other.alive
            && distance(other, candidate) < ACTOR_COLLISION_RADIUS * 2));
      if (!exit) return false;
      active.driverId = null;
      active.occupied = false;
      active.speed = 0;
      Object.assign(actor, exit);
      return true;
    }

    const grace = requestedId ? VEHICLE_ENTRY_GRACE : 0;
    const vehicle = resolveInteractionVehicle(this.vehicles, actor, requestedId, grace);
    if (!vehicle) return false;
    vehicle.driverId = actor.id;
    vehicle.occupied = true;
    vehicle.turretAngle = actor.angle;
    actor.scoped = false;
    actor.x = vehicle.x;
    actor.y = vehicle.y;
    return true;
  }

  fireVehicle(actor) {
    const vehicle = drivenVehicle(this.vehicles, actor.id);
    if (!vehicle || vehicle.cooldown > 0) return false;
    const weapon = vehicleProfile(vehicle).weapon;
    vehicle.cooldown = weapon.interval;
    if (weapon.kind === "hitscan") {
      const victim = this.findTargetInArc(actor, weapon.range, weapon.spread);
      this.commitShot(actor, weapon, victim, weapon.damage);
      return true;
    }

    this.projectiles.push({
      type: "shell",
      vehicleId: vehicle.id,
      weaponId: weapon.id,
      blastRadius: weapon.blastRadius,
      damage: weapon.damage,
      x: vehicle.x + Math.cos(vehicle.turretAngle) * weapon.muzzleOffset,
      y: vehicle.y + Math.sin(vehicle.turretAngle) * weapon.muzzleOffset,
      z: .65,
      vx: Math.cos(vehicle.turretAngle) * weapon.projectileSpeed,
      vy: Math.sin(vehicle.turretAngle) * weapon.projectileSpeed,
      vz: 0,
      life: weapon.projectileLife,
      owner: actor,
      team: actor.team,
    });
    this.emit({
      type: "tank_shot",
      actorId: actor.id,
      userId: actor.userId,
      team: actor.team,
      vehicleId: vehicle.id,
      vehicleType: vehicle.type,
      x: vehicle.x,
      y: vehicle.y,
    });
    return true;
  }

  toggleTank(actor) { return this.toggleVehicle(actor, this.tank?.id); }

  fireTank(actor) { return this.fireVehicle(actor); }

  updateBots(dt) {
    for (const bot of this.actors) {
      if (!bot.isBot || !bot.alive) continue;
      bot.cooldown = Math.max(0, bot.cooldown - dt);
      bot.decision -= dt;
      const enemies = this.actors.filter(actor => actor.alive && actor.team !== bot.team);
      if (!enemies.length) continue;
      const target = enemies.reduce((best, actor) => distance(bot, actor) < distance(bot, best) ? actor : best, enemies[0]);
      const targetDistance = distance(bot, target);
      const visible = targetDistance < 18 && this.hasLineOfSight(bot, target);
      const route = this.map.routes[bot.team];
      if (!visible && bot.routeIndex < route.length && distance(bot, { x: route[bot.routeIndex][0], y: route[bot.routeIndex][1] }) < 1.3) bot.routeIndex += 1;
      const navigation = !visible && bot.routeIndex < route.length ? { x: route[bot.routeIndex][0], y: route[bot.routeIndex][1] } : target;
      const targetAngle = Math.atan2(navigation.y - bot.y, navigation.x - bot.x);
      bot.avoidTimer = Math.max(0, bot.avoidTimer - dt);
      const desiredAngle = bot.avoidTimer > 0 ? bot.avoidAngle : targetAngle;
      bot.angle = normalizeAngle(bot.angle + clamp(normalizeAngle(desiredAngle - bot.angle), -dt * 2.5, dt * 2.5));
      if (bot.decision <= 0) {
        bot.decision = .7 + Math.random() * 1.4;
        if (Math.random() < .3) bot.strafe *= -1;
      }
      const forward = targetDistance > (visible ? 6 : 1.4) ? 1 : targetDistance < 3 ? -.65 : 0;
      const strafe = visible ? bot.strafe * .48 : 0;
      const speed = 1.25 + (bot.index % 4) * .06;
      const dx = (Math.cos(bot.angle) * forward + Math.cos(bot.angle + Math.PI / 2) * strafe) * speed * dt;
      const dy = (Math.sin(bot.angle) * forward + Math.sin(bot.angle + Math.PI / 2) * strafe) * speed * dt;
      if (!this.moveEntity(bot, dx, dy, .22)) {
        bot.strafe *= -1;
        bot.avoidTimer = .65 + Math.random() * .8;
        bot.avoidAngle = normalizeAngle(targetAngle + bot.strafe * (Math.PI * .42 + Math.random() * .35));
      }
      const weapon = WEAPONS[bot.weaponId] || WEAPONS.ak47;
      if (visible && targetDistance < weapon.range && Math.abs(normalizeAngle(Math.atan2(target.y - bot.y, target.x - bot.x) - bot.angle)) < .2 && bot.cooldown <= 0) {
        bot.cooldown = Math.max(.16, weapon.interval * 2.8 + Math.random() * .45);
        const victim = Math.random() < clamp(.78 - targetDistance * .035, .2, .72) ? target : null;
        this.commitShot(bot, weapon, victim, weapon.damage * .34);
      }
      if (Math.random() < dt * .008 && targetDistance < 10) this.throwGrenade(bot);
    }
  }

  updateProjectiles(dt) {
    for (const projectile of this.projectiles) {
      projectile.life -= dt;
      const nextX = projectile.x + projectile.vx * dt;
      const nextY = projectile.y + projectile.vy * dt;
      let collided = false;
      if (isSolid(this.map, nextX, projectile.y)) { projectile.vx *= projectile.type === "grenade" ? -.48 : 0; collided = true; } else projectile.x = nextX;
      if (isSolid(this.map, projectile.x, nextY)) { projectile.vy *= projectile.type === "grenade" ? -.48 : 0; collided = true; } else projectile.y = nextY;
      if (projectile.type === "grenade") {
        projectile.vz -= 7.8 * dt;
        projectile.z += projectile.vz * dt;
        if (projectile.z < .06) { projectile.z = .06; projectile.vz *= -.42; projectile.vx *= .72; projectile.vy *= .72; }
      }
      if (projectile.type === "shell" && collided) projectile.life = 0;
      if (projectile.life <= 0) this.explode(projectile);
    }
    this.projectiles = this.projectiles.filter(projectile => projectile.life > 0);
  }

  explode(projectile) {
    const throwable = projectile.type === "shell" ? null : THROWABLES[projectile.throwableId] || THROWABLES.firework;
    const radius = projectile.type === "shell" ? projectile.blastRadius || 4.5 : throwable.radius;
    const power = projectile.type === "shell" ? projectile.damage || 195 : throwable.damage;
    const type = projectile.type === "shell" ? "shell" : throwable.smoke ? "smoke" : throwable.firework ? "firework" : "skull";
    this.effects.push({ x: projectile.x, y: projectile.y, life: type === "smoke" ? 7 : .7, maxLife: type === "smoke" ? 7 : .7, radius, type });
    this.emit({ type: "explosion", explosionType: type, x: projectile.x, y: projectile.y });
    if (!power) return;
    for (const actor of this.actors) {
      if (!actor.alive || actor.team === projectile.team) continue;
      const actorDistance = distance(actor, projectile);
      if (actorDistance < radius && this.hasClearGeometry(projectile, actor)) {
        this.damage(actor, power * (1 - actorDistance / radius), projectile.owner, projectile.type === "shell" ? projectile.weaponId || "tankCannon" : throwable.id);
      }
    }
  }

  damage(target, amount, attacker, weapon) {
    if (!target.alive || !attacker || target.team === attacker.team) return;
    const vehicle = drivenVehicle(this.vehicles, target.id);
    if (vehicle) {
      const appliedDamage = Math.min(vehicle.health, amount * vehicleProfile(vehicle).armorScale);
      vehicle.health = Math.max(0, vehicle.health - appliedDamage);
      attacker.damage += appliedDamage;
      if (vehicle.health <= 0) {
        vehicle.driverId = null;
        vehicle.occupied = false;
        vehicle.speed = 0;
        target.health = 0;
        this.kill(target, attacker, weapon);
      }
      return;
    }
    target.health -= amount;
    attacker.damage += amount;
    if (target.health <= 0) this.kill(target, attacker, weapon);
  }

  kill(victim, attacker, weapon) {
    victim.health = 0;
    victim.alive = false;
    victim.respawn = 3.2;
    victim.deaths += 1;
    victim.scoped = false;
    attacker.kills += 1;
    this.score[attacker.team] += 1;
    const entry = { killer: attacker.name, killerTeam: attacker.team, victim: victim.name, victimTeam: victim.team, weapon, life: 5 };
    this.feed.unshift(entry);
    this.feed = this.feed.slice(0, 6);
    this.emit({ type: "kill", attackerUserId: attacker.userId, victimUserId: victim.userId, ...entry });
    const vehicle = drivenVehicle(this.vehicles, victim.id);
    if (vehicle) {
      vehicle.driverId = null;
      vehicle.occupied = false;
      vehicle.speed = 0;
    }
    if (this.score[attacker.team] >= this.rules.killTarget) this.finish(attacker.team);
  }

  updateRespawns(dt) {
    for (const actor of this.actors) {
      if (actor.alive) continue;
      actor.respawn -= dt;
      if (actor.respawn <= 0 && !this.finished) this.respawn(actor);
    }
  }

  respawn(actor) {
    const cells = spawnCells(this.map, actor.team);
    const available = cells.filter(([x, y]) => !this.collides(x + .5, y + .5, ACTOR_COLLISION_RADIUS));
    const [x, y] = randomItem(available.length ? available : cells);
    actor.x = x + .5;
    actor.y = y + .5;
    actor.health = 100;
    actor.alive = true;
    actor.cooldown = .6;
    actor.angle = actor.team === TEAM.SEAL ? -Math.PI / 2 : Math.PI / 2;
    actor.routeIndex = 0;
  }

  moveEntity(entity, dx, dy, radius, ignoredVehicleId = null) {
    let moved = false;
    if (!this.collides(entity.x + dx, entity.y, radius, ignoredVehicleId)) { entity.x += dx; moved = moved || Math.abs(dx) > 0; }
    if (!this.collides(entity.x, entity.y + dy, radius, ignoredVehicleId)) { entity.y += dy; moved = moved || Math.abs(dy) > 0; }
    return moved;
  }

  moveVehicle(vehicle, dx, dy, radius) {
    const blocked = (x, y) => this.collides(x, y, radius, vehicle.id)
      || collidesWithActor(this.actors, x, y, radius, vehicle.driverId);
    let moved = false;
    if (!blocked(vehicle.x + dx, vehicle.y)) { vehicle.x += dx; moved = moved || Math.abs(dx) > 0; }
    if (!blocked(vehicle.x, vehicle.y + dy)) { vehicle.y += dy; moved = moved || Math.abs(dy) > 0; }
    return moved;
  }

  collides(x, y, radius, ignoredVehicleId = null) {
    return isSolid(this.map, x - radius, y - radius)
      || isSolid(this.map, x + radius, y - radius)
      || isSolid(this.map, x - radius, y + radius)
      || isSolid(this.map, x + radius, y + radius)
      || collidesWithVehicle(this.vehicles, x, y, radius, ignoredVehicleId);
  }

  hasClearGeometry(from, to) {
    const length = distance(from, to);
    const steps = Math.ceil(length / .12);
    for (let step = 1; step < steps; step += 1) {
      const ratio = step / steps;
      if (isSolid(this.map, from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio)) return false;
    }
    return true;
  }

  hasLineOfSight(from, to) {
    if (!this.hasClearGeometry(from, to)) return false;
    const smoke = this.effects.filter(effect => effect.type === "smoke");
    if (!smoke.length) return true;
    const steps = Math.ceil(distance(from, to) / .3);
    for (let step = 1; step < steps; step += 1) {
      const ratio = step / steps;
      const point = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
      if (smoke.some(effect => distance(point, effect) < effect.radius * .62)) return false;
    }
    return true;
  }

  removeHuman(userId) {
    const actor = this.actorByUser.get(userId);
    if (!actor) return;
    const vehicle = drivenVehicle(this.vehicles, actor.id);
    if (vehicle) {
      vehicle.driverId = null;
      vehicle.occupied = false;
      vehicle.speed = 0;
    }
    actor.userId = null;
    actor.isBot = true;
    actor.name = `${actor.name} AI`;
    actor.characterId = botCharacterId(actor.team, actor.index);
    this.actorByUser.delete(userId);
    this.inputs.delete(userId);
  }

  exportState() {
    return {
      schemaVersion: MATCH_STATE_VERSION,
      savedAt: this.epochNow(),
      roomId: this.roomId,
      mapId: this.map.id,
      modeId: this.mode.id,
      conditionId: this.rules.id,
      endsAt: this.endsAt,
      score: { ...this.score },
      projectileSequence: this.projectileSequence,
      actors: this.actors.map(actor => ({ ...actor })),
      vehicles: this.vehicles.map(vehicle => ({ ...vehicle })),
      projectiles: this.projectiles.map(projectile => {
        const { owner, ...state } = projectile;
        return { ...state, ownerActorId: owner?.id || null };
      }),
      effects: this.effects.map(effect => ({ ...effect })),
      feed: this.feed.map(entry => ({ ...entry })),
      inputs: [...this.inputs].map(([userId, input]) => [userId, {
        movement: { ...input.movement },
        angle: input.angle,
        fireHeld: false,
        actions: [],
      }]),
      finished: this.finished,
    };
  }

  finish(winner) {
    if (this.finished) return;
    this.finished = true;
    this.onFinish(createMatchResult(this.actors, winner, this.score, this.rules));
  }

  snapshotFor(userId) {
    const ownActor = this.actorByUser.get(userId);
    return {
      mapId: this.map.id,
      modeId: this.mode.id,
      conditionId: this.rules.id,
      killTarget: this.rules.killTarget,
      timeLimit: this.rules.timeLimit,
      endsAt: this.endsAt,
      playerId: ownActor?.id || null,
      time: this.time,
      score: { ...this.score },
      finished: this.finished,
      actors: this.actors.map(actor => publicActor(actor, ownActor)),
      vehicles: this.vehicles.map(vehicle => ({ ...vehicle })),
      tank: { ...this.tank },
      projectiles: this.projectiles.map(publicProjectile),
      effects: this.effects.map(effect => ({ ...effect })),
      feed: this.feed.map(entry => ({ ...entry })),
    };
  }
}
