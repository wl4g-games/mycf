import { MAPS, TEAM } from "./config.js?v=20261003-v2";
import { GameAudio } from "./audio.js?v=20261003-v2";
import { GameState } from "./game.js?v=20261003-v2";
import { InputController } from "./input.js?v=20261003-v2";
import { NetworkClient } from "./network.js?v=20261003-v2";
import { NetworkGameState } from "./network-game.js?v=20261003-v2";
import { Renderer } from "./renderer.js?v=20261003-v2";

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
const canvas = $("#game");
const hud = $("#hud");
const landing = $("#landing");
const modal = $("#modal");
const aliasModal = $("#alias-modal");
const rankingModal = $("#ranking-modal");
const startButton = $("#start-button");
const resumeButton = $("#resume-button");
const audio = new GameAudio();
const input = new InputController(canvas);
const renderer = new Renderer(canvas, $("#radar"));
const network = new NetworkClient();
const selected = { versionId: null, mapId: "city", modeId: "4v4", loadoutId: "recon" };
const touchDevice = navigator.maxTouchPoints > 0 || "ontouchstart" in window;

let game;
let networkGame = null;
let paused = false;
let modalMode = "pause";
let announcementTimer = 0;
let lastTime = performance.now();
let pendingInvite = null;

function handleGameEvent(type, payload) {
  if (type === "announce") announce(payload);
  if (type === "death") {
    modalMode = "death";
    showModal("重新部署", "医疗队正在接近，3 秒后返回战场", "你已阵亡", false);
  }
  if (type === "respawn") { hideModal(); announce("重新部署完成"); }
  if (type === "finish") {
    const won = payload.winner === TEAM.SEAL;
    modalMode = "finish";
    showModal(won ? "区域已控制" : "行动失败", `最终比分 ${pad(payload.score.seal, 2)} : ${pad(payload.score.terror, 2)}`, won ? "蓝队胜利" : "红队胜利", true, "再战一局");
    exitPointerLock();
  }
}

const singleGame = new GameState(audio, handleGameEvent);
game = singleGame;

function pad(value, length) { return String(value).padStart(length, "0"); }

function lockPointer() {
  if (touchDevice || typeof canvas.requestPointerLock !== "function") return;
  try {
    const request = canvas.requestPointerLock();
    if (request && typeof request.catch === "function") request.catch(() => {});
  } catch (error) {}
}

function exitPointerLock() {
  if (typeof document.exitPointerLock !== "function") return;
  try { document.exitPointerLock(); } catch (error) {}
}

function bindTap(element, handler) {
  let lastTouch = 0;
  element.addEventListener("touchend", event => {
    if (event.cancelable) event.preventDefault();
    lastTouch = Date.now();
    handler(event);
  }, { passive: false });
  element.addEventListener("click", event => {
    if (Date.now() - lastTouch < 700) return;
    handler(event);
  });
}

function selectOption(selector, target) {
  $$(selector).forEach(button => button.classList.toggle("selected", button === target));
}

function setVersion(versionId, button) {
  selected.versionId = versionId;
  selectOption("[data-version]", button);
  $("#deployment-options").classList.remove("is-locked");
  $("#deployment-options").setAttribute("aria-disabled", "false");
  startButton.disabled = false;
  startButton.querySelector("span").textContent = versionId === "solo" ? "开始单机行动" : network.self ? "创建作战房间" : "注册网络身份";
  if (versionId === "solo") {
    $("#network-lobby").classList.add("is-hidden");
    aliasModal.classList.add("is-hidden");
  } else if (!network.self) showAliasModal();
  else $("#network-lobby").classList.remove("is-hidden");
}

$$('[data-version]').forEach(button => bindTap(button, () => setVersion(button.dataset.version, button)));

$$('[data-map]').forEach(button => bindTap(button, () => {
  selected.mapId = button.dataset.map;
  selectOption("[data-map]", button);
  landing.classList.toggle("map-city", selected.mapId === "city");
  landing.classList.toggle("map-wild", selected.mapId === "wild");
  $("#setup-code").textContent = MAPS[selected.mapId].code;
}));

$$('[data-mode]').forEach(button => bindTap(button, () => {
  selected.modeId = button.dataset.mode;
  selectOption("[data-mode]", button);
}));

$$('[data-loadout]').forEach(button => bindTap(button, () => {
  selected.loadoutId = button.dataset.loadout;
  selectOption("[data-loadout]", button);
  if (network.self) {
    network.self.loadoutId = selected.loadoutId;
    network.updateProfile(selected.loadoutId);
  }
}));

