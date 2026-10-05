import {
  CHARACTER_PROFILES, DEFAULT_CHARACTER_ID, DEFAULT_CONDITION_ID, LOADOUTS, MAPS, MATCH_CONDITIONS,
  MATCH_CONDITION_IDS, TEAM, THROWABLES, VEHICLE_TYPES, WEAPONS, alliedPodium, summarizeActorStats,
} from "./config.js?v=20261005-parental-v8";
import { GameAudio } from "./audio.js?v=20261005-parental-v8";
import { fullscreenElement, supportsFullscreen, toggleFullscreen } from "./fullscreen.js?v=20261005-parental-v8";
import { GameState } from "./game.js?v=20261005-parental-v8";
import { applyDocumentTranslations, getLocale, onLocaleChange, t, toggleLocale } from "./i18n.js?v=20261005-parental-v8";
import { InputController } from "./input.js?v=20261005-parental-v8";
import { NetworkClient } from "./network.js?v=20261005-parental-v8";
import { NetworkGameState } from "./network-game.js?v=20261005-parental-v8";
import { ParentalControl } from "./parental/index.js?v=20261005-parental-v8";
import { ParentalControlView } from "./parental/view.js?v=20261005-parental-v8";
import { Renderer } from "./renderer.js?v=20261005-parental-v8";
import { LocalGameSetupRepository } from "./repositories/game-setup-repository.js?v=20261005-parental-v8";
import { LocalParentalControlRepository } from "./repositories/parental-control-repository.js?v=20261005-parental-v8";
import { LocalRoomStateRepository } from "./repositories/room-state-repository.js?v=20261005-parental-v8";

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
const gameShell = $("#game-shell");
const canvas = $("#game");
const hud = $("#hud");
const landing = $("#landing");
const modal = $("#modal");
const forceModal = $("#force-modal");
const aliasModal = $("#alias-modal");
const podiumModal = $("#podium-modal");
const rankingModal = $("#ranking-modal");
const startButton = $("#start-button");
const resumeButton = $("#resume-button");
const fullscreenButton = $("#fullscreen-button");
const forceButton = $("#force-button");
const forceCancelButton = $("#force-cancel");
const forceConfirmButton = $("#force-confirm");
const audio = new GameAudio({ translate: t, locale: getLocale });
const input = new InputController(canvas);
const renderer = new Renderer(canvas, $("#radar"));
const setupRepository = new LocalGameSetupRepository();
const roomStateRepository = new LocalRoomStateRepository();
const parentalStateRepository = new LocalParentalControlRepository();
const network = new NetworkClient({ stateRepository: roomStateRepository });
const selected = setupRepository.load();
const parentalControl = new ParentalControl({ stateRepository: parentalStateRepository, localize: t });
const touchDevice = navigator.maxTouchPoints > 0 || "ontouchstart" in window;

let game;
let networkGame = null;
let paused = false;
let modalMode = "pause";
let announcementTimer = 0;
let lastTime = performance.now();
let pendingInvite = null;
let lastMatchResult = null;
let forcePromptOpen = false;
let forcePromptWasPaused = false;
let fullscreenTransition = false;
let parentalQuizWasPaused = false;

function saveSetup(patch = {}) {
  const saved = setupRepository.save({ ...selected, ...patch });
  Object.assign(selected, saved);
  return saved;
}

function handleGameEvent(type, payload) {
  if (type === "shot") {
    const localPlayerId = game.player?.id;
    renderer.triggerShot(payload, localPlayerId);
    if (payload.actorId === localPlayerId && !["knife", "axe", "bow"].includes(payload.profile)) pulseReticleFlash();
  }
  if (type === "grenade_throw" && game.player) audio.grenadeThrow(payload, game.player);
  if (type === "announce") announce(localizeAnnouncement(payload));
  if (type === "death") {
    modalMode = "death";
    showModal(t("modal.death.title"), t("modal.death.copy"), t("modal.death.kicker"), false);
  }
  if (type === "respawn") { hideModal(); announce(t("announce.respawned")); }
  if (type === "finish") showMatchEnd(payload);
}

function pulseReticleFlash() {
  const flash = $("#reticle-flash");
  flash.classList.remove("pulse");
  void flash.offsetWidth;
  flash.classList.add("pulse");
}

const singleGame = new GameState(audio, handleGameEvent);
game = singleGame;

