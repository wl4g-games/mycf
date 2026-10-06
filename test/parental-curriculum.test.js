import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { parentalMessagesEn } from "../src/locales/parental-en.js";
import { parentalMessagesZhCN } from "../src/locales/parental-zh-CN.js";
import {
  PARENTAL_QUESTION_BANK,
  PARENTAL_SUBJECT_WEIGHTS,
} from "../src/parental/question-bank.js";
import { createParentalQuestionPicker } from "../src/parental/quiz-session.js";

const EXPECTED_COUNTS = Object.freeze({
  language: 16,
  mathematics: 13,
  english: 6,
  geography: 13,
  physics: 13,
  chineseHistory: 16,
  worldHistory: 13,
  finance: 10,
});
const SUBJECT_PREFIXES = Object.freeze({
  language: "cn",
  mathematics: "ma",
  english: "en",
  geography: "ge",
  physics: "ph",
  chineseHistory: "ch",
  worldHistory: "wh",
  finance: "fi",
});
const EXPECTED_MESSAGE_HASHES = Object.freeze({
  en: "9f5bed7d06ba2c7e09a97c0d86540a094c198bfc89fdfa5ec3d0ae966b0c2407",
  zhCN: "29bad797b9783d9dbaa4031de79790acf46c1a6174ed0e9325c4371323cd63b5",
});

function seededRandom(seed = 0x5eed1234) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function hashMessages(messages) {
  return createHash("sha256").update(JSON.stringify(messages)).digest("hex");
}

function localizedQuestion(question, messages) {
  return {
    subject: messages[question.subjectKey],
    prompt: messages[question.promptKey],
    options: question.optionKeys.map(key => messages[key]),
    explanation: messages[question.explanationKey],
  };
}

test("parental curriculum matches the Jumprun 100-question subject contract", () => {
  assert.equal(PARENTAL_QUESTION_BANK.length, 100);
  assert.deepEqual(PARENTAL_SUBJECT_WEIGHTS, {
    language: 5,
    mathematics: 4,
    english: 2,
    geography: 4,
    physics: 4,
    chineseHistory: 5,
    worldHistory: 4,
    finance: 3,
  });
  assert.deepEqual(
    Object.fromEntries(Object.keys(EXPECTED_COUNTS).map(subject => [
      subject,
      PARENTAL_QUESTION_BANK.filter(question => question.subject === subject).length,
    ])),
    EXPECTED_COUNTS,
  );
  assert.deepEqual(PARENTAL_QUESTION_BANK.map(({ id }) => id), Object.entries(EXPECTED_COUNTS).flatMap(
    ([subject, count]) => Array.from({ length: count }, (_, index) => (
      `${SUBJECT_PREFIXES[subject]}-${String(index + 1).padStart(2, "0")}`
    )),
  ));
});

test("localized parental curriculum is an exact snapshot of Jumprun content", () => {
  assert.equal(Object.keys(parentalMessagesEn).length, 608);
  assert.equal(Object.keys(parentalMessagesZhCN).length, 608);
  assert.equal(hashMessages(parentalMessagesEn), EXPECTED_MESSAGE_HASHES.en);
  assert.equal(hashMessages(parentalMessagesZhCN), EXPECTED_MESSAGE_HASHES.zhCN);
});

test("curriculum choices, answers, and explanations meet the shared quality contract", () => {
  const answerPositions = [0, 1, 2, 3].map(answer => (
    PARENTAL_QUESTION_BANK.filter(question => question.answerIndex === answer).length
  ));
  assert.ok(Math.min(...answerPositions) >= 12);

  for (const question of PARENTAL_QUESTION_BANK) {
    assert.match(question.id, /^(cn|ma|en|ge|ph|ch|wh|fi)-\d{2}$/u);
    assert.ok(Number.isInteger(question.answerIndex) && question.answerIndex >= 0 && question.answerIndex < 4);
    for (const messages of [parentalMessagesEn, parentalMessagesZhCN]) {
      const localized = localizedQuestion(question, messages);
      assert.ok(localized.subject);
      assert.ok(localized.prompt);
      assert.equal(localized.options.length, 4);
      assert.equal(new Set(localized.options).size, 4);
      assert.ok(localized.options.every(option => String(option).trim().length > 0));
      assert.ok(localized.explanation);
    }
  }
});

test("weighted picker exhausts every question and prevents recent repeats", () => {
  const picker = createParentalQuestionPicker({ random: seededRandom() });
  const firstCycle = [];
  const recent = [];
  const counts = Object.fromEntries(Object.keys(EXPECTED_COUNTS).map(subject => [subject, 0]));

  for (let index = 0; index < 300; index++) {
    const question = picker.next();
    assert.ok(!recent.includes(question.id), `${question.id} repeated inside the recent-question window`);
    recent.push(question.id);
    if (recent.length > 8) recent.shift();
    counts[question.subject] += 1;
    if (index < 100) firstCycle.push(question.id);
  }

  assert.equal(new Set(firstCycle).size, 100);
  assert.deepEqual(counts, Object.fromEntries(Object.entries(EXPECTED_COUNTS).map(
    ([subject, count]) => [subject, count * 3],
  )));
});
