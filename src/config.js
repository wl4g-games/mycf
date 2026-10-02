export const TILE_MAP = [
  "########################",
  "#......................#",
  "#..C................C..#",
  "#......................#",
  "#....GGG........GGG....#",
  "#....G.G........G.G....#",
  "#....GGG........GGG....#",
  "#......................#",
  "#..C................C..#",
  "#......................#",
  "#.........GGGG.........#",
  "#......................#",
  "#....GGG........GGG....#",
  "#....G.G........G.G....#",
  "#....GGG........GGG....#",
  "#..C................C..#",
  "#......................#",
  "########################",
];

export const MAP_WIDTH = TILE_MAP[0].length;
export const MAP_HEIGHT = TILE_MAP.length;
export const MATCH_LIMIT = 15;
export const MATCH_TIME = 300;
export const FOV = Math.PI / 2.75;
export const SCOPED_FOV = Math.PI / 12;

export const TEAM = Object.freeze({ SEAL: "seal", TERROR: "terror" });
export const WEAPON = Object.freeze({ SNIPER: "sniper", GRENADE: "grenade", KNIFE: "knife" });

export const SPAWNS = {
  seal: [[2, 15], [5, 15], [3, 13], [6, 16]],
  terror: [[21, 2], [20, 3], [17, 2], [21, 6]],
};

export const BOT_NAMES = {
  seal: ["你", "RAVEN", "VIPER", "ECHO"],
  terror: ["MAMBA", "GHOST", "RIPPER", "HAWK"],
};

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const normalizeAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const tileAt = (x, y) => TILE_MAP[Math.floor(y)]?.[Math.floor(x)] ?? "#";
export const isSolid = (x, y) => tileAt(x, y) !== ".";