function pad(value, length) { return String(value).padStart(length, "0"); }

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  return `${pad(Math.floor(safeSeconds / 60), 2)}:${pad(safeSeconds % 60, 2)}`;
}

function mapName(map) { return t(map.nameKey); }
function loadoutName(loadout) { return t(loadout.nameKey); }

function weaponName(weaponId) {
  const vehicleWeapon = Object.values(VEHICLE_TYPES).find(profile => profile.weapon.id === weaponId)?.weapon;
  if (vehicleWeapon) return t(vehicleWeapon.nameKey);
  if (WEAPONS[weaponId]) return t(WEAPONS[weaponId].nameKey);
  if (THROWABLES[weaponId]) return t(THROWABLES[weaponId].nameKey);
  return weaponId;
}

function localizeAnnouncement(payload) {
  if (typeof payload === "string") return payload;
  if (!payload?.key) return "";
  if (payload.key === "announce.loadoutChanged") {
    const loadout = LOADOUTS[payload.loadoutId] || LOADOUTS.recon;
    return t(payload.key, { number: loadout.number, name: loadoutName(loadout) });
  }
  return t(payload.key, payload.params);
}

function localizedError(code, fallback = "") {
  const key = `error.${code || "REGISTRATION_FAILED"}`;
  const message = t(key);
  return message === key ? fallback || t("error.REGISTRATION_FAILED") : message;
}

function updateStartButtonLabel() {
  const key = !selected.versionId
    ? "start.selectVersion"
    : selected.versionId === "solo"
      ? "start.solo"
      : network.room
        ? "start.roomCreated"
        : network.self ? "start.createRoom" : "start.register";
  startButton.querySelector("span").textContent = t(key);
}

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

function isNetworkBattle() {
  return selected.versionId === "network" && game === networkGame;
}

function syncBattleControls() {
  const active = Boolean(fullscreenElement(document));
  const supported = supportsFullscreen(document, gameShell);
  const fullscreenKey = !supported
    ? "controls.fullscreenUnavailable"
    : active ? "controls.exitFullscreen" : "controls.fullscreen";
  const forceKey = isNetworkBattle() ? "controls.forceExit" : "controls.forceRestart";
  fullscreenButton.disabled = !supported;
  fullscreenButton.setAttribute("aria-pressed", String(active));
  fullscreenButton.setAttribute("aria-label", t(fullscreenKey));
  fullscreenButton.setAttribute("title", t(fullscreenKey));
  fullscreenButton.querySelector("span").textContent = t(fullscreenKey);
  forceButton.setAttribute("aria-label", t(forceKey));
  forceButton.setAttribute("title", t(forceKey));
  forceButton.querySelector("span").textContent = t(forceKey);
}

async function handleFullscreenToggle() {
  if (fullscreenTransition || fullscreenButton.disabled) return;
  fullscreenTransition = true;
  input.resetTransient();
  const shouldRelock = !paused && game.started && !game.finished && !touchDevice;
  await toggleFullscreen(document, gameShell);
  syncBattleControls();
  window.requestAnimationFrame(() => {
    fullscreenTransition = false;
    if (shouldRelock && !paused && game.started && !game.finished) lockPointer();
  });
}

function bindTap(element, handler) {
  let lastTouch = 0;
  element.addEventListener("touchend", event => {
    if (event.cancelable) event.preventDefault();
    if (element.disabled) return;
    lastTouch = Date.now();
    handler(event);
  }, { passive: false });
  element.addEventListener("click", event => {
    if (element.disabled) return;
    if (Date.now() - lastTouch < 700) return;
    handler(event);
  });
}

function selectOption(selector, target) {
  $$(selector).forEach(button => button.classList.toggle("selected", button === target));
}

function renderSetupPreferences() {
  selectOption("[data-version]", selected.versionId ? $(`[data-version="${selected.versionId}"]`) : null);
  selectOption("[data-loadout]", $(`[data-loadout="${selected.loadoutId}"]`));
  selectOption(".character-option", $(`.character-option[data-character="${selected.characterId}"]`));
  const selectedVersion = Boolean(selected.versionId);
  $("#deployment-options").classList.toggle("is-locked", !selectedVersion);
  $("#deployment-options").setAttribute("aria-disabled", String(!selectedVersion));
  startButton.disabled = !selectedVersion;
  $("#alias-input").value = selected.alias || "";
  syncRoomRuleControls(network.room);
}

