import { clamp, normalizeAngle, WEAPONS } from "./game-config.js";

export const MONSTER_COUNT = 3;
export const HELICOPTER_WEAPONS = Object.freeze({
  primary: Object.freeze({ id: "heliMG", visual: "machinegun", nameKey: "weapon.heliMG.name", modeKey: "weapon.heliMG.detail", ammoKey: "hud.weapon.unlimited", damage: 30, range: 60, spread: .055, interval: .085 }),
  secondary: Object.freeze({ id: "heliRocket", visual: "rifle", nameKey: "weapon.heliRocket.name", modeKey: "weapon.heliRocket.detail", ammoKey: "hud.weapon.unlimited", damage: 640, range: 75, spread: .08, interval: .95 }),
});
export const helicopterWeapon = vehicle => HELICOPTER_WEAPONS[vehicle?.weaponSlot] || HELICOPTER_WEAPONS.primary;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const hash = (x, y) => { const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return value - Math.floor(value); };

export function clearBuildingCells(map, building) {
  for (let y = building.y; y < building.y + building.depth; y++) map.grid[y] = map.grid[y].slice(0, building.x) + ".".repeat(building.width) + map.grid[y].slice(building.x + building.width);
}

export function cityBuildings(map) {
  const buildings = [], seen = new Set();
  for (let y = 1; y < map.grid.length - 1; y++) for (let x = 1; x < map.grid[y].length - 1; x++) {
    if (map.grid[y][x] !== "B" || seen.has(`${x}:${y}`)) continue;
    let width = 1, depth = 1;
    while (map.grid[y][x + width] === "B") width++;
    while (map.grid[y + depth] && Array.from({ length: width }, (_, i) => map.grid[y + depth][x + i] === "B").every(Boolean)) depth++;
    for (let dy = 0; dy < depth; dy++) for (let dx = 0; dx < width; dx++) seen.add(`${x + dx}:${y + dy}`);
    buildings.push({ id: `building-${x}-${y}`, x, y, width, depth, height: (6.5 + Math.floor(hash(x, y) * 4) * 2.2) / 2.5, health: 120 });
  }
  return buildings;
}

export class BioBattle {
  constructor(map, actorCount, timeLimit = 300, { random = Math.random, state = null } = {}) {
    this.map = { ...map, grid: [...map.grid] };
    this.buildings = cityBuildings(map);
    this.timeLimit = timeLimit;
    this.elapsed = 0;
    this.defeated = 0;
    this.destroyed = [];
    this.rockets = [];
    this.sequence = 0;
    this.events = [];
    const sources = ["portal", "sea", "ground"];
    for (let i = sources.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [sources[i], sources[j]] = [sources[j], sources[i]]; }
    this.monsters = sources.map((source, index) => ({
      id: `titan-${index + 1}`, name: `TITAN-${index + 1}`, team: "monsters", isMonster: true,
      x: source === "sea" ? 18 : source === "ground" ? 29 : 7,
      y: source === "sea" ? -2.5 : source === "ground" ? 18 : 9,
      z: 0, angle: Math.PI / 2, radius: 1.15, height: 5.6,
      health: 3200 + Math.ceil(Math.sqrt(actorCount)) * 350, maxHealth: 3200 + Math.ceil(Math.sqrt(actorCount)) * 350,
      alive: true, active: false, source, spawnAt: index === 0 ? 4 + random() * 3 : 18 + index * 15 + random() * 10,
      emerged: 0, attackClock: 0, kills: 0, damage: 0, phase: random() * Math.PI * 2,
    }));
    if (state) {
      for (const key of ["elapsed", "defeated", "destroyed", "rockets", "sequence", "monsters", "buildings"]) if (state[key] !== undefined) this[key] = structuredClone(state[key]);
      for (const building of this.buildings) if (this.destroyed.includes(building.id)) this.clearBuilding(building);
    }
  }

  attach(match) {
    match.map = this.map;
    match.score.seal = this.defeated;
    match.score.terror = MONSTER_COUNT - this.defeated;
    if (!match.vehicles.some(vehicle => vehicle.type === "helicopter")) {
      for (const [index, x, y] of [[0, 17.5, 22], [1, 24.5, 17.5]]) match.vehicles.push({
        id: `rescue-heli-${index}`, type: "helicopter", x, y, z: 0, angle: -Math.PI / 2, turretAngle: -Math.PI / 2,
        health: 180, maxHealth: 180, occupied: false, driverId: null, speed: 0, cooldown: 0, weaponSlot: "primary",
      });
    }
  }

  snapshot() {
    return structuredClone({ elapsed: this.elapsed, defeated: this.defeated, destroyed: this.destroyed, rockets: this.rockets, sequence: this.sequence, monsters: this.monsters, buildings: this.buildings });
  }

