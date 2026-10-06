import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { en } from "../src/locales/en.js";
import { zhCN } from "../src/locales/zh-CN.js";
import { PARENTAL_QUESTION_BANK } from "../src/parental/question-bank.js";

const projectRoot = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, projectRoot), "utf8");
}

function selectValues(markup, id) {
  const section = markup.match(new RegExp(`<select\\s+id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`));
  assert.ok(section, `missing #${id}`);
  return [...section[1].matchAll(/<option\s+value="([^"]+)"/g)].map(match => Number(match[1]));
}

test("the setup screen exposes the complete parental-control contract", async () => {
  const markup = await source("index.html");
  const requiredIds = [
    "parental-control-button",
    "parental-button-status",
    "parental-settings-layer",
    "parental-enabled",
    "parental-duration",
    "parental-question-count",
    "parental-settings-cancel",
    "parental-settings-save",
    "parental-quiz-layer",
    "parental-quiz-subject",
    "parental-quiz-progress",
    "parental-quiz-prompt",
    "parental-quiz-answers",
    "parental-quiz-feedback",
  ];
  for (const id of requiredIds) assert.match(markup, new RegExp(`id="${id}"`));
  assert.deepEqual(selectValues(markup, "parental-duration"), [1, 3, 5, 10, 20]);
  assert.deepEqual(selectValues(markup, "parental-question-count"), [1, 3, 5, 10]);
  assert.match(markup, /id="parental-settings-layer"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(markup, /id="parental-quiz-layer"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-describedby="parental-quiz-copy parental-quiz-prompt"/);
  assert.match(markup, /id="parental-quiz-answers"[^>]*role="group"[^>]*aria-labelledby="parental-quiz-prompt"/);
});

test("every parental question has complete, unique localized choices", () => {
  const catalogs = [en.messages, zhCN.messages];
  assert.ok(PARENTAL_QUESTION_BANK.length >= 10);
  for (const question of PARENTAL_QUESTION_BANK) {
    assert.ok(Number.isInteger(question.answerIndex));
    assert.ok(question.answerIndex >= 0 && question.answerIndex < question.optionKeys.length);
    for (const messages of catalogs) {
      assert.ok(messages[question.subjectKey]);
      assert.ok(messages[question.promptKey]);
      assert.ok(messages[question.explanationKey]);
      const options = question.optionKeys.map(key => messages[key]);
      assert.ok(options.every(Boolean));
      assert.equal(new Set(options).size, options.length);
    }
  }
});

test("the main loop wires repositories, active-play timing, locale refresh, and final flush", async () => {
  const main = await source("src/main.js");
  const css = await source("styles.css");
  assert.match(main, /new LocalGameSetupRepository\(\)/);
  assert.match(main, /new LocalRoomStateRepository\(\)/);
  assert.match(main, /new LocalParentalControlRepository\(\)/);
  assert.match(main, /const elapsedSeconds = Math\.max\(0,[\s\S]*parentalControl\.tick\(elapsedSeconds,[\s\S]*activeGameplay:/);
  assert.match(main, /const dt = Math\.min\(\.05, elapsedSeconds\)/);
  assert.match(main, /visibilitychange[\s\S]*lastTime = performance\.now\(\)/);
  assert.match(main, /parentalView\.refreshLanguage\(t\)/);
  assert.match(main, /addEventListener\("pagehide", \(\) => \{[\s\S]*parentalControl\.flush\(\)[\s\S]*lanSession\?\.close/);
  assert.match(css, /\.parental-quiz-answers\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*\.parental-quiz-answers\s*\{grid-template-columns:1fr\}/);
  assert.match(css, /\.parental-quiz-option:focus-visible\{[^}]*outline:3px solid var\(--yellow\)/);
  assert.match(css, /@media \(max-width: 390px\)[\s\S]*\.brand>span:last-child/);
  assert.match(css, /@media \(max-width: 1020px\) and \(min-width: 821px\)[\s\S]*\.parental-control-button span/);
});
