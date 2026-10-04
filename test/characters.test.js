import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CHARACTER_IDS, CHARACTER_PROFILES, DEFAULT_CHARACTER_ID, TEAM, botCharacterId, resolveCharacterId,
} from "../src/config.js";
import { GameState } from "../src/game.js";
import { en } from "../src/locales/en.js";
import { zhCN } from "../src/locales/zh-CN.js";
import { getActorRenderProfile } from "../src/renderer.js";

const silentAudio = new Proxy({}, { get: () => () => {} });
const projectRoot = fileURLToPath(new URL("..", import.meta.url));

test("character profiles expose stable identifiers and a safe default", () => {
  assert.deepEqual(CHARACTER_IDS, [
    "maleAgent",
    "glamSoldierBlack",
    "qipaoSoldier",
    "glamAgentBlack",
    "qipaoAgent",
    "cuteSoldier",
    "specialForces",
  ]);
  assert.equal(DEFAULT_CHARACTER_ID, "maleAgent");
  assert.equal(resolveCharacterId("cuteSoldier"), "cuteSoldier");
  assert.equal(resolveCharacterId("glamAgent"), "glamAgentBlack");
  assert.equal(resolveCharacterId("glamSoldierWhite"), "qipaoSoldier");
  assert.equal(resolveCharacterId("glamAgentWhite"), "qipaoAgent");
  assert.equal(resolveCharacterId("unknown-profile"), DEFAULT_CHARACTER_ID);
  assert.equal(resolveCharacterId("toString"), DEFAULT_CHARACTER_ID);
  assert.equal(getActorRenderProfile("unknown-profile"), CHARACTER_PROFILES.maleAgent);
  assert.equal(getActorRenderProfile("glamAgent"), CHARACTER_PROFILES.glamAgentBlack);
  assert.equal(new Set(CHARACTER_IDS.map(id => getActorRenderProfile(id).torsoWidth)).size, CHARACTER_IDS.length);
  assert.equal(new Set(CHARACTER_IDS.map(id => getActorRenderProfile(id).accent)).size, CHARACTER_IDS.length);
  assert.ok(CHARACTER_IDS.every(id => CHARACTER_PROFILES[id].skinTone && CHARACTER_PROFILES[id].hairColor));
});

test("solo selection is preserved while NPC character assignments remain deterministic", () => {
  const game = new GameState(silentAudio);
  game.configure({ mapId: "city", modeId: "4v4", characterId: "specialForces" });

  assert.equal(game.player.characterId, "specialForces");
  for (const actor of game.actors.filter(item => item.isBot)) {
    assert.equal(actor.characterId, botCharacterId(actor.team, actor.index));
  }
  assert.equal(new Set(game.actors.filter(actor => actor.team === TEAM.TERROR).map(actor => actor.characterId)).size, 4);
});

test("pregame and podium portraits cover every selectable character without entering combat rendering", () => {
  const markup = readFileSync(join(projectRoot, "index.html"), "utf8");
  const styles = readFileSync(join(projectRoot, "styles.css"), "utf8");
  const renderer = readFileSync(join(projectRoot, "src/renderer.js"), "utf8");
  const selectableIds = [...markup.matchAll(/<button[^>]+class="character-option[^>]+data-character="([^"]+)"/g)]
    .map(match => match[1]);

  assert.deepEqual(selectableIds, CHARACTER_IDS);
  for (const characterId of CHARACTER_IDS) {
    assert.ok(en.messages[`character.${characterId}.name`]);
    assert.ok(en.messages[`character.${characterId}.description`]);
    assert.ok(zhCN.messages[`character.${characterId}.name`]);
    assert.ok(zhCN.messages[`character.${characterId}.description`]);
    assert.ok(styles.includes(`.operator[data-character="${characterId}"]`));
  }
  assert.match(styles, /\.character-option \.operator\{[^}]*background-size:400% auto/);
  assert.match(styles, /\.podium-player \.operator\{[^}]*width:96px;height:256px[^}]*background-size:400% 100%/);
  assert.doesNotMatch(renderer, /operator-(?:character|female-variants)-atlas\.png/);

  for (const asset of ["operator-character-atlas.png", "operator-female-variants-atlas.png"]) {
    const image = readFileSync(join(projectRoot, "assets", asset));
    assert.equal(image.readUInt32BE(16), 1536);
    assert.equal(image.readUInt32BE(20), 1024);
  }
});
