import assert from "node:assert/strict";
import test from "node:test";

import {
  PARENTAL_DURATION_OPTIONS,
  PARENTAL_QUESTION_BANK,
  PARENTAL_QUESTION_OPTIONS,
  ParentalControl,
  ParentalQuizSession,
  createParentalQuestionPicker,
  normalizeParentalSettings,
} from "../src/parental/index.js";
import { LocalParentalControlRepository } from "../src/repositories/parental-control-repository.js";

function createMemoryRepository(initial = null) {
  let value = initial == null ? null : structuredClone(initial);
  let saves = 0;
  return {
    load: () => value == null ? null : structuredClone(value),
    save(next) {
      value = structuredClone(next);
      saves += 1;
    },
    advanceCycle(next, expectedCycleId, { questionsAnswered = 0 } = {}) {
      const current = value == null ? null : structuredClone(value);
      const advanced = current?.cycle?.id === expectedCycleId
        && current.cycle.locked === true
        && current.settings.enabled === true
        && questionsAnswered >= current.settings.questionsToUnlock;
      if (advanced) value = structuredClone(next);
      return { advanced, state: structuredClone(value) };
    },
    snapshot: () => value == null ? null : structuredClone(value),
    get saves() { return saves; },
  };
}

function answerFor(questionId) {
  return PARENTAL_QUESTION_BANK.find(question => question.id === questionId).answerIndex;
}

function createStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

test("parental settings expose only the supported timer and quiz choices", () => {
  assert.deepEqual(PARENTAL_DURATION_OPTIONS, [1, 3, 5, 10, 20]);
  assert.deepEqual(PARENTAL_QUESTION_OPTIONS, [1, 3, 5, 10]);
  assert.deepEqual(normalizeParentalSettings({ durationMinutes: 20, questionsToUnlock: 10 }), {
    enabled: false,
    durationMinutes: 20,
    questionsToUnlock: 10,
  });
  assert.deepEqual(normalizeParentalSettings({ durationMinutes: 2, questionsToUnlock: 2 }), {
    enabled: false,
    durationMinutes: 3,
    questionsToUnlock: 1,
  });
});

test("countdown advances only during active, unpaused gameplay without an open quiz", () => {
  const control = new ParentalControl({ settings: { enabled: true, durationMinutes: 1 } });

  control.tick(10, { activeGameplay: false });
  control.tick(10, { activeGameplay: true, paused: true });
  control.tick(10, { activeGameplay: true, quizOpen: true });
  assert.equal(control.getSnapshot().remainingSeconds, 60);

  const running = control.tick(15.25, { activeGameplay: true });
  assert.equal(running.changed, true);
  assert.equal(running.justLocked, false);
  assert.equal(control.getSnapshot().remainingSeconds, 44.75);
  assert.equal(control.getSnapshot().formattedRemaining, "00:45");

  const expired = control.tick(60, { activeGameplay: true });
  assert.equal(expired.justLocked, true);
  assert.equal(control.getSnapshot().remainingSeconds, 0);
  assert.equal(control.getSnapshot().blocking, true);
});

test("parental countdown is opt-in and disabling it preserves rather than resets progress", () => {
  const control = new ParentalControl();
  control.tick(20, { activeGameplay: true });
  assert.equal(control.getSnapshot().remainingSeconds, 180);

  control.configure({ enabled: true, durationMinutes: 20 });
  assert.equal(control.getSnapshot().remainingSeconds, 1_200);
  control.tick(20, { activeGameplay: true });
  assert.equal(control.getSnapshot().remainingSeconds, 1_180);
  control.configure({ enabled: false });
  control.tick(20, { activeGameplay: true });
  assert.equal(control.getSnapshot().remainingSeconds, 1_180);
  control.configure({ enabled: true });
  assert.equal(control.getSnapshot().remainingSeconds, 1_180);
});

