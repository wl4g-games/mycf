import { DEFAULT_TIME_LIMIT } from "./match-rules.js";

export const TEAM = Object.freeze({ SEAL: "seal", TERROR: "terror" });
export { DEFAULT_CONDITION_ID, DEFAULT_TIME_LIMIT, MATCH_CONDITIONS, MATCH_CONDITION_IDS, resolveMatchCondition } from "./match-rules.js";
export { createMatchResult, alliedPodium, summarizeActorStats } from "./match-results.js";
export const MATCH_TIME = DEFAULT_TIME_LIMIT;
export const FOV = Math.PI / 2.75;
export const SCOPED_FOV = Math.PI / 12;

export const DEFAULT_CHARACTER_ID = "maleAgent";
export const CHARACTER_PROFILES = Object.freeze({
  maleAgent: Object.freeze({
    id: "maleAgent",
    nameKey: "character.maleAgent.name",
    scale: 1,
    torsoWidth: .6,
    headScale: 1,
    shoulderScale: 1,
    helmet: "cap",
    accent: "#57d2ff",
    skinTone: "#d99a6c",
    hairColor: "#2a2530",
  }),
  glamSoldierBlack: Object.freeze({
    id: "glamSoldierBlack",
    nameKey: "character.glamSoldierBlack.name",
    scale: .99,
    torsoWidth: .56,
    headScale: .98,
    shoulderScale: .95,
    helmet: "tactical",
    accent: "#ff72ac",
    skinTone: "#8c5a43",
    hairColor: "#211d27",
  }),
  qipaoSoldier: Object.freeze({
    id: "qipaoSoldier",
    nameKey: "character.qipaoSoldier.name",
    scale: .98,
    torsoWidth: .55,
    headScale: .99,
    shoulderScale: .94,
    helmet: "tactical",
    accent: "#79e6ff",
    skinTone: "#efb58b",
    hairColor: "#b98557",
  }),
  glamAgentBlack: Object.freeze({
    id: "glamAgentBlack",
    nameKey: "character.glamAgentBlack.name",
    scale: .97,
    torsoWidth: .52,
    headScale: .97,
    shoulderScale: .9,
    helmet: "visor",
    accent: "#ff75d1",
    skinTone: "#7f503d",
    hairColor: "#1d1922",
  }),
  qipaoAgent: Object.freeze({
    id: "qipaoAgent",
    nameKey: "character.qipaoAgent.name",
    scale: .96,
    torsoWidth: .51,
    headScale: .98,
    shoulderScale: .89,
    helmet: "visor",
    accent: "#a992ff",
    skinTone: "#f2bc94",
    hairColor: "#744d3e",
  }),
  cuteSoldier: Object.freeze({
    id: "cuteSoldier",
    nameKey: "character.cuteSoldier.name",
    scale: .95,
    torsoWidth: .57,
    headScale: 1.06,
    shoulderScale: .93,
    helmet: "round",
    accent: "#ffd75a",
    skinTone: "#edac82",
    hairColor: "#473044",
  }),
  specialForces: Object.freeze({
    id: "specialForces",
    nameKey: "character.specialForces.name",
    scale: 1.06,
    torsoWidth: .68,
    headScale: 1.02,
    shoulderScale: 1.16,
    helmet: "tactical",
    accent: "#7af0a3",
    skinTone: "#b87d59",
    hairColor: "#20252b",
  }),
});
export const CHARACTER_IDS = Object.freeze(Object.keys(CHARACTER_PROFILES));
const CHARACTER_ALIASES = Object.freeze({
  glamAgent: "glamAgentBlack",
  glamSoldierWhite: "qipaoSoldier",
  glamAgentWhite: "qipaoAgent",
});
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function resolveCharacterId(characterId) {
  const resolved = hasOwn(CHARACTER_ALIASES, characterId) ? CHARACTER_ALIASES[characterId] : characterId;
  return hasOwn(CHARACTER_PROFILES, resolved) ? resolved : DEFAULT_CHARACTER_ID;
}

