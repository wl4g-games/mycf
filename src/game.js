import {
  BOT_NAMES, DEFAULT_CHARACTER_ID, DEFAULT_CONDITION_ID, GAME_MODES, LOADOUTS, MAPS, TEAM, THROWABLES, WEAPONS,
  botCharacterId, clamp, createMatchResult, distance, isSolid, normalizeAngle, resolveCharacterId,
  resolveMatchCondition, spawnCells,
} from "./config.js?v=20261005-controls-v7";
import { applyCameraPitch } from "./camera.js?v=20261005-controls-v7";
import { createShotEvent } from "./shot-geometry.js?v=20261005-controls-v7";
import {
  ACTOR_COLLISION_RADIUS, advanceVehicle, collidesWithActor, collidesWithVehicle, createVehicleStates,
  drivenVehicle, resolveInteractionVehicle, vehicleExitCandidates, vehicleProfile,
} from "./vehicle-system.js?v=20261005-controls-v7";

const TEAMS = [TEAM.SEAL, TEAM.TERROR];
const randomItem = list => list[Math.floor(Math.random() * list.length)];

export class GameState {
  constructor(audio, emit = () => {}) {
    this.audio = audio;
    this.emit = emit;
    this.settings = {
      mapId: "city",
      modeId: "4v4",
      loadoutId: "recon",
      characterId: DEFAULT_CHARACTER_ID,
      conditionId: DEFAULT_CONDITION_ID,
    };
    this.round = 0;
    this.reset();
  }

  configure(settings = {}) {
    this.settings = { ...this.settings, ...settings };
    this.reset();
  }

  reset() {
    this.round += 1;
    this.map = MAPS[this.settings.mapId] || MAPS.city;
    this.mode = GAME_MODES[this.settings.modeId] || GAME_MODES["4v4"];
    this.rules = resolveMatchCondition(this.settings);
    this.time = this.rules.timeLimit;
    this.score = { [TEAM.SEAL]: 0, [TEAM.TERROR]: 0 };
    this.finished = false;
    this.started = false;
    this.hitMarker = 0;
    this.shake = 0;
    this.flash = 0;
    this.projectiles = [];
    this.effects = [];
    this.feed = [];
    this.actors = [];
    this.vehicles = createVehicleStates(this.map);
    this.syncVehicleAliases();
    this.createTeams();
  }

  syncVehicleAliases() {
    this.tank = this.vehicles.find(vehicle => vehicle.type === "tank") || this.vehicles[0];
    this.armoredCar = this.vehicles.find(vehicle => vehicle.type === "armoredCar") || null;
  }

  createTeams() {
    for (const team of TEAMS) {
      const cells = spawnCells(this.map, team);
      for (let index = 0; index < this.mode.teamSize; index += 1) {
        const preferred = (index * 7) % cells.length;
        const [x, y] = Array.from({ length: cells.length }, (_, offset) => cells[(preferred + offset) % cells.length])
          .find(([cellX, cellY]) => !this.collides(cellX + .5, cellY + .5, ACTOR_COLLISION_RADIUS))
          || cells[preferred];
        const player = team === TEAM.SEAL && index === 0;
        const loadout = player
          ? LOADOUTS[this.settings.loadoutId] || LOADOUTS.recon
          : team === TEAM.SEAL ? LOADOUTS.police : LOADOUTS.raider;
        this.actors.push({
          id: `${team}-${index}`,
          name: BOT_NAMES[team][index] || `${team.toUpperCase()}-${index + 1}`,
          team,
          index,
          x: x + .5,
          y: y + .5,
          angle: team === TEAM.SEAL ? -Math.PI / 2 : Math.PI / 2,
          pitch: 0,
          health: 100,
          alive: true,
          respawn: 0,
          cooldown: Math.random(),
          decision: Math.random(),
          strafe: Math.random() > .5 ? 1 : -1,
          avoidTimer: 0,
          avoidAngle: 0,
          routeIndex: 0,
          isPlayer: player,
          isBot: !player,
          kills: 0,
          deaths: 0,
          damage: 0,
          characterId: player ? resolveCharacterId(this.settings.characterId) : botCharacterId(team, index),
          loadoutId: loadout.id,
          weaponSlot: "primary",
          weaponId: loadout.primary,
          throwableId: loadout.throwable,
          scoped: false,
        });
      }
    }
    this.player = this.actors.find(actor => actor.isPlayer);
  }

