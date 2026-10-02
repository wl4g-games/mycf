import { TEAM, WEAPON } from "./config.js";
import { GameAudio } from "./audio.js";
import { GameState } from "./game.js";
import { InputController } from "./input.js";
import { Renderer } from "./renderer.js";

const $ = selector => document.querySelector(selector);
const canvas = $("#game");
const hud = $("#hud");
const landing = $("#landing");
const modal = $("#modal");
const startButton = $("#start-button");
const resumeButton = $("#resume-button");
const audio = new GameAudio();
const input = new InputController(canvas);
const renderer = new Renderer(canvas, $("#radar"));

let paused = false;
let modalMode = "pause";
let announcementTimer = 0;
let lastTime = performance.now();

function lockPointer() {
  const request = canvas.requestPointerLock?.();
  request?.catch?.(() => {});
}

const game = new GameState(audio, (type, payload) => {
  if (type === "announce") announce(payload);
  if (type === "death") {
    modalMode = "death";
    showModal("重新部署", "医疗队正在接近，3 秒后返回战场", "你已阵亡", false);
  }
  if (type === "respawn") {
    hideModal();
    announce("重新部署完成");
  }
  if (type === "finish") {
    const won = payload.winner === TEAM.SEAL;
    modalMode = "finish";
    showModal(won ? "区域已控制" : "行动失败", `最终比分 ${String(payload.score.seal).padStart(2,"0")} : ${String(payload.score.terror).padStart(2,"0")}`, won ? "海豹突击队胜利" : "恐怖分子胜利", true, "再战一局");
    document.exitPointerLock?.();
  }
});

function begin() {
  audio.unlock();
  game.start();
  paused = false;
  landing.classList.add("is-hidden");
  hud.classList.remove("is-hidden");
  hideModal();
  if (!matchMedia("(pointer: coarse)").matches) lockPointer();
  announce("团队死斗开始 · 率先取得 15 次击杀");
}

function showModal(title, copy, kicker = "行动暂停", showButton = true, buttonText = "继续行动") {
  $("#modal-title").textContent = title;
  $("#modal-copy").textContent = copy;
  $("#modal-kicker").textContent = kicker;
  resumeButton.querySelector("span").textContent = buttonText;
  resumeButton.classList.toggle("is-hidden", !showButton);
  modal.classList.remove("is-hidden");
}

function hideModal() { modal.classList.add("is-hidden"); }

function resume() {
  audio.unlock();
  if (modalMode === "finish") {
    game.reset(); game.start(); modalMode = "pause"; paused = false; hideModal(); announce("新一轮行动开始");
  } else {
    paused = false; hideModal();
  }
  if (!matchMedia("(pointer: coarse)").matches) lockPointer();
}

function announce(message) {
  const node = $("#announcement");
  node.textContent = message; node.classList.remove("is-hidden");
  announcementTimer = 2.4;
}

function updateHud(dt) {
  $("#seal-score").textContent = String(game.score.seal).padStart(2, "0");
  $("#terror-score").textContent = String(game.score.terror).padStart(2, "0");
  const minutes = Math.floor(game.time / 60), seconds = Math.floor(game.time % 60);
  $("#clock").textContent = `${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`;
  $("#health").textContent = Math.ceil(game.player.health);
  $("#health-fill").style.width = `${Math.max(0, game.player.health)}%`;
  $("#health-fill").style.background = game.player.health < 35 ? "#ff654e" : "#68e8ef";
  const counts = game.aliveCounts;
  $("#alive-count").textContent = `${counts.seal} : ${counts.terror}`;
  $("#location").textContent = game.player.y < 7 ? "北翼化石档案馆" : game.player.y > 12 ? "南侧货运通道" : "霸王龙中庭";
  $("#interaction").classList.toggle("is-hidden", !game.nearTank);
  $("#hit-marker").classList.toggle("show", game.hitMarker > 0);
  hud.classList.toggle("scoped", game.player.scoped && game.player.alive);
  $("#tank-hud").classList.toggle("is-hidden", !game.tank.occupied);
  $("#tank-health").textContent = Math.ceil(game.tank.health);
  $("#tank-speed").textContent = String(Math.round(Math.abs(game.tank.speed) * 28)).padStart(3, "0");
  updateWeaponPanel();
  updateFeed();
  if (announcementTimer > 0) {
    announcementTimer -= dt;
    if (announcementTimer <= 0) $("#announcement").classList.add("is-hidden");
  }
}

function updateWeaponPanel() {
  const data = game.tank.occupied
    ? ["载具武器 / M-77", "120MM 主战坦克炮", "高爆弹 · 无限备弹"]
    : game.player.weapon === WEAPON.SNIPER
      ? ["主武器 / 01", "BARRETT M82A1", ".50 BMG · 栓动狙击步枪"]
      : game.player.weapon === WEAPON.GRENADE
        ? ["投掷武器 / 02", "M67 破片手雷", "延时引信 · 无限补给"]
        : ["近战武器 / 03", "瑞士军刀", "高碳钢刃 · 快速近战"];
  $("#weapon-slot").textContent = data[0]; $("#weapon-name").textContent = data[1]; $("#weapon-mode").textContent = data[2]; $("#ammo").textContent = "∞";
}

function updateFeed() {
  $("#kill-feed").innerHTML = game.feed.map(entry => `<p><span class="${entry.killerTeam === TEAM.SEAL ? "ally" : "enemy"}">${entry.killer}</span><b>${entry.weapon}</b><span class="${entry.victimTeam === TEAM.SEAL ? "ally" : "enemy"}">${entry.victim}</span></p>`).join("");
}

function frame(now) {
  const dt = Math.min(.05, (now - lastTime) / 1000 || 0); lastTime = now;
  const state = input.consume();
  const forwarded = [];
  for (const action of state.items) {
    if (action[0] === "pause" && game.started && !game.finished) {
      paused = true; modalMode = "pause"; showModal("行动暂停", "点击继续并重新锁定鼠标", "战术菜单"); document.exitPointerLock?.();
    } else if (action[0] === "reset" && game.finished) {
      modalMode = "finish"; resume();
    } else forwarded.push(action);
  }
  if (!paused) game.update(dt, { ...state, items: forwarded, movement: input.movement(), fireHeld: input.fireHeld });
  renderer.render(game);
  if (game.started) updateHud(dt);
  requestAnimationFrame(frame);
}

startButton.addEventListener("click", begin);
resumeButton.addEventListener("click", resume);
window.addEventListener("keydown", event => {
  if (event.code !== "Enter") return;
  if (!game.started) begin(); else if (!modal.classList.contains("is-hidden") && modalMode !== "death") resume();
});
document.addEventListener("pointerlockchange", () => {
  if (!game.started || game.finished || matchMedia("(pointer: coarse)").matches) return;
  if (document.pointerLockElement !== canvas && modalMode !== "death") {
    paused = true; modalMode = "pause"; showModal("行动暂停", "点击继续并重新锁定鼠标", "战术菜单");
  }
});
window.addEventListener("blur", () => { input.fireHeld = false; input.keys.clear(); });
requestAnimationFrame(frame);