  heightAt(x, y) {
    const tile = this.map.grid[Math.floor(y)]?.[Math.floor(x)] || "#";
    if (tile === ".") return 0;
    if (tile === "B") return this.buildings.find(building => x >= building.x && x < building.x + building.width && y >= building.y && y < building.y + building.depth)?.height || 3;
    return tile === "C" ? .86 : 1.3;
  }

  clearLine(from, to, endHeight) {
    const length = distance(from, to), start = (from.z || 0) + .68;
    const steps = Math.ceil(length / .15);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.heightAt(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t) > start + (endHeight - start) * t) return false;
    }
    return true;
  }

  findTarget(actor, range, margin) {
    let selected = null, closest = Infinity;
    for (const monster of this.monsters) {
      if (!monster.active || !monster.alive || monster.emerged < 3) continue;
      const d = distance(actor, monster), height = (actor.z || 0) + .68 - Math.tan(actor.pitch || 0) * d;
      if (d > range || height < 0 || height > monster.height) continue;
      const angle = Math.abs(normalizeAngle(Math.atan2(monster.y - actor.y, monster.x - actor.x) - actor.angle));
      if (angle <= Math.max(margin, Math.atan(monster.radius / Math.max(.1, d))) && d < closest && this.clearLine(actor, monster, height)) { selected = monster; closest = d; }
    }
    return selected;
  }

  damage(monster, amount, attacker, match) {
    if (!monster.alive || !monster.active || monster.emerged < 3 || !(amount > 0)) return;
    const applied = Math.min(monster.health, amount);
    monster.health -= applied;
    if (attacker) attacker.damage = (attacker.damage || 0) + applied;
    if (monster.health > 0) return;
    monster.alive = false;
    monster.diedAt = this.elapsed;
    this.defeated++;
    this.events.push({ type: "announce", key: "bio.titanEliminated", params: { count: this.defeated } });
    if (attacker) attacker.kills = (attacker.kills || 0) + 1;
    match.score.seal = this.defeated;
    match.score.terror = MONSTER_COUNT - this.defeated;
    match.effects.push({ x: monster.x, y: monster.y, type: "shell", radius: 5, life: 1.2, maxLife: 1.2 });
  }

  blast(projectile, radius, power, attacker, match) {
    for (const monster of this.monsters) {
      const d = distance(monster, projectile);
      if (d < radius + monster.radius && (projectile.z || 0) <= monster.height + radius && this.clearLine({ ...projectile, z: Math.max(0, (projectile.z || 0) - .68) }, monster, Math.min(monster.height * .5, (projectile.z || 0) + .1))) this.damage(monster, power * Math.max(.25, 1 - d / (radius + monster.radius)), attacker, match);
    }
  }

  fly(vehicle, actor, movement, dt) {
    vehicle.turretAngle = actor.angle;
    vehicle.angle = actor.angle;
    const forward = -(movement?.y || 0), strafe = movement?.x || 0;
    vehicle.z = clamp((vehicle.z || 0) + (movement?.z || 0) * dt * 2.4, this.heightAt(vehicle.x, vehicle.y), 10);
    const speed = vehicle.z > .35 ? 5.5 : .7;
    const x = clamp(vehicle.x + (Math.cos(actor.angle) * forward - Math.sin(actor.angle) * strafe) * speed * dt, 1, this.map.grid[0].length - 1);
    const y = clamp(vehicle.y + (Math.sin(actor.angle) * forward + Math.cos(actor.angle) * strafe) * speed * dt, 1, this.map.grid.length - 1);
    const corners = [[-.65, -.65], [.65, -.65], [-.65, .65], [.65, .65]];
    if (corners.every(([dx, dy]) => this.heightAt(x + dx, y + dy) <= vehicle.z)) { vehicle.x = x; vehicle.y = y; }
    vehicle.speed = Math.hypot(forward, strafe) * speed;
    actor.x = vehicle.x; actor.y = vehicle.y; actor.z = vehicle.z;
  }

  fireRocket(actor, vehicle) {
    const pitch = actor.pitch || 0, speed = 19;
    const forward = Math.cos(pitch);
    this.rockets.push({ id: `rocket-${++this.sequence}`, type: "rocket", x: actor.x + Math.cos(actor.angle) * .9, y: actor.y + Math.sin(actor.angle) * .9, z: (vehicle.z || 0) + .55, vx: Math.cos(actor.angle) * forward * speed, vy: Math.sin(actor.angle) * forward * speed, vz: -Math.sin(pitch) * speed, life: 4, ownerId: actor.id, team: actor.team });
    if (this.rockets.length > 32) this.rockets.shift();
  }

  clearBuilding(building) {
    clearBuildingCells(this.map, building);
  }

  update(match, dt, emit = () => {}) {
    this.elapsed = this.timeLimit - match.time;
    for (const monster of this.monsters) {
      if (!monster.alive) continue;
      if (!monster.active && this.elapsed >= monster.spawnAt) { monster.active = true; emit({ type: "announce", key: "bio.emerging", params: { number: monster.id.slice(-1), source: monster.source } }); }
      if (!monster.active) continue;
      monster.emerged += dt;
      if (monster.emerged < 3.5) continue;
      monster.phase += dt * 2;
      monster.attackClock = Math.max(0, monster.attackClock - dt);
      const targets = this.buildings.filter(building => building.health > 0);
      const building = targets.sort((a, b) => distance(monster, { x: a.x + a.width / 2, y: a.y + a.depth / 2 }) - distance(monster, { x: b.x + b.width / 2, y: b.y + b.depth / 2 }))[0];
      const target = building ? { x: building.x + building.width / 2, y: building.y + building.depth / 2 } : { x: 18, y: 13 };
      const angle = Math.atan2(target.y - monster.y, target.x - monster.x);
      monster.angle = angle;
      const edgeDistance = building ? Math.hypot(Math.max(0, Math.abs(monster.x - target.x) - building.width / 2), Math.max(0, Math.abs(monster.y - target.y) - building.depth / 2)) : distance(monster, target);
      if (edgeDistance > 1.5) { monster.x += Math.cos(angle) * dt * .85; monster.y += Math.sin(angle) * dt * .85; }
      if (monster.attackClock > 0) continue;
      monster.attackClock = 2.2;
      if (building && edgeDistance <= 1.5) {
        building.health -= 45;
        match.effects.push({ ...target, type: "shell", radius: 2, life: .6, maxLife: .6 });
        if (building.health <= 0) { this.destroyed.push(building.id); this.clearBuilding(building); emit({ type: "announce", key: "bio.buildingLost" }); }
      }
      for (const actor of match.actors) if (actor.alive && (actor.z || 0) < 3 && distance(monster, actor) < 3.1) match.damage(actor, 24, monster, "bioClaw");
    }
    for (const rocket of this.rockets) {
      rocket.life -= dt;
      let hit = false;
      // Substeps prevent a fast rocket tunnelling through a monster or thin cover.
      for (let i = 0; i < 4 && !hit; i++) {
        rocket.x += rocket.vx * dt / 4; rocket.y += rocket.vy * dt / 4; rocket.z += rocket.vz * dt / 4;
        hit = rocket.z <= this.heightAt(rocket.x, rocket.y) || this.monsters.some(monster => monster.active && monster.alive && distance(monster, rocket) < monster.radius && rocket.z >= 0 && rocket.z <= monster.height);
      }
      if (hit || rocket.life <= 0) {
        rocket.life = 0;
        this.blast(rocket, 2.5, HELICOPTER_WEAPONS.secondary.damage, match.actors.find(actor => actor.id === rocket.ownerId), match);
        match.effects.push({ x: rocket.x, y: rocket.y, z: Math.max(0, rocket.z), type: "shell", radius: 2.5, life: .7, maxLife: .7 });
        emit({ type: "explosion", explosionType: "shell", x: rocket.x, y: rocket.y, z: rocket.z });
      }
    }
    this.rockets = this.rockets.filter(rocket => rocket.life > 0);
    for (const event of this.events.splice(0)) emit(event);
    if (this.defeated === MONSTER_COUNT) match.finish("humans");
  }

  updateBots(match, dt) {
    const enemies = this.monsters.filter(monster => monster.active && monster.alive && monster.emerged >= 3.5);
    for (const bot of match.actors) {
      if (!bot.isBot || !bot.alive) continue;
      bot.cooldown = Math.max(0, bot.cooldown - dt);
      const target = enemies.reduce((best, candidate) => !best || distance(bot, candidate) < distance(bot, best) ? candidate : best, null);
      if (!target) continue;
      const d = distance(bot, target), angle = Math.atan2(target.y - bot.y, target.x - bot.x);
      bot.angle = normalizeAngle(bot.angle + clamp(normalizeAngle(angle - bot.angle), -dt * 3, dt * 3));
      bot.pitch = -Math.atan2(target.height * .45 - .68, Math.max(1, d));
      if (d > 7 && !match.moveEntity(bot, Math.cos(bot.angle) * dt * 1.5, Math.sin(bot.angle) * dt * 1.5, .24)) {
        match.moveEntity(bot, -Math.sin(bot.angle) * dt * bot.strafe * 1.5, Math.cos(bot.angle) * dt * bot.strafe * 1.5, .24);
      }
      const weapon = WEAPONS[bot.weaponId] || WEAPONS.ak47;
      if (d < weapon.range && bot.cooldown <= 0 && Math.abs(normalizeAngle(angle - bot.angle)) < .15) {
        match.attack(bot);
        bot.cooldown = Math.max(.4, weapon.interval * 3);
      }
    }
  }
}