function showAliasModal() {
  $("#alias-error").textContent = "";
  aliasModal.classList.remove("is-hidden");
  window.setTimeout(() => $("#alias-input").focus(), 30);
}

async function registerNetworkIdentity() {
  const alias = $("#alias-input").value.trim();
  const error = $("#alias-error");
  const confirm = $("#alias-confirm");
  if (alias.length < 2) { error.textContent = "请输入至少 2 个字符"; return; }
  confirm.disabled = true;
  error.textContent = "正在连接多人服务…";
  try {
    const self = await network.connectAndRegister(alias, selected.loadoutId);
    aliasModal.classList.add("is-hidden");
    $("#network-lobby").classList.remove("is-hidden");
    $("#network-alias").textContent = self.alias;
    $("#network-status").textContent = "已注册 · 在线";
    startButton.querySelector("span").textContent = "创建作战房间";
    renderLobby();
  } catch (connectionError) {
    error.textContent = connectionError.message;
  } finally {
    confirm.disabled = false;
  }
}

function beginSolo() {
  game = singleGame;
  game.configure(selected);
  game.start();
  enterBattle();
  announce(`${game.map.name} · 单机版 · ${game.mode.label} · 其余席位均为 AI NPC`);
}

function createNetworkRoom() {
  if (!network.self) { showAliasModal(); return; }
  if (network.room) return;
  network.updateProfile(selected.loadoutId);
  network.createRoom({ mapId: selected.mapId, modeId: selected.modeId });
  startButton.disabled = true;
  startButton.querySelector("span").textContent = "正在创建房间…";
}

function begin() {
  if (!selected.versionId) return;
  if (selected.versionId === "solo") beginSolo();
  else createNetworkRoom();
}

function enterBattle() {
  paused = false;
  modalMode = "pause";
  landing.classList.add("is-hidden");
  hud.classList.remove("is-hidden");
  hideModal();
  rankingModal.classList.add("is-hidden");
  lockPointer();
  audio.unlock();
}

function returnToLobby() {
  paused = false;
  rankingModal.classList.add("is-hidden");
  hud.classList.add("is-hidden");
  landing.classList.remove("is-hidden");
  $("#network-lobby").classList.remove("is-hidden");
  renderLobby();
}

function renderLobby() {
  if (!network.self) return;
  $("#network-alias").textContent = network.self.alias;
  $("#network-status").textContent = network.connected ? "已注册 · 在线" : "连接已断开";
  const room = network.room;
  $("#network-no-room").classList.toggle("is-hidden", Boolean(room));
  $("#room-console").classList.toggle("is-hidden", !room);
  startButton.disabled = Boolean(room);
  startButton.querySelector("span").textContent = room ? "房间已创建" : "创建作战房间";
  if (!room) return;
  $("#room-code").textContent = room.id;
  $("#room-capacity").textContent = `${room.members.length} / ${room.maxHumans} 真人 · 其余 AI`;
  const memberRoot = $("#room-members");
  memberRoot.replaceChildren();
  room.members.forEach(member => {
    const row = document.createElement("div");
    row.className = "room-member";
    const name = document.createElement("span");
    name.textContent = member.alias;
    const detail = document.createElement("small");
    detail.textContent = member.id === room.ownerId ? "房主" : "队员";
    row.append(name, detail);
    memberRoot.append(row);
  });
  const onlineRoot = $("#online-users");
  onlineRoot.replaceChildren();
  const available = network.users.filter(user => user.available && user.id !== network.self.id);
  if (!available.length) {
    const empty = document.createElement("p");
    empty.className = "online-empty";
    empty.textContent = "暂无可邀请玩家";
    onlineRoot.append(empty);
  }
  available.forEach(user => {
    const row = document.createElement("div");
    row.className = "online-user";
    const name = document.createElement("span");
    name.textContent = user.alias;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "邀请";
    bindTap(button, () => network.invite(user.id));
    row.append(name, button);
    onlineRoot.append(row);
  });
  const isOwner = room.ownerId === network.self.id;
  $("#start-room-button").disabled = !isOwner || room.status !== "waiting";
  $("#start-room-button").textContent = isOwner ? "开始比赛 · AI 补位" : "等待房主开始";
}