function syncRoomRuleControls(room) {
  const locked = Boolean(room);
  $$('[data-version], [data-map], [data-mode]').forEach(button => { button.disabled = locked; });
  $("#match-condition").disabled = locked;
  const rules = room || selected;

  if (MAPS[rules.mapId]) {
    selectOption("[data-map]", $(`[data-map="${rules.mapId}"]`));
    landing.classList.toggle("map-city", rules.mapId === "city");
    landing.classList.toggle("map-wild", rules.mapId === "wild");
    $("#setup-code").textContent = MAPS[rules.mapId].code;
  }
  if ($(`[data-mode="${rules.modeId}"]`)) {
    selectOption("[data-mode]", $(`[data-mode="${rules.modeId}"]`));
  }
  if (MATCH_CONDITIONS[rules.conditionId]) {
    $("#match-condition").value = rules.conditionId;
  }
}

function setVersion(versionId, button) {
  saveSetup({ versionId });
  selectOption("[data-version]", button);
  $("#deployment-options").classList.remove("is-locked");
  $("#deployment-options").setAttribute("aria-disabled", "false");
  startButton.disabled = false;
  updateStartButtonLabel();
  if (versionId === "solo") {
    $("#network-lobby").classList.add("is-hidden");
    aliasModal.classList.add("is-hidden");
  } else if (!network.self) showAliasModal();
  else $("#network-lobby").classList.remove("is-hidden");
}

$$('[data-version]').forEach(button => bindTap(button, () => setVersion(button.dataset.version, button)));

$$('[data-map]').forEach(button => bindTap(button, () => {
  saveSetup({ mapId: button.dataset.map });
  selectOption("[data-map]", button);
  landing.classList.toggle("map-city", selected.mapId === "city");
  landing.classList.toggle("map-wild", selected.mapId === "wild");
  $("#setup-code").textContent = MAPS[selected.mapId].code;
}));

$$('[data-mode]').forEach(button => bindTap(button, () => {
  saveSetup({ modeId: button.dataset.mode });
  selectOption("[data-mode]", button);
}));

function renderConditionOptions() {
  const select = $("#match-condition");
  const candidate = network.room?.conditionId || selected.conditionId;
  const activeId = MATCH_CONDITIONS[candidate] ? candidate : DEFAULT_CONDITION_ID;
  select.replaceChildren();
  MATCH_CONDITION_IDS.forEach(conditionId => {
    const option = document.createElement("option");
    option.value = conditionId;
    option.textContent = t(`condition.${conditionId}`);
    option.selected = conditionId === activeId;
    select.append(option);
  });
}

$("#match-condition").addEventListener("change", event => {
  const conditionId = MATCH_CONDITIONS[event.target.value] ? event.target.value : DEFAULT_CONDITION_ID;
  saveSetup({ conditionId });
});

$$('[data-loadout]').forEach(button => bindTap(button, () => {
  saveSetup({ loadoutId: button.dataset.loadout });
  selectOption("[data-loadout]", button);
  if (network.self) network.updateProfile(selected.loadoutId, selected.characterId);
}));