test("frame ticks keep exact in-memory time while persisting at most once per second", () => {
  const repository = createMemoryRepository();
  const control = new ParentalControl({ stateRepository: repository, settings: { enabled: true, durationMinutes: 1 } });
  const initialSaves = repository.saves;

  for (let frame = 0; frame < 10; frame++) {
    control.tick(0.1, { activeGameplay: true });
  }

  assert.ok(Math.abs(control.getSnapshot().remainingSeconds - 59) < 1e-9);
  assert.equal(repository.saves - initialSaves, 1);
  control.flush();
  assert.equal(repository.saves - initialSaves, 2);
});

test("parental control and the local repository share one normalized state contract", () => {
  const repository = new LocalParentalControlRepository({ storage: createStorage(), eventTarget: null });
  const control = new ParentalControl({ stateRepository: repository });
  assert.equal(control.getSnapshot().settings.enabled, false);

  control.configure({ enabled: true, durationMinutes: 1, questionsToUnlock: 3 });
  control.tick(1, { activeGameplay: true });
  const persisted = repository.load();
  assert.equal(persisted.settings.questionsToUnlock, 3);
  assert.equal(persisted.cycle.durationMinutes, 1);
  assert.equal(persisted.cycle.remainingSeconds, 59);
});

test("shorter settings tighten the current cycle while longer settings wait for the next cycle", () => {
  const repository = createMemoryRepository();
  const control = new ParentalControl({
    stateRepository: repository,
    settings: { enabled: true, durationMinutes: 5, questionsToUnlock: 1 },
  });

  control.tick(87, { activeGameplay: true });
  assert.equal(control.getSnapshot().remainingSeconds, 213);
  control.configure({ durationMinutes: 10 });
  assert.equal(control.getSnapshot().remainingSeconds, 213);
  assert.equal(control.getSnapshot().cycleDurationMinutes, 5);

  control.configure({ durationMinutes: 1 });
  assert.equal(control.getSnapshot().remainingSeconds, 60);
  assert.equal(control.getSnapshot().cycleDurationMinutes, 1);
  control.configure({ durationMinutes: 3 });
  assert.equal(control.getSnapshot().remainingSeconds, 60);
  assert.equal(control.getSnapshot().cycleDurationMinutes, 1);

  const restored = new ParentalControl({ stateRepository: repository });
  assert.equal(restored.getSnapshot().remainingSeconds, 60);
  assert.equal(restored.getSnapshot().settings.durationMinutes, 3);
});

test("a locked cycle requires the configured number of correct, non-repeating questions", () => {
  const control = new ParentalControl({
    settings: { enabled: true, durationMinutes: 1, questionsToUnlock: 10 },
    random: () => 0.25,
    localize: key => `localized:${key}`,
  });
  control.tick(60, { activeGameplay: true });

  const ids = [];
  for (let correct = 0; correct < 10; correct++) {
    const quiz = correct === 0 ? control.startQuiz() : control.nextQuestion();
    ids.push(quiz.question.id);
    assert.match(quiz.question.prompt, /^localized:parental\.question\./u);
    const result = control.answer(answerFor(quiz.question.id));
    assert.equal(result.accepted, true);
    assert.equal(result.isCorrect, true);
    assert.equal(result.unlocked, correct === 9);
  }

  assert.equal(new Set(ids).size, 10);
  assert.equal(control.getSnapshot().blocking, false);
  assert.equal(control.getSnapshot().cycleId, 1);
  assert.equal(control.getSnapshot().remainingSeconds, 60);
});

test("wrong answers do not advance progress and a question cannot be answered twice", () => {
  const session = new ParentalQuizSession({ requiredCorrect: 3, random: () => 0 });
  const current = session.current();
  const answer = answerFor(current.id);
  const wrong = (answer + 1) % 4;

  assert.deepEqual(session.answer(wrong), {
    correct: 0,
    required: 3,
    attempts: 1,
    completed: false,
    accepted: true,
    isCorrect: false,
    correctAnswerIndex: answer,
    explanationKey: current.explanationKey,
    explanation: current.explanationKey,
  });
  assert.equal(session.answer(answer).accepted, false);
  assert.notEqual(session.next().id, current.id);
});