  start() { this.started = true; }

  update(dt, input) {
    if (!this.started || this.finished) return;
    dt = Math.min(dt, .05);
    this.time = Math.max(0, this.time - dt);
    this.hitMarker = Math.max(0, this.hitMarker - dt);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.flash = Math.max(0, this.flash - dt * 3);
    for (const vehicle of this.vehicles) vehicle.cooldown = Math.max(0, vehicle.cooldown - dt);
    this.player.angle = normalizeAngle(this.player.angle + input.yaw);
    this.player.pitch = applyCameraPitch(this.player.pitch, input.pitch);
    const driven = this.currentVehicle;
    if (driven) driven.turretAngle = this.player.angle;

    for (const action of input.items) this.handleAction(action);
    if (this.player.alive) this.updatePlayer(dt, input.movement, input.fireHeld);
    this.updateBots(dt);
    this.updateProjectiles(dt);
    this.updateRespawns(dt);
    this.effects = this.effects.filter(effect => (effect.life -= dt) > 0);
    this.feed = this.feed.filter(entry => (entry.life -= dt) > 0);
    if (this.time <= 0) this.finish(this.score.seal >= this.score.terror ? TEAM.SEAL : TEAM.TERROR);
  }

  handleAction([type, value]) {
    if (!this.player.alive) return;
    const driving = Boolean(this.currentVehicle);
    if (type === "weaponSlot" && !driving) this.selectSlot(this.player, value);
    if (type === "backpack" && !driving) this.cycleLoadout(this.player);
    if (type === "scope" && this.player.weaponId === "barrett" && !driving) {
      this.player.scoped = !this.player.scoped;
      this.audio.select();
    }
    if (type === "grenade" && !driving) this.throwGrenade(this.player);
    if (type === "interact") this.toggleVehicle(this.player, value);
    if (type === "fire") this.currentVehicle ? this.fireVehicle(this.player) : this.attack(this.player);
  }

  selectSlot(actor, slot) {
    const loadout = LOADOUTS[actor.loadoutId] || LOADOUTS.recon;
    const weaponId = loadout[slot];
    if (!weaponId || !WEAPONS[weaponId]) return;
    actor.weaponSlot = slot;
    actor.weaponId = weaponId;
    actor.scoped = false;
    if (actor.isPlayer) this.audio.select();
  }

  cycleLoadout(actor) {
    const ids = Object.keys(LOADOUTS);
    const loadout = LOADOUTS[ids[(ids.indexOf(actor.loadoutId) + 1) % ids.length]];
    actor.loadoutId = loadout.id;
    actor.weaponSlot = "primary";
    actor.weaponId = loadout.primary;
    actor.throwableId = loadout.throwable;
    actor.scoped = false;
    if (actor.isPlayer) {
      this.audio.select();
      this.emit("announce", { key: "announce.loadoutChanged", loadoutId: loadout.id });
    }
  }

  updatePlayer(dt, movement, fireHeld) {
    this.player.cooldown = Math.max(0, this.player.cooldown - dt);
    const vehicle = this.currentVehicle;
    if (vehicle) {
      advanceVehicle(vehicle, movement, dt, (dx, dy, radius) => this.moveVehicle(vehicle, dx, dy, radius));
      this.player.x = vehicle.x;
      this.player.y = vehicle.y;
      if (fireHeld) this.fireVehicle(this.player);
      return;
    }

    const speed = this.player.scoped ? 1.35 : 3.1;
    const forward = -movement.y;
    const strafe = movement.x;
    const dx = (Math.cos(this.player.angle) * forward + Math.cos(this.player.angle + Math.PI / 2) * strafe) * speed * dt;
    const dy = (Math.sin(this.player.angle) * forward + Math.sin(this.player.angle + Math.PI / 2) * strafe) * speed * dt;
    this.moveEntity(this.player, dx, dy, ACTOR_COLLISION_RADIUS);
    const weapon = this.currentWeapon;
    if (fireHeld && weapon.automatic) this.attack(this.player);
  }