function showRanking(result) {
  exitPointerLock();
  paused = true;
  const sealWon = result.winner === TEAM.SEAL;
  $("#ranking-result").textContent = sealWon ? "蓝队胜利" : "红队胜利";
  $("#ranking-seal-score").textContent = pad(result.score.seal, 2);
  $("#ranking-terror-score").textContent = pad(result.score.terror, 2);
  const body = $("#ranking-body");
  body.replaceChildren();
  result.rankings.forEach(entry => {
    const row = document.createElement("tr");
    if (entry.userId === network.self?.id) row.classList.add("self");
    if (entry.isBot) row.classList.add("bot");
    const values = [entry.rank, `${entry.name}${entry.isBot ? " [AI]" : ""}`, entry.team === TEAM.SEAL ? "蓝队" : "红队", entry.kills, entry.deaths, entry.kd.toFixed(2), entry.damage, entry.points];
    values.forEach(value => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  });
  rankingModal.classList.remove("is-hidden");
}

network.on("registered", renderLobby);
network.on("presence", renderLobby);
network.on("room_state", renderLobby);
network.on("room_left", renderLobby);
network.on("notice", payload => { $("#network-status").textContent = payload.message; });
network.on("status", payload => { $("#network-status").textContent = payload.message; });
network.on("error", payload => {
  if (!aliasModal.classList.contains("is-hidden")) $("#alias-error").textContent = payload.message;
  else $("#network-status").textContent = payload.message;
});
network.on("invite", payload => {
  pendingInvite = payload;
  $("#invite-copy").textContent = `${payload.from.alias} 邀请你加入房间 ${payload.room.id}`;
  $("#invite-card").classList.remove("is-hidden");
});
network.on("match_start", payload => {
  networkGame = new NetworkGameState(network, audio, handleGameEvent);
  networkGame.start(payload);
  game = networkGame;
  enterBattle();
  announce(`${game.map.name} · 网络版 · ${game.mode.label} · 空缺席位已由 AI 补齐`);
});
network.on("snapshot", payload => { if (networkGame) networkGame.applySnapshot(payload); });
network.on("combat_event", payload => { if (networkGame) networkGame.handleCombatEvent(payload); });
network.on("match_end", showRanking);

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
  if (modalMode === "finish" && selected.versionId === "solo") {
    game.reset();
    game.start();
    modalMode = "pause";
    paused = false;
    hideModal();
    announce(`${game.map.name} · 新一轮行动开始`);
  } else {
    paused = false;
    hideModal();
  }
  lockPointer();
  audio.unlock();
}

function announce(message) {
  const node = $("#announcement");
  node.textContent = message;
  node.classList.remove("is-hidden");
  announcementTimer = 2.6;
}

function getLocation() {
  const width = game.map.grid[0].length;
  const height = game.map.grid.length;
  const north = game.player.y < height * .5;
  const west = game.player.x < width * .5;
  const index = north ? (west ? 2 : 3) : (west ? 0 : 1);
  return `${game.map.name} · ${game.map.locations[index]}`;
}

function updateHud(dt) {
  if (!game.player) return;
  $("#seal-score").textContent = pad(game.score.seal, 2);
  $("#terror-score").textContent = pad(game.score.terror, 2);
  const minutes = Math.floor(game.time / 60);
  const seconds = Math.floor(game.time % 60);
  $("#clock").textContent = `${pad(minutes, 2)}:${pad(seconds, 2)}`;
  $("#match-limit").textContent = `先到 ${game.mode.scoreLimit} 分 · ${game.mode.label}`;
  $("#health").textContent = Math.ceil(game.player.health);
  $("#health-fill").style.width = `${Math.max(0, game.player.health)}%`;
  $("#health-fill").style.background = game.player.health < 35 ? "#ff654e" : "#5ce5ff";
  const counts = game.aliveCounts;
  $("#alive-count").textContent = `${counts.seal} : ${counts.terror}`;
  $("#location").textContent = getLocation();
  $("#radar-map").textContent = game.map.name;
  $("#interaction").classList.toggle("is-hidden", !game.nearTank);
  $("#hit-marker").classList.toggle("show", game.hitMarker > 0);
  hud.classList.toggle("scoped", game.player.scoped && game.player.alive);
  const ownTank = game.tank.driverId === game.player.id;
  $("#tank-hud").classList.toggle("is-hidden", !ownTank);
  $("#tank-health").textContent = Math.ceil(game.tank.health);
  $("#tank-speed").textContent = pad(Math.round(Math.abs(game.tank.speed) * 31), 3);
  updateWeaponPanel();
  updateFeed();
  if (announcementTimer > 0 && (announcementTimer -= dt) <= 0) $("#announcement").classList.add("is-hidden");
}

