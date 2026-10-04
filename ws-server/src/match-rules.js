export const DEFAULT_CONDITION_ID = "standard";

export const MATCH_CONDITIONS = Object.freeze({
  blitz: Object.freeze({ id: "blitz", killTarget: 10, timeLimit: 180 }),
  standard: Object.freeze({ id: "standard", killTarget: 20, timeLimit: 300 }),
  extended: Object.freeze({ id: "extended", killTarget: 30, timeLimit: 480 }),
  marathon: Object.freeze({ id: "marathon", killTarget: 50, timeLimit: 720 }),
});

export const MATCH_CONDITION_IDS = Object.freeze(Object.keys(MATCH_CONDITIONS));
export const DEFAULT_TIME_LIMIT = MATCH_CONDITIONS[DEFAULT_CONDITION_ID].timeLimit;

export function resolveMatchCondition(settings = {}) {
  return MATCH_CONDITIONS[settings.conditionId] || MATCH_CONDITIONS[DEFAULT_CONDITION_ID];
}
