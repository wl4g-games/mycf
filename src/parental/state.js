import {
  DEFAULT_PARENTAL_SETTINGS,
  PARENTAL_DURATION_OPTIONS,
  normalizeParentalSettings,
} from "./settings.js";

export const PARENTAL_STATE_VERSION = 1;

export function createInitialParentalState(settings = DEFAULT_PARENTAL_SETTINGS) {
  const normalized = normalizeParentalSettings(settings);
  return {
    version: PARENTAL_STATE_VERSION,
    settings: normalized,
    cycle: {
      id: 0,
      durationMinutes: normalized.durationMinutes,
      remainingSeconds: normalized.durationMinutes * 60,
      locked: false,
    },
  };
}

export function normalizeParentalState(value, fallbackSettings = DEFAULT_PARENTAL_SETTINGS) {
  if (!value || typeof value !== "object") return createInitialParentalState(fallbackSettings);
  const settings = normalizeParentalSettings(value.settings ?? fallbackSettings);
  const rawCycle = value.cycle && typeof value.cycle === "object" ? value.cycle : {};
  const id = Number(rawCycle.id);
  const duration = Number(rawCycle.durationMinutes);
  const durationMinutes = PARENTAL_DURATION_OPTIONS.includes(duration)
    ? duration
    : settings.durationMinutes;
  const rawRemaining = Number(rawCycle.remainingSeconds);
  const maximumSeconds = durationMinutes * 60;
  const remainingSeconds = Number.isFinite(rawRemaining) && rawRemaining >= 0
    ? Math.min(rawRemaining, maximumSeconds)
    : maximumSeconds;
  const locked = rawCycle.locked === true || remainingSeconds === 0;

  return {
    version: PARENTAL_STATE_VERSION,
    settings,
    cycle: {
      id: Number.isSafeInteger(id) && id >= 0 ? id : 0,
      durationMinutes,
      remainingSeconds: locked ? 0 : remainingSeconds,
      locked,
    },
  };
}
