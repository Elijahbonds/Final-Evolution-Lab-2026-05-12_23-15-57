// RECOGNISABLE — is a move played by the motion its name promises? (2026-09-15, owner: "The animations need to be
// recognizable on sight", and a "recognisable" check on the scorecard.)
//
// The fighter rig shipped nine clips (guard, jab, hook, uppercut, roundhouse, high_kick, jumpshot, run, walk) and
// clipAliases pointed every sport's names at them so nothing ever T-posed. Most families have since been authored, but an
// alias left behind still plays silently: a quarterback's throw was the boxer's jab, a hoops make ended in a karate
// uppercut, a keeper's dive was a roundhouse kick. CharacterAnimator records every request another clip answered
// (clipScope ledger `stoodIn`, "requested→played"); this says which of those a player would call the WRONG MOVE.
//
// Pure: names only.

/** The fighter rig's strikes: they belong to a fight, and to nothing else. */
const STRIKES = new Set(['jab', 'hook', 'uppercut', 'roundhouse', 'high_kick']);
/** Requests that ARE a fight (a strike standing in for a strike is a variant, not a wrong move). */
const FIGHT_NAME = /^(karate_|combat_|strike|jab|hook|uppercut|roundhouse|high_kick|kick|punch)/;
/** A basketball jump shot belongs to hoops and to a plain jump. */
const HOOPS_NAME = /^(bball_|dunk_|jump|shot|teammate_toss|cheer)/;
/** Requests that name an ACTION — a stance, walk or run standing in for one is a missing move, not a variant. */
const ACTION = /dive|slide|tackle|fall|throw|spike|juke|spin|kick|swing|stroke|pass|grab|flip|celebrat|pump|stiff|hurdle|catch|header|serve|pitch|dodge|roll|bail/;
const RESTING = new Set(['guard', 'walk', 'run', 'idle_stand']);

export interface StandIn { requested: string; played: string; count: number; why: string }

/** Why `played` is the wrong move for `requested`, or null when it reads as the move. */
export function wrongMove(requested: string, played: string): string | null {
  const req = requested.replace(/\.M$/, ''), pl = played.replace(/\.M$/, '').replace(/_c\d+$/, '');
  if (req === pl) return null;
  if (STRIKES.has(pl) && !FIGHT_NAME.test(req)) return `a fighter's ${pl} plays "${req}"`;
  if (pl === 'jumpshot' && !HOOPS_NAME.test(req)) return `a basketball jump shot plays "${req}"`;
  if (RESTING.has(pl) && ACTION.test(req)) return `the ${pl} loop stands in for the action "${req}"`;
  return null;
}

/** The ledger's stand-ins a player would read as the wrong move, most-played first. */
export function wrongMoves(stoodIn: Record<string, number> | null | undefined): StandIn[] {
  const out: StandIn[] = [];
  for (const [key, count] of Object.entries(stoodIn ?? {})) {
    const [requested, played] = key.split('→');
    if (!requested || !played) continue;
    const why = wrongMove(requested, played);
    if (why) out.push({ requested, played, count, why });
  }
  return out.sort((a, b) => b.count - a.count);
}