export function botCharacterId(team, index) {
  const offset = team === TEAM.TERROR ? 2 : 0;
  const numericIndex = Number(index);
  const safeIndex = Number.isFinite(numericIndex) ? Math.max(0, Math.floor(numericIndex)) : 0;
  return CHARACTER_IDS[(safeIndex + offset) % CHARACTER_IDS.length];
}

function createGrid(width, height, rectangles, points = []) {
  const rows = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => (
    x === 0 || y === 0 || x === width - 1 || y === height - 1 ? "#" : "."
  )));
  rectangles.forEach(([x, y, w, h, tile]) => {
    for (let row = y; row < y + h; row += 1) {
      for (let column = x; column < x + w; column += 1) rows[row][column] = tile;
    }
  });
  points.forEach(([x, y, tile]) => { rows[y][x] = tile; });
  return rows.map(row => row.join(""));
}

const cityGrid = createGrid(36, 26, [
  [3, 3, 7, 5, "B"], [14, 2, 6, 6, "B"], [26, 3, 6, 5, "B"],
  [3, 11, 8, 5, "B"], [15, 11, 6, 4, "B"], [27, 12, 6, 5, "B"],
  [7, 19, 6, 4, "B"], [22, 19, 7, 4, "B"],
], [
  [12, 4, "C"], [23, 4, "C"], [12, 13, "C"], [24, 13, "C"],
  [4, 19, "C"], [16, 20, "C"], [19, 18, "C"], [32, 21, "C"],
]);

const wildGrid = createGrid(36, 26, [
  [4, 4, 4, 3, "R"], [14, 3, 5, 3, "R"], [27, 4, 4, 4, "O"],
  [2, 12, 5, 4, "R"], [13, 11, 4, 3, "O"], [23, 12, 5, 3, "R"],
  [8, 19, 5, 3, "R"], [20, 19, 5, 4, "O"], [30, 18, 3, 4, "R"],
], [
  [10, 4, "T"], [22, 3, "T"], [32, 9, "T"], [9, 10, "T"], [20, 9, "T"],
  [30, 12, "T"], [8, 16, "T"], [18, 17, "T"], [27, 18, "T"], [4, 21, "T"],
]);

const cityVehicles = Object.freeze([
  Object.freeze({ id: "city-tank", type: "tank", x: 18.5, y: 21.5, angle: -Math.PI / 2 }),
  Object.freeze({ id: "city-armored-car", type: "armoredCar", x: 23.5, y: 9.5, angle: Math.PI / 2 }),
]);

const wildVehicles = Object.freeze([
  Object.freeze({ id: "wild-tank", type: "tank", x: 18.5, y: 16.5, angle: -Math.PI / 2 }),
  Object.freeze({ id: "wild-armored-car", type: "armoredCar", x: 25.5, y: 9.5, angle: Math.PI / 2 }),
]);

export const VEHICLE_TYPES = Object.freeze({
  tank: Object.freeze({
    id: "tank",
    nameKey: "vehicle.tank.name",
    interactKey: "hud.interactTank",
    exitKey: "hud.exitTank",
    hudDetailKey: "hud.tankDetail",
    hudSlotKey: "hud.weapon.vehicleTank",
    radius: .62,
    interactionRange: 1.95,
    maxHealth: 100,
    armorScale: .62,
    acceleration: 4.2,
    drag: 1.8,
    reverseSpeed: 1.6,
    maxSpeed: 3.2,
    steering: 1.15,
    speedSteering: .22,
    weapon: Object.freeze({
      id: "tankCannon", kind: "shell", interval: .92, projectileSpeed: 13,
      projectileLife: 3.2, muzzleOffset: 1, damage: 195, blastRadius: 4.5,
      nameKey: "weapon.tankCannon.name", modeKey: "hud.weapon.tankMode", ammoKey: "hud.weapon.tankAmmo",
    }),
  }),
  armoredCar: Object.freeze({
    id: "armoredCar",
    nameKey: "vehicle.armoredCar.name",
    interactKey: "hud.interactArmoredCar",
    exitKey: "hud.exitArmoredCar",
    hudDetailKey: "hud.armoredCarDetail",
    hudSlotKey: "hud.weapon.vehicleArmoredCar",
    radius: .48,
    interactionRange: 1.75,
    maxHealth: 76,
    armorScale: .78,
    acceleration: 6.2,
    drag: 2.1,
    reverseSpeed: 2.2,
    maxSpeed: 4.8,
    steering: 1.68,
    speedSteering: .16,
    weapon: Object.freeze({
      id: "armoredMG", kind: "hitscan", visual: "machinegun", interval: .11,
      damage: 25, range: 24, spread: .06, automatic: true,
      nameKey: "weapon.armoredMG.name", modeKey: "hud.weapon.armoredMode", ammoKey: "hud.weapon.armoredAmmo",
    }),
  }),
});

