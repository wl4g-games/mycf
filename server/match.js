import {
  BOT_NAMES, GAME_MODES, LOADOUTS, MAPS, MATCH_TIME, TEAM, THROWABLES, WEAPONS,
  clamp, distance, isSolid, normalizeAngle, spawnCells,
} from "../src/config.js";

const TEAMS = [TEAM.SEAL, TEAM.TERROR];
const randomItem = list => list[Math.floor(Math.random() * list.length)];

function publicProjectile(projectile) {
  return {
    type: projectile.type,
    throwableId: projectile.throwableId,
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
    loadoutId: actor.loadoutId,
    weaponSlot: actor.weaponSlot,
    weaponId: actor.weaponId,
    throwableId: actor.throwableId,
    scoped: actor.scoped,
  };
}

export class AuthoritativeMatch {
  constructor(room, members, emit, finish) {
    this.roomId = room.id;
    this.map = MAPS[room.mapId] || MAPS.city;
    this.mode = GAME_MODES[room.modeId] || GAME_MODES["4v4"];
    this.emit = emit;
    this.onFinish = finish;
    this.time = MATCH_TIME;
    this.score = { seal: 0, terror: 0 };
    this.actors = [];
    this.projectiles = [];
    this.effects = [];
    this.feed = [];
    this.inputs = new Map();
    this.actorByUser = new Map();
    this.finished = false;
    this.tank = {
      ...this.map.tank,
      turretAngle: this.map.tank.angle,
      health: 100,
      occupied: false,
      driverId: null,
      speed: 0,
      cooldown: 0,
    };
    this.createActors(members);
  }