  attack(actor) {
    if (!actor.alive || actor.cooldown > 0) return;
    const weapon = WEAPONS[actor.weaponId] || WEAPONS.ak47;
    actor.cooldown = weapon.interval;
    const spread = actor.scoped && weapon.scopedSpread != null ? weapon.scopedSpread : weapon.spread;
    const victim = this.findTargetInArc(actor, weapon.range, spread);
    if (actor.isPlayer) {
      this.audio.weaponShot({ weaponId: weapon.id, profile: weapon.visual, hit: Boolean(victim) });
      this.shake = weapon.visual === "sniper" ? .48 : weapon.visual === "machinegun" ? .24 : .16;
    } else {
      this.audio.weaponShot({
        weaponId: weapon.id,
        profile: weapon.visual,
        source: actor,
        listener: this.player,
        hit: Boolean(victim),
      });
    }
    this.commitShot(actor, weapon, victim, weapon.damage);
  }

  commitShot(actor, weapon, victim, damage = 0) {
    this.emit("shot", createShotEvent(this.map, actor, weapon, victim));
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
      type: "grenade",
      throwableId: actor.throwableId,
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
    this.emit("grenade_throw", {
      type: "grenade_throw",
      actorId: actor.id,
      userId: actor.userId ?? null,
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
      if (actor.isPlayer) {
        this.emit("announce", { key: active.type === "tank" ? "announce.leftTank" : "announce.leftArmoredCar" });
      }
      return true;
    }

    const vehicle = resolveInteractionVehicle(this.vehicles, actor, requestedId);
    if (!vehicle) return false;
    vehicle.driverId = actor.id;
    vehicle.occupied = true;
    vehicle.turretAngle = actor.angle;
    actor.scoped = false;
    actor.x = vehicle.x;
    actor.y = vehicle.y;
    if (actor.isPlayer) {
      this.emit("announce", { key: vehicle.type === "tank" ? "announce.startedTank" : "announce.startedArmoredCar" });
    }
    return true;
  }

  fireVehicle(actor) {
    const vehicle = drivenVehicle(this.vehicles, actor.id);
    if (!vehicle || vehicle.cooldown > 0) return false;
    const weapon = vehicleProfile(vehicle).weapon;
    vehicle.cooldown = weapon.interval;
    if (weapon.kind === "hitscan") {
      const victim = this.findTargetInArc(actor, weapon.range, weapon.spread);
      if (actor.isPlayer) {
        this.audio.weaponShot({ weaponId: weapon.id, profile: weapon.visual, hit: Boolean(victim) });
        this.shake = Math.max(this.shake, .22);
      }
      this.commitShot(actor, weapon, victim, weapon.damage);
      return true;
    }

    if (actor.isPlayer) {
      this.audio.tankShot();
      this.shake = 1;
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
        this.audio.weaponShot({
          weaponId: weapon.id,
          profile: weapon.visual,
          source: bot,
          listener: this.player,
          hit: Boolean(victim),
        });
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
    this.audio.explosion(type, { source: projectile, listener: this.player });
    this.shake = Math.max(this.shake, .78);
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
      if (target.isPlayer) this.flash = .35;
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
    if (target.isPlayer) this.flash = .34;
    if (attacker.isPlayer) { this.hitMarker = .16; this.audio.hit(); }
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
    this.emit("kill", entry);
    const vehicle = drivenVehicle(this.vehicles, victim.id);
    if (vehicle) {
      vehicle.driverId = null;
      vehicle.occupied = false;
      vehicle.speed = 0;
    }
    if (victim.isPlayer) {
      this.emit("death", { respawn: victim.respawn });
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
    if (actor.isPlayer) this.emit("respawn");
  }

  finish(winner) {
    if (this.finished) return;
    this.finished = true;
    this.emit("finish", createMatchResult(this.actors, winner, this.score, this.rules));
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

  get currentVehicle() { return drivenVehicle(this.vehicles, this.player?.id); }
  get interactionVehicle() { return this.currentVehicle || resolveInteractionVehicle(this.vehicles, this.player); }
  get nearVehicle() { return Boolean(this.interactionVehicle); }
  get nearTank() { return this.nearVehicle; }
  get currentLoadout() { return LOADOUTS[this.player.loadoutId] || LOADOUTS.recon; }
  get currentWeapon() { return WEAPONS[this.player.weaponId] || WEAPONS.ak47; }
  get currentThrowable() { return THROWABLES[this.player.throwableId] || THROWABLES.firework; }
  get aliveCounts() {
    return {
      seal: this.actors.filter(actor => actor.team === TEAM.SEAL && actor.alive).length,
      terror: this.actors.filter(actor => actor.team === TEAM.TERROR && actor.alive).length,
    };
  }
}
