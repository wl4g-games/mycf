export const TEAM = Object.freeze({ SEAL: "seal", TERROR: "terror" });
export const MATCH_TIME = 480;
export const FOV = Math.PI / 2.75;
export const SCOPED_FOV = Math.PI / 12;

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

export const MAPS = Object.freeze({
  city: {
    id: "city",
    code: "TOON-CITY",
    name: "泡泡港城",
    subtitle: "欢乐海港都市战区",
    theme: "city",
    grid: cityGrid,
    spawnAnchor: { seal: [17, 23], terror: [23, 2] },
    tank: { x: 18.5, y: 21.5, angle: -Math.PI / 2 },
    locations: ["南港高架", "码头弯道", "云朵公寓", "彩箱广场"],
    routes: {
      seal: [[6, 23], [15, 22], [18, 17], [23, 10], [31, 9], [33, 3]],
      terror: [[33, 2], [24, 9], [18, 9], [13, 17], [5, 18], [2, 23]],
    },
  },
  wild: {
    id: "wild",
    code: "TOON-WILDS",
    name: "松果山谷",
    subtitle: "卡通野外行动区",
    theme: "wild",
    grid: wildGrid,
    spawnAnchor: { seal: [17, 23], terror: [22, 2] },
    tank: { x: 18.5, y: 16.5, angle: -Math.PI / 2 },
    locations: ["南侧农庄", "圆石河滩", "瀑布营地", "松塔哨站"],
    routes: {
      seal: [[5, 23], [15, 21], [18, 16], [23, 10], [30, 9], [33, 3]],
      terror: [[33, 2], [25, 9], [19, 8], [14, 16], [7, 18], [2, 23]],
    },
  },
});

export const GAME_MODES = Object.freeze({
  "4v4": { id: "4v4", label: "4 VS 4", teamSize: 4, scoreLimit: 15 },
  "8v8": { id: "8v8", label: "8 VS 8", teamSize: 8, scoreLimit: 30 },
  "16v16": { id: "16v16", label: "16 VS 16", teamSize: 16, scoreLimit: 50 },
});

export const WEAPONS = Object.freeze({
  barrett: { id: "barrett", name: "BARRETT M82A1", detail: ".50 BMG · 8×瞄准镜", visual: "sniper", damage: 115, range: 32, interval: .82, spread: .055, scopedSpread: .025, automatic: false },
  whitePistol: { id: "whitePistol", name: "白壳手枪", detail: "半自动 · 快速拔枪", visual: "pistol", damage: 42, range: 17, interval: .28, spread: .075, automatic: false },
  ak47: { id: "ak47", name: "AK-47", detail: "7.62MM · 全自动", visual: "rifle", damage: 34, range: 23, interval: .12, spread: .09, automatic: true },
  baike: { id: "baike", name: "白克手枪", detail: "高精度 · 半自动", visual: "pistol", damage: 46, range: 18, interval: .25, spread: .065, automatic: false },
  policeMG: { id: "policeMG", name: "POLICE M7", detail: "低后坐力 · 高威力", visual: "machinegun", damage: 39, range: 25, interval: .095, spread: .065, automatic: true },
  dualPistols: { id: "dualPistols", name: "双持小手枪", detail: "双枪连射 · 机动", visual: "dual", damage: 29, range: 16, interval: .14, spread: .1, automatic: true },
  swiss: { id: "swiss", name: "瑞士军刀", detail: "近战 · 快速挥击", visual: "knife", damage: 72, range: 1.65, interval: .52, spread: .82, automatic: false },
  axe: { id: "axe", name: "战术战斧", detail: "近战 · 重击", visual: "axe", damage: 92, range: 1.72, interval: .72, spread: .76, automatic: false },
});

export const THROWABLES = Object.freeze({
  smoke: { id: "smoke", name: "M18 烟雾弹", color: "#d8e4e0", damage: 0, radius: 4.6, smoke: true },
  firework: { id: "firework", name: "烟花手雷", color: "#ffbe3d", damage: 132, radius: 3.7, firework: true },
  skull: { id: "skull", name: "骷髅手雷", color: "#a875ff", damage: 166, radius: 4.25, skull: true },
});

export const LOADOUTS = Object.freeze({
  recon: { id: "recon", number: "01", name: "远程猎手", primary: "barrett", secondary: "whitePistol", melee: "swiss", throwable: "smoke" },
  raider: { id: "raider", number: "02", name: "突击破阵", primary: "ak47", secondary: "baike", melee: "axe", throwable: "firework" },
  police: { id: "police", number: "03", name: "警用火力", primary: "policeMG", secondary: "dualPistols", melee: "swiss", throwable: "skull" },
});

export const BOT_NAMES = Object.freeze({
  seal: ["你", "RAVEN", "VIPER", "ECHO", "BUBBLE", "COMET", "PATCH", "NOVA", "BOLT", "MOCHI", "PIXEL", "TANGO", "MINT", "ROCKET", "LUCKY", "SPARK"],
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