  createActors(members) {
    for (const team of TEAMS) {
      const cells = spawnCells(this.map, team);
      for (let index = 0; index < this.mode.teamSize; index += 1) {
        const [x, y] = cells[(index * 7) % cells.length];
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
    this.time = Math.max(0, this.time - dt);
    this.tank.cooldown = Math.max(0, this.tank.cooldown - dt);
    for (const [userId, actor] of this.actorByUser) {
      if (!actor.alive) continue;
      const input = this.inputs.get(userId) || this.emptyInput(actor.angle);
      actor.cooldown = Math.max(0, actor.cooldown - dt);
      actor.angle = input.angle;
      if (this.tank.driverId === actor.id) this.tank.turretAngle = actor.angle;
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
    if (this.tank.driverId === actor.id) {
      const drive = -input.movement.y;
      const steer = input.movement.x;
      this.tank.speed += (drive * 4.2 - this.tank.speed * 1.8) * dt;
      this.tank.speed = clamp(this.tank.speed, -1.6, 3.2);
      this.tank.angle = normalizeAngle(this.tank.angle + steer * dt * (1.15 + Math.abs(this.tank.speed) * .22));
      this.moveEntity(this.tank, Math.cos(this.tank.angle) * this.tank.speed * dt, Math.sin(this.tank.angle) * this.tank.speed * dt, .62);
      actor.x = this.tank.x;
      actor.y = this.tank.y;
      if (input.fireHeld) this.fireTank(actor);
      return;
    }
    const speed = actor.scoped ? 1.35 : 3.1;
    const forward = -input.movement.y;
    const strafe = input.movement.x;
    const dx = (Math.cos(actor.angle) * forward + Math.cos(actor.angle + Math.PI / 2) * strafe) * speed * dt;
    const dy = (Math.sin(actor.angle) * forward + Math.sin(actor.angle + Math.PI / 2) * strafe) * speed * dt;
    this.moveEntity(actor, dx, dy, .24);
    const weapon = WEAPONS[actor.weaponId];
    if (input.fireHeld && weapon?.automatic) this.attack(actor);
  }

  handleAction(actor, [type, value]) {
    if (type === "weaponSlot" && this.tank.driverId !== actor.id) this.selectSlot(actor, value);
    if (type === "backpack" && this.tank.driverId !== actor.id) this.cycleLoadout(actor);
    if (type === "scope" && actor.weaponId === "barrett" && this.tank.driverId !== actor.id) actor.scoped = !actor.scoped;
    if (type === "grenade" && this.tank.driverId !== actor.id) this.throwGrenade(actor);
    if (type === "interact") this.toggleTank(actor);
    if (type === "fire") this.tank.driverId === actor.id ? this.fireTank(actor) : this.attack(actor);
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
    this.emit({ type: "shot", actorId: actor.id, userId: actor.userId, weaponId: weapon.id, profile: weapon.visual });
    const spread = actor.scoped && weapon.scopedSpread != null ? weapon.scopedSpread : weapon.spread;
    const victim = this.findTargetInArc(actor, weapon.range, spread);
    if (victim) this.damage(victim, weapon.damage, actor, weapon.id);
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
    this.projectiles.push({
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
    });
  }

  toggleTank(actor) {
    if (this.tank.driverId === actor.id) {
      this.tank.driverId = null;
      this.tank.occupied = false;
      const side = this.tank.angle + Math.PI / 2;
      const exit = { x: this.tank.x + Math.cos(side) * 1.1, y: this.tank.y + Math.sin(side) * 1.1 };
      if (!this.collides(exit.x, exit.y, .24)) Object.assign(actor, exit);
      return;
    }
    if (!this.tank.driverId && this.tank.health > 0 && distance(actor, this.tank) < 1.65) {
      this.tank.driverId = actor.id;
      this.tank.occupied = true;
      actor.scoped = false;
      actor.x = this.tank.x;
      actor.y = this.tank.y;
    }
  }

  fireTank(actor) {
    if (this.tank.driverId !== actor.id || this.tank.cooldown > 0) return;
    this.tank.cooldown = .92;
    this.projectiles.push({
      type: "shell",
      x: this.tank.x + Math.cos(this.tank.turretAngle),
      y: this.tank.y + Math.sin(this.tank.turretAngle),
      z: .65,
      vx: Math.cos(this.tank.turretAngle) * 13,
      vy: Math.sin(this.tank.turretAngle) * 13,
      vz: 0,
      life: 3.2,
      owner: actor,
      team: actor.team,
    });
    this.emit({ type: "tank_shot", actorId: actor.id, userId: actor.userId });
  }

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
        if (Math.random() < clamp(.78 - targetDistance * .035, .2, .72)) this.damage(target, weapon.damage * .34, bot, weapon.id);
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
    const radius = projectile.type === "shell" ? 4.5 : throwable.radius;
    const power = projectile.type === "shell" ? 195 : throwable.damage;
    const type = projectile.type === "shell" ? "shell" : throwable.smoke ? "smoke" : throwable.firework ? "firework" : "skull";
    this.effects.push({ x: projectile.x, y: projectile.y, life: type === "smoke" ? 7 : .7, maxLife: type === "smoke" ? 7 : .7, radius, type });
    this.emit({ type: "explosion", explosionType: type, x: projectile.x, y: projectile.y });
    if (!power) return;
    for (const actor of this.actors) {
      if (!actor.alive || actor.team === projectile.team) continue;
      const actorDistance = distance(actor, projectile);
      if (actorDistance < radius && this.hasClearGeometry(projectile, actor)) this.damage(actor, power * (1 - actorDistance / radius), projectile.owner, projectile.type === "shell" ? "tankCannon" : throwable.id);
    }
  }

  damage(target, amount, attacker, weapon) {
    if (!target.alive || !attacker || target.team === attacker.team) return;
    if (this.tank.driverId === target.id) {
      this.tank.health = Math.max(0, this.tank.health - amount * .62);
      if (this.tank.health <= 0) {
        this.tank.driverId = null;
        this.tank.occupied = false;
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
    if (this.tank.driverId === victim.id) {
      this.tank.driverId = null;
      this.tank.occupied = false;
    }
    if (this.score[attacker.team] >= this.mode.scoreLimit) this.finish(attacker.team);
  }

  updateRespawns(dt) {
    for (const actor of this.actors) {
      if (actor.alive) continue;
      actor.respawn -= dt;
      if (actor.respawn <= 0 && !this.finished) this.respawn(actor);
    }
  }

  respawn(actor) {
    const [x, y] = randomItem(spawnCells(this.map, actor.team));
    actor.x = x + .5;
    actor.y = y + .5;
    actor.health = 100;
    actor.alive = true;
    actor.cooldown = .6;
    actor.angle = actor.team === TEAM.SEAL ? -Math.PI / 2 : Math.PI / 2;
    actor.routeIndex = 0;
  }

  moveEntity(entity, dx, dy, radius) {
    let moved = false;
    if (!this.collides(entity.x + dx, entity.y, radius)) { entity.x += dx; moved = moved || Math.abs(dx) > 0; }
    if (!this.collides(entity.x, entity.y + dy, radius)) { entity.y += dy; moved = moved || Math.abs(dy) > 0; }
    return moved;
  }

  collides(x, y, radius) {
    return isSolid(this.map, x - radius, y - radius)
      || isSolid(this.map, x + radius, y - radius)
      || isSolid(this.map, x - radius, y + radius)
      || isSolid(this.map, x + radius, y + radius);
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
    if (this.tank.driverId === actor.id) {
      this.tank.driverId = null;
      this.tank.occupied = false;
    }
    actor.userId = null;
    actor.isBot = true;
    actor.name = `${actor.name} AI`;
    this.actorByUser.delete(userId);
    this.inputs.delete(userId);
  }

  finish(winner) {
    if (this.finished) return;
    this.finished = true;
    const rankings = this.actors
      .map(actor => ({
        userId: actor.userId,
        name: actor.name,
        team: actor.team,
        isBot: actor.isBot,
        kills: actor.kills,
        deaths: actor.deaths,
        kd: actor.kills / Math.max(1, actor.deaths),
        damage: Math.round(actor.damage),
        points: actor.kills * 100 + Math.round(actor.damage) - actor.deaths * 10,
        result: actor.team === winner ? "win" : "loss",
      }))
      .sort((a, b) => b.points - a.points || b.kills - a.kills || a.deaths - b.deaths)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
    this.onFinish({ winner, score: { ...this.score }, rankings });
  }

  snapshotFor(userId) {
    const ownActor = this.actorByUser.get(userId);
    return {
      mapId: this.map.id,
      modeId: this.mode.id,
      playerId: ownActor?.id || null,
      time: this.time,
      score: { ...this.score },
      finished: this.finished,
      actors: this.actors.map(actor => publicActor(actor, ownActor)),
      tank: { ...this.tank },
      projectiles: this.projectiles.map(publicProjectile),
      effects: this.effects.map(effect => ({ ...effect })),
      feed: this.feed.map(entry => ({ ...entry })),
    };
  }
}