function updateWeaponPanel() {
  const driving = game.tank.driverId === game.player.id;
  if (driving) {
    $("#weapon-slot").textContent = "载具武器 / M-77";
    $("#weapon-name").textContent = "120MM 泡泡主炮";
    $("#weapon-mode").textContent = "独立炮塔 · 行驶中可开火";
    $("#throwable-name").textContent = "高爆弹 · 无限备弹";
  } else {
    const slots = { primary: "主武器 / 1", secondary: "副武器 / 2", melee: "近战武器 / 3" };
    $("#weapon-slot").textContent = slots[game.player.weaponSlot] || "主武器 / 1";
    $("#weapon-name").textContent = game.currentWeapon.name;
    $("#weapon-mode").textContent = game.currentWeapon.detail;
    $("#throwable-name").textContent = `G · ${game.currentThrowable.name}`;
  }
  $("#backpack-name").textContent = `背包 ${game.currentLoadout.number} · ${game.currentLoadout.name}`;
  $("#ammo").textContent = "∞";
}

function updateFeed() {
  const root = $("#kill-feed");
  root.replaceChildren();
  game.feed.forEach(entry => {
    const row = document.createElement("p");
    const killer = document.createElement("span");
    killer.className = entry.killerTeam === TEAM.SEAL ? "ally" : "enemy";
    killer.textContent = entry.killer;
    const weapon = document.createElement("b");
    weapon.textContent = entry.weapon;
    const victim = document.createElement("span");
    victim.className = entry.victimTeam === TEAM.SEAL ? "ally" : "enemy";
    victim.textContent = entry.victim;
    row.append(killer, weapon, victim);
    root.append(row);
  });
}

function frame(now) {
  const dt = Math.min(.05, (now - lastTime) / 1000 || 0);
  lastTime = now;
  const state = input.consume();
  const forwarded = [];
  for (const action of state.items) {
    if (action[0] === "pause" && game.started && !game.finished) {
      paused = true;
      modalMode = "pause";
      showModal("行动暂停", selected.versionId === "network" ? "网络战局仍在继续" : "点击继续并重新锁定鼠标", "战术菜单");
      exitPointerLock();
    } else forwarded.push(action);
  }
  if (!paused) game.update(dt, { ...state, items: forwarded, movement: input.movement(), fireHeld: input.fireHeld });
  renderer.render(game);
  if (game.started) updateHud(dt);
  requestAnimationFrame(frame);
}

bindTap(startButton, begin);
bindTap(resumeButton, resume);
bindTap($("#alias-confirm"), registerNetworkIdentity);
bindTap($("#alias-cancel"), () => {
  aliasModal.classList.add("is-hidden");
  selected.versionId = null;
  selectOption("[data-version]", null);
  $("#deployment-options").classList.add("is-locked");
  startButton.disabled = true;
  startButton.querySelector("span").textContent = "请先选择版本";
});
bindTap($("#create-room-button"), createNetworkRoom);
bindTap($("#leave-room-button"), () => network.leaveRoom());
bindTap($("#start-room-button"), () => network.startRoom());
bindTap($("#decline-invite"), () => {
  if (pendingInvite) network.respondInvite(pendingInvite.room.id, false);
  pendingInvite = null;
  $("#invite-card").classList.add("is-hidden");
});
bindTap($("#accept-invite"), () => {
  if (pendingInvite) network.respondInvite(pendingInvite.room.id, true);
  pendingInvite = null;
  $("#invite-card").classList.add("is-hidden");
});
bindTap($("#ranking-close"), returnToLobby);
$("#alias-input").addEventListener("keydown", event => { if (event.key === "Enter") registerNetworkIdentity(); });
window.addEventListener("keydown", event => {
  if (event.code !== "Enter" || !aliasModal.classList.contains("is-hidden")) return;
  if (!game.started) begin();
  else if (!modal.classList.contains("is-hidden") && modalMode !== "death") resume();
});
document.addEventListener("pointerlockchange", () => {
  if (!game.started || game.finished || touchDevice) return;
  if (document.pointerLockElement !== canvas && modalMode !== "death") {
    paused = true;
    modalMode = "pause";
    showModal("行动暂停", selected.versionId === "network" ? "网络战局仍在继续" : "点击继续并重新锁定鼠标", "战术菜单");
  }
});
window.addEventListener("blur", () => { input.fireHeld = false; input.keys.clear(); });
requestAnimationFrame(frame);
