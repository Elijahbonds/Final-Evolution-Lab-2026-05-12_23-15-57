// lib/combine/today.ts — COMBINE-DAY (2026-10-25): the JUMP GATE, today, per athlete. NOT A NEW RULE.
//
// The jump stations follow the same gate the warm-up, the drills page and the daily drill follow (lib/coach/warmup.ts
// "THE JUMP GATE", P8 rule (b)): the server reads each athlete's context with the warm-up's own reader
// (lib/coach/warmupServer.ts loadWarmupContext → hardStopped, painDecision, jumpGate, isYouth) and this file asks the
// drills page's own verdict (lib/drills/access.ts drillsAccess) about it:
//   · a standing intake red flag (hardStopped): every camera station is held — the drills page runs no drill at all;
//   · the jump and approach stations are plyometrics: held whenever the drills page holds a chapter-6 jump drill (the
//     bilateral pogos, all impact) — a pain step-down or stop today, P8's gate shut (no landing check in four weeks, an
//     intake answer, no health consent…), the youth rule, or a context that could not be read;
//   · a skill drill is held when it has a jumping or landing phase (lib/coach/warmup.ts phaseImpact, read off the chart)
//     under that same verdict; a drill that never leaves the floor (the countermovement geometry) is held only by a hard stop.
// A FAILED READ CLOSES IT, as the drills page does: the server hands FALLBACK_WARMUP_CONTEXT in (youth rules, gate shut).
//
// WHAT LEAVES THE SERVER: two booleans' worth (the jump stations held, and which drill ids). Never the pain answer, the
// intake, the reason or the gate's line: the coach reads "held today" and nothing else (copy.ts HELD_TODAY_LINE).
//
// Pure.
import { drillsAccess } from '@/lib/drills/access';
import { POGO_BILATERAL, drillById } from '@/lib/drills/drills';
import { phaseImpact, type WarmupContext } from '@/lib/coach/warmup';
import { SKILL_DRILLS, type StationKind } from './catalogue';

export interface TodayHolds {
  /** The jump and approach stations are held today. */
  jump: boolean;
  /** The skill-drill stations (drill ids) held today. */
  skills: string[];
}

/** Nothing held: an athlete every gate let through today. */
export const OPEN_TODAY: TodayHolds = { jump: false, skills: [] };
/** Everything held: the careful answer when nothing was read (a typed name, a draft from before this rule). */
export const HELD_TODAY: TodayHolds = { jump: true, skills: SKILL_DRILLS.map((d) => d.id) };

type Ctx = Pick<WarmupContext, 'isYouth' | 'painDecision' | 'hardStopped' | 'jumpGate' | 'unavailable'>;

/** The day's holds from the warm-up's context, through the drills page's own verdict. */
export function todayHolds(ctx: Ctx): TodayHolds {
  const access = drillsAccess(ctx);
  if (access.stopped) return { jump: true, skills: SKILL_DRILLS.map((d) => d.id) };
  const plyo = access.drills.find((d) => d.id === POGO_BILATERAL.id)?.gate !== 'open';
  return {
    jump: plyo,
    skills: plyo ? SKILL_DRILLS.filter((v) => drillById(v.id)?.phases.some(phaseImpact) ?? true).map((v) => v.id) : [],
  };
}

/** Is this station held for this athlete today? A missing answer is held (the careful side). */
export function stationHeldToday(today: TodayHolds | null | undefined, st: { kind: StationKind; variant: string }): boolean {
  if (st.kind === 'sprint' || st.kind === 'agility') return false;
  if (!today) return true;
  if (st.kind === 'skill') return today.skills.includes(st.variant);
  return today.jump;
}
