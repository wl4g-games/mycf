import {
  DEFAULT_PARENTAL_SETTINGS,
  PARENTAL_DURATION_OPTIONS,
  PARENTAL_QUESTION_OPTIONS,
} from "../parental/settings.js";
import { createInitialParentalState, normalizeParentalState } from "../parental/state.js";
import { LocalJsonRepository } from "./local-json-repository.js";

export const PARENTAL_CONTROL_STORAGE_KEY = "toon-strike.parental-control.v1";
export const PARENTAL_DURATION_MINUTES = PARENTAL_DURATION_OPTIONS;
export const PARENTAL_QUESTION_COUNTS = PARENTAL_QUESTION_OPTIONS;

const initialState = createInitialParentalState(DEFAULT_PARENTAL_SETTINGS);
export const DEFAULT_PARENTAL_CONTROL_STATE = Object.freeze({
  ...initialState,
  settings: DEFAULT_PARENTAL_SETTINGS,
  cycle: Object.freeze({ ...initialState.cycle }),
});

export function normalizeParentalControlState(value = {}) {
  return normalizeParentalState(value, DEFAULT_PARENTAL_SETTINGS);
}

function isUntouchedInitialCycle(state) {
  return state.cycle.id === 0
    && !state.cycle.locked
    && state.cycle.remainingSeconds === state.cycle.durationMinutes * 60;
}

function mergeCurrentCycle(current, incoming) {
  const locked = current.cycle.locked || incoming.cycle.locked;
  return {
    id: current.cycle.id,
    durationMinutes: Math.min(current.cycle.durationMinutes, incoming.cycle.durationMinutes),
    remainingSeconds: locked
      ? 0
      : Math.min(current.cycle.remainingSeconds, incoming.cycle.remainingSeconds),
    locked,
  };
}

/**
 * Merges a browser-local write against freshly loaded state. Timer writes are
 * monotonic within a cycle, while advancing to the next cycle requires the
 * caller to prove which locked cycle it answered.
 */
export function mergeParentalControlState(currentValue, incomingValue, {
  intent = "timer",
} = {}) {
  const current = normalizeParentalControlState(currentValue);
  const incoming = normalizeParentalControlState(incomingValue);
  if (intent === "replace") return incoming;

  const settings = intent === "settings" ? incoming.settings : current.settings;
  if (incoming.cycle.id !== current.cycle.id) return { ...current, settings };

  const firstActivation = intent === "settings"
    && !current.settings.enabled
    && incoming.settings.enabled
    && isUntouchedInitialCycle(current);
  const cycle = firstActivation ? incoming.cycle : mergeCurrentCycle(current, incoming);
  return { version: current.version, settings, cycle };
}

export class IParentalControlRepository {
  load() { throw new Error("IParentalControlRepository.load() is not implemented."); }
  save(_state, _options) { throw new Error("IParentalControlRepository.save() is not implemented."); }
  advanceCycle(_state, _expectedCycleId, _proof) { throw new Error("IParentalControlRepository.advanceCycle() is not implemented."); }
  clear() { throw new Error("IParentalControlRepository.clear() is not implemented."); }
  subscribe(_listener) { throw new Error("IParentalControlRepository.subscribe() is not implemented."); }
}

export class LocalParentalControlRepository extends IParentalControlRepository {
  constructor(options = {}) {
    super();
    this.repository = new LocalJsonRepository({
      ...options,
      key: options.key || PARENTAL_CONTROL_STORAGE_KEY,
      normalize: normalizeParentalControlState,
    });
  }

  load() { return this.repository.load(); }
  save(state, options = {}) {
    const current = this.repository.load();
    return this.repository.save(mergeParentalControlState(current, state, options));
  }
  advanceCycle(state, expectedCycleId, { questionsAnswered = 0 } = {}) {
    const current = this.repository.load();
    const incoming = normalizeParentalControlState(state);
    const expected = Number(expectedCycleId);
    const advanced = Number.isSafeInteger(expected)
      && current.cycle.id === expected
      && current.cycle.locked
      && current.settings.enabled
      && Number(questionsAnswered) >= current.settings.questionsToUnlock
      && incoming.cycle.id === expected + 1;
    const durationMinutes = current.settings.durationMinutes;
    const next = advanced ? {
      ...incoming,
      settings: current.settings,
      cycle: {
        id: expected + 1,
        durationMinutes,
        remainingSeconds: durationMinutes * 60,
        locked: false,
      },
    } : current;
    const saved = this.repository.save(next);
    return Object.freeze({ advanced, state: saved });
  }
  clear() { return this.repository.clear(); }
  subscribe(listener) { return this.repository.subscribe(listener); }
}
