export const PARENTAL_DURATION_OPTIONS = Object.freeze([1, 3, 5, 10, 20]);
export const PARENTAL_QUESTION_OPTIONS = Object.freeze([1, 3, 5, 10]);

export const DEFAULT_PARENTAL_SETTINGS = Object.freeze({
  enabled: false,
  durationMinutes: 3,
  questionsToUnlock: 1,
});

export function normalizeParentalSettings(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const durationMinutes = Number(source.durationMinutes);
  const questionsToUnlock = Number(source.questionsToUnlock);
  return Object.freeze({
    enabled: source.enabled === true,
    durationMinutes: PARENTAL_DURATION_OPTIONS.includes(durationMinutes)
      ? durationMinutes
      : DEFAULT_PARENTAL_SETTINGS.durationMinutes,
    questionsToUnlock: PARENTAL_QUESTION_OPTIONS.includes(questionsToUnlock)
      ? questionsToUnlock
      : DEFAULT_PARENTAL_SETTINGS.questionsToUnlock,
  });
}
