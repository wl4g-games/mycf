import {
  BOT_NAMES, GAME_MODES, LOADOUTS, MAPS, MATCH_TIME, TEAM, THROWABLES, WEAPONS,
  clamp, distance, isSolid, normalizeAngle, spawnCells,
} from "./config.js?v=20261004-i18n";

const TEAMS = [TEAM.SEAL, TEAM.TERROR];
const randomItem = list => list[Math.floor(Math.random() * list.length)];

export class GameState {
  constructor(audio, emit = () => {}) {
    this.audio = audio;
    this.emit = emit;
    this.settings = { mapId: "city", modeId: "4v4", loadoutId: "recon" };
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
    this.time = MATCH_TIME;
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
    this.createTeams();
    this.tank = {
      ...this.map.tank,
      turretAngle: this.map.tank.angle,
      health: 100,
      occupied: false,
      driverId: null,
      speed: 0,
      cooldown: 0,
    };
  }

  createTeams() {
    for (const team of TEAMS) {
      const cells = spawnCells(this.map, team);
      for (let index = 0; index < this.mode.teamSize; index += 1) {
        const [x, y] = cells[(index * 7) % cells.length];
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
    this.tank.cooldown = Math.max(0, this.tank.cooldown - dt);
    this.player.angle = normalizeAngle(this.player.angle + input.yaw);
    if (this.tank.driverId === this.player.id) this.tank.turretAngle = this.player.angle;

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
    if (type === "weaponSlot" && this.tank.driverId !== this.player.id) this.selectSlot(this.player, value);
    if (type === "backpack" && this.tank.driverId !== this.player.id) this.cycleLoadout(this.player);
    if (type === "scope" && this.player.weaponId === "barrett" && this.tank.driverId !== this.player.id) {
      this.player.scoped = !this.player.scoped;
      this.audio.select();
    }
    if (type === "grenade" && this.tank.driverId !== this.player.id) this.throwGrenade(this.player);
    if (type === "interact") this.toggleTank(this.player);
    if (type === "fire") this.tank.driverId === this.player.id ? this.fireTank(this.player) : this.attack(this.player);
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
    if (this.tank.driverId === this.player.id) {
      const drive = -movement.y;
      const steer = movement.x;
      this.tank.speed += (drive * 4.2 - this.tank.speed * 1.8) * dt;
      this.tank.speed = clamp(this.tank.speed, -1.6, 3.2);
      this.tank.angle = normalizeAngle(this.tank.angle + steer * dt * (1.15 + Math.abs(this.tank.speed) * .22));
      this.moveEntity(this.tank, Math.cos(this.tank.angle) * this.tank.speed * dt, Math.sin(this.tank.angle) * this.tank.speed * dt, .62);
      this.player.x = this.tank.x;
      this.player.y = this.tank.y;
      if (fireHeld) this.fireTank(this.player);
      return;
    }

    const speed = this.player.scoped ? 1.35 : 3.1;
    const forward = -movement.y;
    const strafe = movement.x;
    const dx = (Math.cos(this.player.angle) * forward + Math.cos(this.player.angle + Math.PI / 2) * strafe) * speed * dt;
    const dy = (Math.sin(this.player.angle) * forward + Math.sin(this.player.angle + Math.PI / 2) * strafe) * speed * dt;
    this.moveEntity(this.player, dx, dy, .24);
    const weapon = this.currentWeapon;
    if (fireHeld && weapon.automatic) this.attack(this.player);
  }

  attack(actor) {
    if (!actor.alive || actor.cooldown > 0) return;
    const weapon = WEAPONS[actor.weaponId] || WEAPONS.ak47;
    actor.cooldown = weapon.interval;
    if (actor.isPlayer) {
      if (weapon.visual === "knife" || weapon.visual === "axe") this.audio.knife(weapon.visual);
      else this.audio.gunshot(weapon.visual);
      this.shake = weapon.visual === "sniper" ? .48 : weapon.visual === "machinegun" ? .24 : .16;
    }
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
    if (actor.isPlayer) this.audio.select();
    this.projectiles.push({
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
    });
  }

  toggleTank(actor) {
    if (this.tank.driverId === actor.id) {
      this.tank.driverId = null;
      this.tank.occupied = false;
      const side = this.tank.angle + Math.PI / 2;
      const exit = { x: this.tank.x + Math.cos(side) * 1.1, y: this.tank.y + Math.sin(side) * 1.1 };
      if (!this.collides(exit.x, exit.y, .24)) Object.assign(actor, exit);
      if (actor.isPlayer) this.emit("announce", { key: "announce.leftTank" });
      return;
    }
    if (!this.tank.driverId && this.tank.health > 0 && distance(actor, this.tank) < 1.65) {
      this.tank.driverId = actor.id;
      this.tank.occupied = true;
      actor.scoped = false;
      actor.x = this.tank.x;
      actor.y = this.tank.y;
      if (actor.isPlayer) this.emit("announce", { key: "announce.startedTank" });
    }
  }

  fireTank(actor) {
    if (this.tank.driverId !== actor.id || this.tank.cooldown > 0) return;
    this.tank.cooldown = .92;
    if (actor.isPlayer) {
      this.audio.tankShot();
      this.shake = 1;
    }
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
    this.audio.explosion(type);
    this.shake = Math.max(this.shake, .78);
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
      if (target.isPlayer) this.flash = .35;
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
    if (victim.isPlayer) {
      this.tank.driverId = null;
      this.tank.occupied = false;
      this.emit("death", { respawn: victim.respawn });
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
    if (actor.isPlayer) this.emit("respawn");
  }

  finish(winner) {
    if (this.finished) return;
    this.finished = true;
    this.emit("finish", { winner, score: { ...this.score } });
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

  get nearTank() { return !this.tank.occupied && this.tank.health > 0 && distance(this.player, this.tank) < 1.65; }
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