export const MAPS = Object.freeze({
  city: {
    id: "city",
    code: "TOON-CITY",
    nameKey: "map.city.name",
    subtitleKey: "map.city.subtitle",
    theme: "city",
    grid: cityGrid,
    spawnAnchor: { seal: [17, 23], terror: [23, 2] },
    vehicles: cityVehicles,
    tank: cityVehicles[0],
    armoredCar: cityVehicles[1],
    locationKeys: ["map.city.location.0", "map.city.location.1", "map.city.location.2", "map.city.location.3"],
    routes: {
      seal: [[6, 23], [15, 22], [18, 17], [23, 10], [31, 9], [33, 3]],
      terror: [[33, 2], [24, 9], [18, 9], [13, 17], [5, 18], [2, 23]],
    },
  },
  wild: {
    id: "wild",
    code: "TOON-WILDS",
    nameKey: "map.wild.name",
    subtitleKey: "map.wild.subtitle",
    theme: "wild",
    grid: wildGrid,
    spawnAnchor: { seal: [17, 23], terror: [22, 2] },
    vehicles: wildVehicles,
    tank: wildVehicles[0],
    armoredCar: wildVehicles[1],
    locationKeys: ["map.wild.location.0", "map.wild.location.1", "map.wild.location.2", "map.wild.location.3"],
    routes: {
      seal: [[5, 23], [15, 21], [18, 16], [23, 10], [30, 9], [33, 3]],
      terror: [[33, 2], [25, 9], [19, 8], [14, 16], [7, 18], [2, 23]],
    },
  },
});

export const GAME_MODES = Object.freeze({
  "1v1": { id: "1v1", label: "1 VS 1", teamSize: 1 },
  "4v4": { id: "4v4", label: "4 VS 4", teamSize: 4 },
  "8v8": { id: "8v8", label: "8 VS 8", teamSize: 8 },
  "16v16": { id: "16v16", label: "16 VS 16", teamSize: 16 },
});

export const WEAPONS = Object.freeze({
  barrett: { id: "barrett", nameKey: "weapon.barrett.name", detailKey: "weapon.barrett.detail", visual: "sniper", damage: 115, range: 32, interval: .82, spread: .055, scopedSpread: .025, automatic: false },
  whitePistol: { id: "whitePistol", nameKey: "weapon.whitePistol.name", detailKey: "weapon.whitePistol.detail", visual: "pistol", damage: 42, range: 17, interval: .28, spread: .075, automatic: false },
  ak47: { id: "ak47", nameKey: "weapon.ak47.name", detailKey: "weapon.ak47.detail", visual: "rifle", damage: 34, range: 23, interval: .12, spread: .09, automatic: true },
  baike: { id: "baike", nameKey: "weapon.baike.name", detailKey: "weapon.baike.detail", visual: "pistol", damage: 46, range: 18, interval: .25, spread: .065, automatic: false },
  policeMG: { id: "policeMG", nameKey: "weapon.policeMG.name", detailKey: "weapon.policeMG.detail", visual: "machinegun", damage: 39, range: 25, interval: .095, spread: .065, automatic: true },
  dualPistols: { id: "dualPistols", nameKey: "weapon.dualPistols.name", detailKey: "weapon.dualPistols.detail", visual: "dual", damage: 29, range: 16, interval: .14, spread: .1, automatic: true },
  powerBow: { id: "powerBow", nameKey: "weapon.powerBow.name", detailKey: "weapon.powerBow.detail", visual: "bow", damage: 108, range: 28, interval: .78, spread: .045, automatic: false },
  desertEagle: { id: "desertEagle", nameKey: "weapon.desertEagle.name", detailKey: "weapon.desertEagle.detail", visual: "pistol", damage: 64, range: 20, interval: .38, spread: .065, automatic: false },
  dualBlades: { id: "dualBlades", nameKey: "weapon.dualBlades.name", detailKey: "weapon.dualBlades.detail", visual: "knife", damage: 86, range: 1.78, interval: .46, spread: .82, automatic: false },
  swiss: { id: "swiss", nameKey: "weapon.swiss.name", detailKey: "weapon.swiss.detail", visual: "knife", damage: 72, range: 1.65, interval: .52, spread: .82, automatic: false },
  axe: { id: "axe", nameKey: "weapon.axe.name", detailKey: "weapon.axe.detail", visual: "axe", damage: 92, range: 1.72, interval: .72, spread: .76, automatic: false },
});

