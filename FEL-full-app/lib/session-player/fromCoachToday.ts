// lib/session-player/fromCoachToday.ts — PLAT-P06 (2026-10-28): the second adapter. A coached athlete's session as Today
// serves it (GET /api/coach/me/today, lib/coach/todayServer.ts loadToday: the protocol gate, the readiness ease and the
// youth rules already applied) → the player's Session, so a coach's session plays like a signature one.
//
// What it keeps from the route, unchanged:
//   · running order: the sections Prep → … → Cool-down (lib/coach/today.ts todayLayout), the coach's own order inside;
//   · SUPERSETS: A1/A2 alternate set for set. The player walks one step's sets in a row, so a superset becomes one step
//     per member per round ("A1 Goblet Squat", then "A2 Row", then round 2), no rest between members and the coach's
//     rest after the round (CHANGE_SECONDS still gives the walk between two exercises);
//   · TIMED rows (workSeconds) count themselves down; the KEY SET, the EASIER version, a GATE SWAP and the coach's note
//     are said in the step's note (the "How to set up" sheet), in the route's own words;
//   · HELD items (session.held) are not in `exercises`, so the player never runs them;
//   · the WARM-UP and COOL-DOWN the caller generated (lib/coach/warmup.ts generateWarmup when cooldown.ts
//     showsGeneratedWarmup / todayWarmupKind says FEL's; cooldown.ts generateCooldown when needsAutoCooldown) run as timed
//     steps before the first and after the last item. A coach's own Prep or Cool-down wins: the caller passes none.
//
// `refs` says, for every step, which Today slot its sets log to (the SessionExercise id, and the set the step's set 1 is
// — a superset round's step logs that round's set), so the screen's Set done can open that slot's log row.
//
// Every word is the route's (names, set-ups, cues, the coach's note) or the generator's; nothing is rewritten.
// Pure. Client-safe (lib/coach/today.ts is already Today's client import).
import { KEY_SET_LINE, easierLine, todayLayout, type TodayExercise } from '@/lib/coach/today';
import type { WarmupPlan } from '@/lib/coach/warmup';
import type { CooldownPlan } from '@/lib/coach/cooldown';
import type { Session, Step } from './model';

/** What a step logs to: a Today slot (and the slot's set its set 1 is), or a generated warm-up / cool-down step. */
export type CoachStepRef =
  | { kind: 'exercise'; slot: string; setOffset: number }
  | { kind: 'warmup' | 'cooldown'; id: string };

export interface CoachSession {
  session: Session;
  /** One per step, in order. */
  refs: CoachStepRef[];
  /** The session ends with FEL's generated cool-down (its done tap posts the cool-down route at the finish). */
  cooldown: boolean;
}

export interface CoachTodayLike {
  block: { label: string };
  session: { id: string; label: string; exercises: readonly TodayExercise[] };
}

export interface FromCoachTodayOptions {
  /** SessionExercise id → its loop (lib/library/demo.ts, picked on the server), or null: the still pose, "Demo coming". */
  clips?: Readonly<Record<string, string | null>>;
  /** FEL's warm-up for today, when Today shows FEL's (never with a coach's Prep, never on an off day). */
  warmup?: Pick<WarmupPlan, 'steps'> | null;
  /** FEL's cool-down for today, when needsAutoCooldown says so. */
  cooldown?: Pick<CooldownPlan, 'steps'> | null;
}

/** The step's note: the route's own lines for a gate swap, the coach's note, the key set and the easier version. */
function noteFor(e: TodayExercise): string | undefined {
  const lines = [
    e.protocolGate?.line,
    e.coachNote?.trim() || null,
    e.isKeySet ? KEY_SET_LINE : null,
    e.coaching.easier ? easierLine(e.coaching.easier.name) : null,
  ].filter((x): x is string => !!x);
  return lines.length ? lines.join(' ') : undefined;
}

/** The dose words the player splits into the big number and its qualifier: the coach's reps, then the load. */
function repsFor(e: TodayExercise): string | null {
  const reps = (e.reps ?? '').trim();
  const load = (e.load ?? '').trim();
  if (!reps && !load) return null;
  return load ? `${reps || '1'} @ ${load}` : reps;
}

function exerciseStep(e: TodayExercise, o: FromCoachTodayOptions, label: string | null, sets: number, restSeconds: number): Step {
  const c = e.coaching;
  const note = noteFor(e);
  return {
    exId: e.exerciseId,
    name: label ? `${label} ${e.name}` : e.name,
    sets: Math.max(1, sets),
    reps: repsFor(e),
    workSeconds: typeof e.workSeconds === 'number' && e.workSeconds > 0 ? e.workSeconds : null,
    restSeconds: Math.max(0, restSeconds),
    setup: c.setup.map((s) => s.text).join(' '),
    cue: c.cues[0] ?? null,
    clip: o.clips?.[e.id] ?? null,
    ...(note ? { note } : {}),
  };
}

const generatedStep = (kind: 'warmup' | 'cooldown', s: { id: string; name: string; seconds: number; cue: string; dose: string | null }): Step => ({
  exId: `${kind}:${s.id}`,
  name: s.name,
  sets: 1,
  reps: null,
  workSeconds: Math.max(1, Math.round(s.seconds)),
  restSeconds: 0,
  setup: s.dose ?? '',
  cue: s.cue || null,
  clip: null,
});

export function fromCoachToday(today: CoachTodayLike, o: FromCoachTodayOptions = {}): CoachSession {
  const steps: Step[] = [];
  const refs: CoachStepRef[] = [];
  for (const w of o.warmup?.steps ?? []) { steps.push(generatedStep('warmup', w)); refs.push({ kind: 'warmup', id: w.id }); }
  for (const sec of todayLayout(today.session.exercises)) {
    for (const b of sec.blocks) {
      if (b.kind === 'single') {
        steps.push(exerciseStep(b.item, o, b.label, b.item.sets, b.item.restSeconds));
        refs.push({ kind: 'exercise', slot: b.item.id, setOffset: 0 });
        continue;
      }
      // a superset: one step per member per round, the round's rest after its last member
      const rounds = Math.max(1, ...b.items.map((x) => x.item.sets));
      for (let r = 0; r < rounds; r++) {
        const members = b.items.filter((x) => x.item.sets > r || (r === 0));
        members.forEach((x, k) => {
          const last = k === members.length - 1;
          steps.push(exerciseStep(x.item, o, x.label, 1, last ? x.item.restSeconds : 0));
          refs.push({ kind: 'exercise', slot: x.item.id, setOffset: r });
        });
      }
    }
  }
  const cool = o.cooldown?.steps ?? [];
  for (const s of cool) { steps.push(generatedStep('cooldown', s)); refs.push({ kind: 'cooldown', id: s.id }); }
  return {
    session: { id: today.session.id, title: `${today.block.label} · ${today.session.label}`, steps },
    refs,
    cooldown: cool.length > 0,
  };
}

/** The Today slot and its set index (0-based) a player position logs to, or null (a warm-up or cool-down step). */
export function slotSet(refs: readonly CoachStepRef[], step: number, set: number): { slot: string; index: number } | null {
  const r = refs[step];
  if (!r || r.kind !== 'exercise') return null;
  return { slot: r.slot, index: r.setOffset + Math.max(1, set) - 1 };
}
