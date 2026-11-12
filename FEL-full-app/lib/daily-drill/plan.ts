// DAILY-DRILL — which drill today: the weakest measured number, mapped onto drills that already exist.
//
// Pure: no Prisma, no DOM, no clock. In: the readings (skills.ts), the user, the day, and what the drills page may run
// today (lib/drills/access.ts drillsAccess, the warm-up's own gates). Out: one plan, the same for every call with the
// same inputs, so the same drill on every device all day.
//
// THE PICK
//   1. The lowest standing wins (skills.ts puts every number on 0–100, higher better).
//   2. A tie (the same whole-number standing) goes to the one that got WORSE against last week; still tied, to a
//      hash of (user, day, skill) — fixed for the day, and it rotates between equals from one day to the next.
//   3. No reading at all: the starter (the Pre-Game Wake-Up) and a nudge to measure (copy.ts says which, by gate).
//
// THE DRILLS (what exists, not new content). Every drill is on the /play/drills shelf (lib/drills/route.ts ROUTE_DRILLS):
// the other six charts have never been run on a camera in a room, and two need more floor than the space check measures.
//   jump      Pogo Progression: Both Feet (Playbook ch. 6, reactive spring); jumps held → Countermovement Geometry.
//   form      Countermovement Geometry Check (ch. 6: knee 90, hips back, heels down, tripod — the squat's own checks).
//   shot      Safe Landing Check (ch. 6: a jumper lands where it left); jumps held → Countermovement Geometry (the dip).
//             assumption: no shooting drill exists on the shelf; this trains the jumper's base, not the release.
//   mobility  The Pre-Game Wake-Up (ch. 5: release, joints).
//   starter   The Pre-Game Wake-Up: ten minutes, the whole body, the owner's own protocol.
// A focus drill is short (1–3 min), so it follows FEL's quick Wake-Up (lib/coach/warmup.ts WAKE_UP_BY_MINUTES[6]:
// pressurize, tripod, joints — 4 min, all calm), in the Playbook's order: 5–7 minutes in all.
//
// THE SAFETY GATES ARE THE DRILLS PAGE'S (access): a drill that jumps runs only when that page would run it today.
// Held, the focus takes its calm drill. A standing intake red flag: no drill at all (the drills page shows nothing either).
// So the drill is the same all day UNLESS a gate changes during it (a pain check-in, a landing check passed): the gate
// wins, and the claim takes either drill of the day's focus (claim.ts).
import type { Drill } from '@/lib/drills/chart';
import { COUNTERMOVEMENT_GEOMETRY, POGO_BILATERAL, SAFE_LANDING, WAKE_UP } from '@/lib/drills/drills';
import { drillToRun, type DrillsAccess } from '@/lib/drills/gate';
import { WAKE_UP_BY_MINUTES, phaseImpact } from '@/lib/coach/warmup';
import type { DailyChartSpec, PhaseRef } from './compose';
import type { SkillKey, SkillReading } from './skills';

export type Focus = SkillKey | 'starter';

interface FocusDrills {
  /** The drill when today's gates let it jump; null when the focus has no jumping drill. */
  impact: Drill | null;
  /** The drill when jumps wait (and the one drill of a calm focus). */
  calm: Drill;
  /** Runs after the quick Wake-Up (a short drill); false for a drill that is its own warm-up. */
  prep: boolean;
}

export const FOCUS_DRILLS: Record<Focus, FocusDrills> = {
  jump: { impact: POGO_BILATERAL, calm: COUNTERMOVEMENT_GEOMETRY, prep: true },
  form: { impact: null, calm: COUNTERMOVEMENT_GEOMETRY, prep: true },
  shot: { impact: SAFE_LANDING, calm: COUNTERMOVEMENT_GEOMETRY, prep: true },
  mobility: { impact: null, calm: WAKE_UP, prep: false },
  starter: { impact: null, calm: WAKE_UP, prep: false },
};