$$('[data-character]').filter(button => button.classList.contains("character-option")).forEach(button => bindTap(button, () => {
  const characterId = CHARACTER_PROFILES[button.dataset.character] ? button.dataset.character : DEFAULT_CHARACTER_ID;
  saveSetup({ characterId });
  selectOption(".character-option", button);
  if (network.self) network.updateProfile(selected.loadoutId, selected.characterId);
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
  if (alias.length < 2) { error.textContent = t("alias.tooShort"); return; }
  confirm.disabled = true;
  error.textContent = t("alias.connecting");
  try {
    const self = await network.connectAndRegister(alias, selected.loadoutId, selected.characterId);
    aliasModal.classList.add("is-hidden");
    $("#network-lobby").classList.remove("is-hidden");
    $("#network-alias").textContent = self.alias;
    $("#network-status").textContent = t("lobby.online");
    saveSetup({ alias: self.alias });
    updateStartButtonLabel();
    renderLobby();
  } catch (connectionError) {
    error.textContent = localizedError(connectionError.code, connectionError.message);
  } finally {
    confirm.disabled = false;
  }
}

function beginSolo() {
  game = singleGame;
  game.configure(selected);
  game.start();
  enterBattle();
  announce(t("announce.soloStart", { map: mapName(game.map), mode: game.mode.label }));
}

function createNetworkRoom() {
  if (!network.self) { showAliasModal(); return; }
  if (network.room) return;
  network.updateProfile(selected.loadoutId, selected.characterId);
  network.createRoom({ mapId: selected.mapId, modeId: selected.modeId, conditionId: selected.conditionId });
  startButton.disabled = true;
  startButton.querySelector("span").textContent = t("start.creatingRoom");
}

function begin() {
  if (!selected.versionId) return;
  if (selected.versionId === "solo") beginSolo();
  else createNetworkRoom();
}

function enterBattle() {
  paused = false;
  modalMode = "pause";
  lastMatchResult = null;
  hideForcePrompt();
  audio.resetWorld();
  renderer.resetCombatEffects();
  landing.classList.add("is-hidden");
  hud.classList.remove("is-hidden");
  hideModal();
  podiumModal.classList.add("is-hidden");
  rankingModal.classList.add("is-hidden");
  syncBattleControls();
  parentalView.ensureBlocking();
  if (!parentalView.isQuizOpen()) lockPointer();
  audio.unlock();
}

function pauseBattle() {
  if (!game.started || game.finished || paused) return;
  paused = true;
  input.resetTransient();
  if (game === networkGame) networkGame.suspendInput();
  modalMode = "pause";
  showModal(t("modal.paused.title"), t(selected.versionId === "network" ? "modal.networkContinues" : "modal.paused.copy"), t("modal.tactical"));
}

function returnToLobby() {
  paused = false;
  lastMatchResult = null;
  hideForcePrompt();
  hideModal();
  podiumModal.classList.add("is-hidden");
  rankingModal.classList.add("is-hidden");
  hud.classList.add("is-hidden");
  landing.classList.remove("is-hidden");
  exitPointerLock();
  $("#network-lobby").classList.remove("is-hidden");
  renderLobby();
}

function renderLobby() {
  if (!network.self) return;
  $("#network-alias").textContent = network.self.alias;
  $("#network-status").textContent = t(network.connected ? "lobby.online" : "lobby.connectionLost");
  const room = network.room;
  syncRoomRuleControls(room);
  $("#network-no-room").classList.toggle("is-hidden", Boolean(room));
  $("#room-console").classList.toggle("is-hidden", !room);
  startButton.disabled = Boolean(room);
  updateStartButtonLabel();
  if (!room) return;
  $("#room-code").textContent = room.id;
  $("#room-capacity").textContent = t("lobby.capacity", { members: room.members.length, maximum: room.maxHumans });
  $("#room-rules").textContent = t("lobby.rules", { kills: room.killTarget, time: formatTime(room.timeLimit) });
  const memberRoot = $("#room-members");
  memberRoot.replaceChildren();
  room.members.forEach(member => {
    const row = document.createElement("div");
    row.className = "room-member";
    const name = document.createElement("span");
    name.textContent = member.alias;
    const detail = document.createElement("small");
    const role = t(member.id === room.ownerId ? "lobby.owner" : "lobby.member");
    detail.textContent = `${role} · ${t(`character.${member.characterId || DEFAULT_CHARACTER_ID}.name`)}`;
    row.append(name, detail);
    memberRoot.append(row);
  });
  const onlineRoot = $("#online-users");
  onlineRoot.replaceChildren();
  const available = network.users.filter(user => user.available && user.id !== network.self.id);
  if (!available.length) {
    const empty = document.createElement("p");
    empty.className = "online-empty";
    empty.textContent = t("lobby.noAvailablePlayers");
    onlineRoot.append(empty);
  }
  available.forEach(user => {
    const row = document.createElement("div");
    row.className = "online-user";
    const name = document.createElement("span");
    name.textContent = user.alias;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = t("lobby.invite");
    bindTap(button, () => network.invite(user.id));
    row.append(name, button);
    onlineRoot.append(row);
  });
  const isOwner = room.ownerId === network.self.id;
  $("#start-room-button").disabled = !isOwner || room.status !== "waiting";
  $("#start-room-button").textContent = t(isOwner ? "lobby.start" : "lobby.waitOwner");
}

function renderPendingInvite() {
  const copy = pendingInvite
    ? t("invite.message", { alias: pendingInvite.from.alias, room: pendingInvite.room.id })
    : t("lobby.invitePrompt");
  $("#invite-copy").textContent = copy;
}

function winnerMessage(result) {
  return t(result.winner === TEAM.SEAL ? "ranking.guardiansWin" : "ranking.infiltratorsWin");
}

function isLocalRankingEntry(entry) {
  if (selected.versionId === "solo") return Boolean(entry.isPlayer || entry.actorId === game.player?.id);
  return Boolean(entry.userId && entry.userId === network.self?.id);
}

function rankingName(entry) {
  const name = isLocalRankingEntry(entry) && selected.versionId === "solo" ? t("hud.you") : entry.name;
  return `${name}${entry.isBot ? " [AI]" : ""}`;
}

function renderPodium(result) {
  const localTeam = game.player?.team || TEAM.SEAL;
  const won = result.winner === localTeam;
  $("#podium-title").textContent = t(won ? "modal.finish.win.title" : "modal.finish.loss.title");
  $("#podium-result").textContent = winnerMessage(result);
  $("#podium-seal-score").textContent = pad(result.score.seal, 2);
  $("#podium-terror-score").textContent = pad(result.score.terror, 2);
  const localEntry = result.rankings.find(isLocalRankingEntry) || { kills: 0, deaths: 0 };
  $("#podium-local-stats").textContent = t("podium.localStats", localEntry);
  const root = $("#podium-players");
  root.replaceChildren();
  alliedPodium(result.rankings, localTeam).forEach((entry, index) => {
    const place = index + 1;
    const card = document.createElement("article");
    card.className = `podium-player place-${place}`;
    const portrait = document.createElement("i");
    portrait.className = "operator";
    portrait.dataset.character = CHARACTER_PROFILES[entry.characterId] ? entry.characterId : DEFAULT_CHARACTER_ID;
    const badge = document.createElement("em");
    badge.textContent = String(place);
    const info = document.createElement("div");
    info.className = "podium-player-info";
    const name = document.createElement("b");
    name.textContent = rankingName(entry);
    const stats = document.createElement("small");
    stats.textContent = t("podium.playerStats", entry);
    info.append(name, stats);
    card.append(portrait, badge, info);
    root.append(card);
  });
  $("#match-end-action span").textContent = t(selected.versionId === "solo" ? "modal.playAgain" : "ranking.return");
}

function renderRanking(result) {
  $("#ranking-result").textContent = winnerMessage(result);
  $("#ranking-seal-score").textContent = pad(result.score.seal, 2);
  $("#ranking-terror-score").textContent = pad(result.score.terror, 2);
  const body = $("#ranking-body");
  body.replaceChildren();
  result.rankings.forEach(entry => {
    const row = document.createElement("tr");
    if (isLocalRankingEntry(entry)) row.classList.add("self");
    if (entry.isBot) row.classList.add("bot");
    const values = [entry.rank, rankingName(entry), t(entry.team === TEAM.SEAL ? "team.guardians" : "team.infiltrators"), entry.kills, entry.deaths, entry.kd.toFixed(2), entry.damage, entry.points];
    values.forEach(value => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  });
}

function showMatchEnd(result) {
  lastMatchResult = result;
  game.finished = true;
  paused = true;
  input.resetTransient();
  hideForcePrompt();
  hideModal();
  exitPointerLock();
  renderPodium(result);
  renderRanking(result);
  rankingModal.classList.add("is-hidden");
  podiumModal.classList.remove("is-hidden");
}

function openFullRanking() {
  if (!lastMatchResult) return;
  podiumModal.classList.add("is-hidden");
  rankingModal.classList.remove("is-hidden");
}

function backToPodium() {
  if (!lastMatchResult) return;
  rankingModal.classList.add("is-hidden");
  podiumModal.classList.remove("is-hidden");
}

function completeMatchEndAction() {
  if (selected.versionId === "network") {
    returnToLobby();
    return;
  }
  game.reset();
  game.start();
  enterBattle();
  announce(t("announce.newRound", { map: mapName(game.map) }));
}

network.on("registered", renderLobby);
network.on("presence", renderLobby);
network.on("room_state", renderLobby);
network.on("room_left", renderLobby);
network.on("notice", payload => {
  if (!payload.code) {
    $("#network-status").textContent = payload.message || "";
    return;
  }
  const key = `notice.${payload.code}`;
  $("#network-status").textContent = t(key, payload.params || {});
});
network.on("status", payload => {
  $("#network-status").textContent = t(`status.${payload.code}`);
  if (!payload.connected) {
    pendingInvite = null;
    syncRoomRuleControls(null);
    $("#network-no-room").classList.remove("is-hidden");
    $("#room-console").classList.add("is-hidden");
    $("#invite-card").classList.add("is-hidden");
    $("#network-alias").textContent = t("lobby.disconnected");
    startButton.disabled = !selected.versionId;
    updateStartButtonLabel();
  }
});
network.on("error", payload => {
  const message = localizedError(payload.code, payload.message);
  if (!aliasModal.classList.contains("is-hidden")) $("#alias-error").textContent = message;
  else $("#network-status").textContent = message;
});
network.on("invite", payload => {
  pendingInvite = payload;
  renderPendingInvite();
  $("#invite-card").classList.remove("is-hidden");
});
network.on("match_start", payload => {
  networkGame = new NetworkGameState(network, audio, handleGameEvent);
  networkGame.start(payload);
  game = networkGame;
  enterBattle();
  announce(t("announce.networkStart", { map: mapName(game.map), mode: game.mode.label }));
});
network.on("snapshot", payload => { if (networkGame?.started) networkGame.applySnapshot(payload); });
network.on("combat_event", payload => { if (networkGame?.started) networkGame.handleCombatEvent(payload); });
network.on("match_end", payload => { if (networkGame?.started) showMatchEnd(payload); });

function showModal(title, copy, kicker = t("modal.paused.kicker"), showButton = true, buttonText = t("modal.continue")) {
  $("#modal-title").textContent = title;
  $("#modal-copy").textContent = copy;
  $("#modal-kicker").textContent = kicker;
  resumeButton.querySelector("span").textContent = buttonText;
  resumeButton.classList.toggle("is-hidden", !showButton);
  modal.classList.remove("is-hidden");
}

function hideModal() { modal.classList.add("is-hidden"); }

function hideForcePrompt() {
  forcePromptOpen = false;
  forceModal.classList.add("is-hidden");
  forceButton.disabled = false;
  forceCancelButton.disabled = false;
  forceConfirmButton.disabled = false;
}

function updateForcePromptCopy() {
  const networkBattle = isNetworkBattle();
  $("#force-title").textContent = t(networkBattle ? "modal.forceExit.title" : "modal.forceRestart.title");
  $("#force-copy").textContent = t(networkBattle ? "modal.forceExit.copy" : "modal.forceRestart.copy");
  forceConfirmButton.querySelector("span").textContent = t(networkBattle ? "modal.forceExit.confirm" : "modal.forceRestart.confirm");
}

function showForcePrompt() {
  if (!game.started || game.finished || forcePromptOpen) return;
  forcePromptWasPaused = paused;
  forcePromptOpen = true;
  paused = true;
  input.resetTransient();
  if (isNetworkBattle()) networkGame.suspendInput();
  updateForcePromptCopy();
  forceButton.disabled = true;
  forceModal.classList.remove("is-hidden");
  exitPointerLock();
  window.setTimeout(() => { if (forcePromptOpen) forceCancelButton.focus(); }, 0);
}

function cancelForcePrompt() {
  if (!forcePromptOpen) return;
  const resumeBattle = !forcePromptWasPaused && game.started && !game.finished;
  hideForcePrompt();
  forceButton.focus({ preventScroll: true });
  if (!resumeBattle) return;
  paused = false;
  lockPointer();
  audio.unlock();
}

function confirmForceAction() {
  if (!forcePromptOpen) return;
  forceCancelButton.disabled = true;
  forceConfirmButton.disabled = true;
  if (isNetworkBattle()) {
    networkGame.suspendInput();
    networkGame.started = false;
    networkGame.finished = true;
    network.leaveRoom({ clearProjection: true });
    returnToLobby();
    return;
  }
  game.reset();
  game.start();
  enterBattle();
  announce(t("announce.newRound", { map: mapName(game.map) }));
}

function resume() {
  parentalView.ensureBlocking();
  if (parentalView.isQuizOpen()) return;
  paused = false;
  hideModal();
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
  return `${mapName(game.map)} · ${t(game.map.locationKeys[index])}`;
}

function updateHud(dt) {
  if (!game.player) return;
  const stats = summarizeActorStats(game.actors, game.player.id);
  const guardians = stats.teams[TEAM.SEAL] || { kills: 0, deaths: 0 };
  const infiltrators = stats.teams[TEAM.TERROR] || { kills: 0, deaths: 0 };
  $("#seal-kills").textContent = pad(guardians.kills, 2);
  $("#seal-deaths").textContent = pad(guardians.deaths, 2);
  $("#terror-kills").textContent = pad(infiltrators.kills, 2);
  $("#terror-deaths").textContent = pad(infiltrators.deaths, 2);
  $("#local-kills").textContent = stats.local.kills;
  $("#local-deaths").textContent = stats.local.deaths;
  $("#clock").textContent = formatTime(game.time);
  $("#match-limit").textContent = t("hud.scoreLimit", { score: game.rules.killTarget, mode: game.mode.label });
  $("#health").textContent = Math.ceil(game.player.health);
  $("#health-fill").style.width = `${Math.max(0, game.player.health)}%`;
  $("#health-fill").style.background = game.player.health < 35 ? "#ff654e" : "#5ce5ff";
  const counts = game.aliveCounts;
  $("#alive-count").textContent = `${counts.seal} : ${counts.terror}`;
  $("#location").textContent = getLocation();
  $("#radar-map").textContent = mapName(game.map);
  $("#hit-marker").classList.toggle("show", game.hitMarker > 0);
  hud.classList.toggle("scoped", game.player.scoped && game.player.alive);
  const interactionVehicle = game.interactionVehicle;
  $("#interaction").classList.toggle("is-hidden", !interactionVehicle);
  if (interactionVehicle) {
    const profile = VEHICLE_TYPES[interactionVehicle.type] || VEHICLE_TYPES.tank;
    $("#interaction span").textContent = t(game.currentVehicle ? profile.exitKey : profile.interactKey);
  }
  const vehicle = game.currentVehicle;
  $("#tank-hud").classList.toggle("is-hidden", !vehicle);
  if (vehicle) {
    const profile = VEHICLE_TYPES[vehicle.type] || VEHICLE_TYPES.tank;
    $("#tank-health").textContent = Math.ceil(vehicle.health);
    $("#tank-speed").textContent = pad(Math.round(Math.abs(vehicle.speed) * 31), 3);
    $("#tank-hud p").textContent = t(profile.hudDetailKey);
  }
  updateWeaponPanel();
  updateFeed();
  if (announcementTimer > 0 && (announcementTimer -= dt) <= 0) $("#announcement").classList.add("is-hidden");
}

function updateWeaponPanel() {
  const vehicle = game.currentVehicle;
  if (vehicle) {
    const profile = VEHICLE_TYPES[vehicle.type] || VEHICLE_TYPES.tank;
    $("#weapon-slot").textContent = t(profile.hudSlotKey);
    $("#weapon-name").textContent = t(profile.weapon.nameKey);
    $("#weapon-mode").textContent = t(profile.weapon.modeKey);
    $("#throwable-name").textContent = t(profile.weapon.ammoKey);
  } else {
    const slots = { primary: "hud.weapon.primary", secondary: "hud.weapon.secondary", melee: "hud.weapon.melee" };
    $("#weapon-slot").textContent = t(slots[game.player.weaponSlot] || "hud.weapon.primary");
    $("#weapon-name").textContent = t(game.currentWeapon.nameKey);
    $("#weapon-mode").textContent = t(game.currentWeapon.detailKey);
    $("#throwable-name").textContent = `G · ${t(game.currentThrowable.nameKey)}`;
  }
  $("#backpack-name").textContent = t("hud.loadout", { number: game.currentLoadout.number, name: loadoutName(game.currentLoadout) });
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
    weapon.textContent = weaponName(entry.weapon);
    const victim = document.createElement("span");
    victim.className = entry.victimTeam === TEAM.SEAL ? "ally" : "enemy";
    victim.textContent = entry.victim;
    row.append(killer, weapon, victim);
    root.append(row);
  });
}

const parentalView = new ParentalControlView({
  control: parentalControl,
  translate: t,
  onQuizOpen: () => {
    parentalQuizWasPaused = paused;
    paused = true;
    input.resetTransient();
    if (game === networkGame) networkGame.suspendInput();
    exitPointerLock();
  },
  onQuizClose: () => {
    if (parentalQuizWasPaused || !game.started || game.finished) return;
    paused = false;
    lockPointer();
    audio.unlock();
  },
});

function frame(now) {
  const elapsedSeconds = Math.max(0, (now - lastTime) / 1000 || 0);
  const dt = Math.min(.05, elapsedSeconds);
  lastTime = now;
  const state = input.consume();
  const forwarded = [];
  for (const action of state.items) {
    if (action[0] === "pause" && game.started && !game.finished) {
      pauseBattle();
      exitPointerLock();
    } else forwarded.push(action);
  }
  const parentalTick = parentalControl.tick(elapsedSeconds, {
    activeGameplay: game.started && !game.finished && !document.hidden,
    paused,
    quizOpen: parentalView.isQuizOpen(),
  });
  if (parentalTick.justLocked) parentalView.openQuiz();
  else if (game.started && !game.finished) parentalView.ensureBlocking();
  if (!paused) game.update(dt, { ...state, items: forwarded });
  if (game.started) audio.updateWorld(game, paused ? 0 : dt);
  renderer.render(game, paused ? 0 : dt);
  if (game.started) updateHud(dt);
  requestAnimationFrame(frame);
}

bindTap(startButton, begin);
bindTap(resumeButton, resume);
bindTap(fullscreenButton, handleFullscreenToggle);
bindTap(forceButton, showForcePrompt);
bindTap(forceCancelButton, cancelForcePrompt);
bindTap(forceConfirmButton, confirmForceAction);
bindTap($("#language-toggle"), toggleLocale);
bindTap($("#alias-confirm"), registerNetworkIdentity);
bindTap($("#alias-cancel"), () => {
  aliasModal.classList.add("is-hidden");
  saveSetup({ versionId: null });
  selectOption("[data-version]", null);
  $("#deployment-options").classList.add("is-locked");
  startButton.disabled = true;
  updateStartButtonLabel();
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
bindTap($("#ranking-open"), openFullRanking);
bindTap($("#ranking-close"), backToPodium);
bindTap($("#match-end-action"), completeMatchEndAction);
$("#alias-input").addEventListener("keydown", event => { if (event.key === "Enter") registerNetworkIdentity(); });
window.addEventListener("keydown", event => {
  if (parentalView.isQuizOpen() || parentalView.isSettingsOpen()) return;
  if (event.code === "Escape" && forcePromptOpen) {
    event.preventDefault();
    input.resetTransient();
    cancelForcePrompt();
    return;
  }
  if (forcePromptOpen && event.code === "Tab") {
    const controls = [forceCancelButton, forceConfirmButton];
    const current = controls.indexOf(document.activeElement);
    const direction = event.shiftKey ? -1 : 1;
    controls[(current + direction + controls.length) % controls.length].focus();
    event.preventDefault();
    return;
  }
  if (forcePromptOpen) return;
  const unmodifiedKey = !event.ctrlKey && !event.metaKey && !event.altKey;
  const battleShortcut = unmodifiedKey && game.started && !game.finished && aliasModal.classList.contains("is-hidden");
  if (battleShortcut && !event.repeat && event.code === "KeyX") {
    event.preventDefault();
    handleFullscreenToggle();
    return;
  }
  if (battleShortcut && !event.repeat && event.code === "KeyR") {
    event.preventDefault();
    showForcePrompt();
    return;
  }
  if (event.code !== "Enter" || !aliasModal.classList.contains("is-hidden")) return;
  if (forcePromptOpen) return;
  if (!game.started) begin();
  else if (!modal.classList.contains("is-hidden") && modalMode !== "death") resume();
});
document.addEventListener("pointerlockchange", () => {
  if (!game.started || game.finished || touchDevice) return;
  if (parentalView.isQuizOpen() || parentalView.isSettingsOpen()) return;
  if (forcePromptOpen || fullscreenTransition) return;
  if (document.pointerLockElement !== canvas && modalMode !== "death") {
    pauseBattle();
  }
});
["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"]
  .forEach(type => document.addEventListener(type, syncBattleControls));
window.addEventListener("blur", () => {
  input.resetTransient();
  if (game === networkGame) networkGame.suspendInput();
});
onLocaleChange(() => {
  renderConditionOptions();
  parentalView.refreshLanguage(t);
  updateStartButtonLabel();
  syncBattleControls();
  if (forcePromptOpen) updateForcePromptCopy();
  renderPendingInvite();
  if (network.self) renderLobby();
  if (lastMatchResult) {
    renderPodium(lastMatchResult);
    renderRanking(lastMatchResult);
  }
});
window.addEventListener("pagehide", () => parentalControl.flush());
document.addEventListener("visibilitychange", () => {
  lastTime = performance.now();
  if (document.hidden) parentalControl.flush();
});
applyDocumentTranslations();
renderConditionOptions();
renderSetupPreferences();
updateStartButtonLabel();
syncBattleControls();
requestAnimationFrame(frame);
