function numericStat(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function rankingPoints(actor) {
  return numericStat(actor.kills) * 100 + Math.round(numericStat(actor.damage)) - numericStat(actor.deaths) * 10;
}

export function createMatchResult(actors, winner, score, condition = {}) {
  const rankings = actors
    .map(actor => ({
      actorId: actor.id,
      userId: actor.userId || null,
      isPlayer: Boolean(actor.isPlayer),
      name: actor.name,
      team: actor.team,
      isBot: Boolean(actor.isBot),
      characterId: actor.characterId,
      kills: numericStat(actor.kills),
      deaths: numericStat(actor.deaths),
      kd: numericStat(actor.kills) / Math.max(1, numericStat(actor.deaths)),
      damage: Math.round(numericStat(actor.damage)),
      points: rankingPoints(actor),
      result: actor.team === winner ? "win" : "loss",
    }))
    .sort((a, b) => b.points - a.points || b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
  return {
    winner,
    score: { ...score },
    conditionId: condition.id,
    killTarget: condition.killTarget,
    timeLimit: condition.timeLimit,
    rankings,
  };
}

export function summarizeActorStats(actors, localActorId) {
  const teams = {};
  let local = { kills: 0, deaths: 0 };
  for (const actor of actors || []) {
    if (!teams[actor.team]) teams[actor.team] = { kills: 0, deaths: 0 };
    teams[actor.team].kills += numericStat(actor.kills);
    teams[actor.team].deaths += numericStat(actor.deaths);
    if (actor.id === localActorId) local = { kills: numericStat(actor.kills), deaths: numericStat(actor.deaths) };
  }
  return { teams, local };
}

export function alliedPodium(rankings, team, limit = 3) {
  return (rankings || [])
    .filter(entry => entry.team === team)
    .sort((left, right) => right.kills - left.kills
      || left.deaths - right.deaths
      || right.damage - left.damage
      || left.rank - right.rank)
    .slice(0, limit);
}