/** The quick Wake-Up a short drill follows: the warm-up generator's 6-minute phases, in the Wake-Up's own order. */
export const PREP_PHASES: readonly string[] = WAKE_UP.phases.map((p) => p.id).filter((id) => WAKE_UP_BY_MINUTES[6].includes(id));

/** FNV-1a, 32-bit: a stable hash for the tie-break (the same on every server, every day it is asked). */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const TREND_ORDER: Record<string, number> = { worse: 0, same: 1, null: 1, better: 2 };

/** The readings, weakest first: standing, then a worsening trend, then the day's hash. */
export function rankSkills(skills: readonly SkillReading[], userId: string, day: string): SkillReading[] {
  return [...skills].sort((a, b) =>
    Math.round(a.standing) - Math.round(b.standing)
    || TREND_ORDER[String(a.trend)] - TREND_ORDER[String(b.trend)]
    || fnv1a(`${userId}|${day}|${a.key}`) - fnv1a(`${userId}|${day}|${b.key}`)
    || a.key.localeCompare(b.key));
}

export interface FocusPick {
  focus: Focus;
  /** The reading it was picked from; null for the starter. */
  skill: SkillReading | null;
  /** Other readings with the same whole-number standing (a tie the trend or the hash decided). */
  tiedWith: SkillKey[];
}

export function pickFocus(skills: readonly SkillReading[], userId: string, day: string): FocusPick {
  const ranked = rankSkills(skills, userId, day);
  const first = ranked[0];
  if (!first) return { focus: 'starter', skill: null, tiedWith: [] };
  const tiedWith = ranked.slice(1).filter((s) => Math.round(s.standing) === Math.round(first.standing)).map((s) => s.key);
  return { focus: first.key, skill: first, tiedWith };
}

export interface DailyPlan extends DailyChartSpec {
  focus: Focus;
  /** The drill ran calm today: its jumping version (or the Wake-Up's jumping phases) waits on a gate. */
  calm: boolean;
  /** The gate's own line and link when something waits (the drills page's words), else null. */
  heldNote: string | null;
  heldHref: string | null;
}

/** The daily key the claim names: focus and drill. */
export const dailyKeyOf = (focus: Focus, drillId: string): string => `${focus}:${drillId}`;

/** The drill ids a focus may run today (either side of the gate): what a claim for that focus may name. */
export function focusDrillIds(focus: Focus): string[] {
  const f = FOCUS_DRILLS[focus];
  return [...(f.impact ? [f.impact.id] : []), f.calm.id];
}

/**
 * The plan for a focus under today's access. null when nothing may run (a standing red flag: access.stopped), or when
 * the gates leave a drill with nothing required in it (drillToRun's rule).
 */
export function planFor(focus: Focus, access: DrillsAccess): DailyPlan | null {
  if (access.stopped) return null;
  const f = FOCUS_DRILLS[focus];
  const gateOf = (id: string) => access.drills.find((d) => d.id === id)?.gate ?? 'held';
  const useImpact = !!f.impact && gateOf(f.impact.id) === 'open';
  const drill = useImpact ? f.impact! : f.calm;
  const run = drillToRun(access, drill.id);
  if (!run) return null;
  const impactOk = gateOf(drill.id) === 'open';
  // belt and braces: a phase that jumps or lands runs only on a drill the gate left open
  const main: PhaseRef[] = run.phases.filter((p) => impactOk || !phaseImpact(p)).map((p) => ({ drill: drill.id, phase: p.id }));
  if (!main.length) return null;
  const prep: PhaseRef[] = f.prep
    ? WAKE_UP.phases.filter((p) => PREP_PHASES.includes(p.id) && !phaseImpact(p)).map((p) => ({ drill: WAKE_UP.id, phase: p.id }))
    : [];
  const calm = (!!f.impact && !useImpact) || gateOf(drill.id) === 'trimmed';
  return {
    key: dailyKeyOf(focus, drill.id), focus, drillId: drill.id, name: drill.name,
    phases: [...prep, ...main],
    calm,
    heldNote: calm ? access.note : null,
    heldHref: calm ? access.noteHref : null,
  };
}