export const THROWABLES = Object.freeze({
  smoke: { id: "smoke", nameKey: "throwable.smoke.name", color: "#d8e4e0", damage: 0, radius: 4.6, smoke: true },
  firework: { id: "firework", nameKey: "throwable.firework.name", color: "#ffbe3d", damage: 132, radius: 3.7, firework: true },
  skull: { id: "skull", nameKey: "throwable.skull.name", color: "#a875ff", damage: 166, radius: 4.25, skull: true },
});

export const LOADOUTS = Object.freeze({
  recon: { id: "recon", number: "01", nameKey: "loadout.recon.name", primary: "barrett", secondary: "whitePistol", melee: "swiss", throwable: "smoke" },
  raider: { id: "raider", number: "02", nameKey: "loadout.raider.name", primary: "ak47", secondary: "baike", melee: "axe", throwable: "firework" },
  police: { id: "police", number: "03", nameKey: "loadout.police.name", primary: "policeMG", secondary: "dualPistols", melee: "swiss", throwable: "skull" },
  archer: { id: "archer", number: "04", nameKey: "loadout.archer.name", primary: "powerBow", secondary: "desertEagle", melee: "dualBlades", throwable: "smoke" },
});

export const BOT_NAMES = Object.freeze({
  seal: ["RANGER", "RAVEN", "VIPER", "ECHO", "BUBBLE", "COMET", "PATCH", "NOVA", "BOLT", "MOCHI", "PIXEL", "TANGO", "MINT", "ROCKET", "LUCKY", "SPARK"],
  terror: ["MAMBA", "GHOST", "RIPPER", "HAWK", "BRICK", "DUSTY", "CRANK", "RAZOR", "COBRA", "BANG", "RUST", "BLAST", "ONYX", "GRIT", "FANG", "JINX"],
});

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const normalizeAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const tileAt = (map, x, y) => map.grid[Math.floor(y)]?.[Math.floor(x)] ?? "#";
export const isSolid = (map, x, y) => tileAt(map, x, y) !== ".";

export function spawnCells(map, team) {
  const cells = [];
  const height = map.grid.length;
  const width = map.grid[0].length;
  const rows = team === TEAM.SEAL
    ? Array.from({ length: Math.floor(height * .35) }, (_, index) => height - 2 - index)
    : Array.from({ length: Math.floor(height * .35) }, (_, index) => 1 + index);
  const columns = team === TEAM.SEAL
    ? Array.from({ length: width - 2 }, (_, index) => 1 + index)
    : Array.from({ length: width - 2 }, (_, index) => width - 2 - index);
  for (const y of rows) {
    for (const x of columns) {
      if (!isSolid(map, x + .5, y + .5) && (x + y) % 2 === 0) cells.push([x, y]);
    }
  }
  const anchor = map.spawnAnchor[team];
  return cells.sort((a, b) => Math.hypot(a[0] - anchor[0], a[1] - anchor[1]) - Math.hypot(b[0] - anchor[0], b[1] - anchor[1]));
}
