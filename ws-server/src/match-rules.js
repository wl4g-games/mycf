export const DEFAULT_CONDITION_ID = "standard";

export const MATCH_CONDITIONS = Object.freeze({
  blitz: Object.freeze({ id: "blitz", killTarget: 10, timeLimit: 180 }),
  standard: Object.freeze({ id: "standard", killTarget: 20, timeLimit: 300 }),
  extended: Object.freeze({ id: "extended", killTarget: 30, timeLimit: 480 }),
  marathon: Object.freeze({ id: "marathon", killTarget: 50, timeLimit: 720 }),
});

export const MATCH_CONDITION_IDS = Object.freeze(Object.keys(MATCH_CONDITIONS));
export const DEFAULT_TIME_LIMIT = MATCH_CONDITIONS[DEFAULT_CONDITION_ID].timeLimit;
export const BATTLE_MODE_IDS = Object.freeze(["team", "bio"]);
export const BIO_DURATIONS = Object.freeze([180, 300, 600]);

export function resolveBattleSettings(settings = {}) {
  return {
    battleModeId: settings.battleModeId === "bio" ? "bio" : "team",
    bioDuration: BIO_DURATIONS.includes(Number(settings.bioDuration)) ? Number(settings.bioDuration) : 300,
  };
}

export function resolveMatchCondition(settings = {}) {
  const battle = resolveBattleSettings(settings);
  if (battle.battleModeId === "bio") return { id: "standard", killTarget: 3, timeLimit: battle.bioDuration, ...battle };
  return MATCH_CONDITIONS[settings.conditionId] || MATCH_CONDITIONS[DEFAULT_CONDITION_ID];
}