test("the picker exhausts its bank before repeating and avoids cycle-boundary repeats", () => {
  const picker = createParentalQuestionPicker({ random: () => 0 });
  const firstCycle = Array.from({ length: PARENTAL_QUESTION_BANK.length }, () => picker.next().id);
  const next = picker.next().id;
  assert.equal(new Set(firstCycle).size, PARENTAL_QUESTION_BANK.length);
  assert.notEqual(next, firstCycle.at(-1));
});

test("repository subscriptions tighten active state and accept a newer unlocked cycle", () => {
  let listener = null;
  const repository = createMemoryRepository();
  repository.subscribe = next => {
    listener = next;
    return () => { listener = null; };
  };
  const control = new ParentalControl({ stateRepository: repository, settings: { enabled: true, durationMinutes: 5 } });
  control.tick(30, { activeGameplay: true });

  const remote = repository.snapshot();
  remote.settings.durationMinutes = 1;
  remote.cycle.durationMinutes = 1;
  remote.cycle.remainingSeconds = 20;
  listener(remote);
  assert.equal(control.getSnapshot().remainingSeconds, 20);
  assert.equal(control.getSnapshot().settings.durationMinutes, 1);

  remote.cycle.id += 1;
  remote.cycle.locked = false;
  remote.cycle.remainingSeconds = 60;
  listener(remote);
  assert.equal(control.getSnapshot().cycleId, 1);
  assert.equal(control.getSnapshot().remainingSeconds, 60);
  control.dispose();
  assert.equal(listener, null);
});

test("a stale tab cannot restore time or unlock a newer cycle", () => {
  const storage = createStorage();
  const firstRepository = new LocalParentalControlRepository({ storage, eventTarget: null });
  const staleRepository = new LocalParentalControlRepository({ storage, eventTarget: null });
  const first = new ParentalControl({ stateRepository: firstRepository, random: () => 0 });
  first.configure({ enabled: true, durationMinutes: 1, questionsToUnlock: 1 });
  const stale = new ParentalControl({ stateRepository: staleRepository, random: () => 0 });

  first.tick(60, { activeGameplay: true });
  stale.tick(60, { activeGameplay: true });
  const staleQuestion = stale.startQuiz().question;
  first.configure({ durationMinutes: 20 });
  const firstQuestion = first.startQuiz().question;
  assert.equal(first.answer(answerFor(firstQuestion.id)).unlocked, true);
  assert.equal(first.getSnapshot().remainingSeconds, 1_200);
  first.tick(30, { activeGameplay: true });

  const lateAnswer = stale.answer(answerFor(staleQuestion.id));
  assert.equal(lateAnswer.unlocked, false);
  assert.equal(stale.getSnapshot().cycleId, 1);
  assert.equal(stale.getSnapshot().remainingSeconds, 1_170);
  assert.equal(firstRepository.load().cycle.remainingSeconds, 1_170);

  first.tick(1_170, { activeGameplay: true });
  stale.flush();
  const stored = firstRepository.load();
  assert.equal(stored.cycle.id, 1);
  assert.equal(stored.cycle.locked, true);
  assert.equal(stored.cycle.remainingSeconds, 0);
});

test("question definitions contain message keys rather than embedded UI copy", () => {
  assert.ok(PARENTAL_QUESTION_BANK.length >= 10);
  for (const question of PARENTAL_QUESTION_BANK) {
    const serialized = JSON.stringify(question);
    assert.doesNotMatch(serialized, /[\u3400-\u9fff]/u);
    assert.match(question.promptKey, /^parental\.question\./u);
    assert.equal(question.optionKeys.length, 4);
  }
});
