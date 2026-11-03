// lib/session-player/fromProgram.ts — PROGRAM-ASK (2026-11-02): the third adapter. One day of an asked-for program
// (lib/program-ask build.ts ProgramDay: the gates, the youth rules and the dose already applied by the builder) → the
// player's Session, so "Start today" plays it like a signature or a coach's session.
//
// Modelled on plat-p06's fromCoachToday (lane/plat-p06-athlete-loop), not imported from it:
//   · the WARM-UP and COOL-DOWN the builder generated (lib/coach/warmup.ts, lib/coach/cooldown.ts) run as timed steps
//     before the first block and after the last;
//   · a PAIR (A1/A2) or a CIRCUIT alternates set for set: one step per member per round, no rest between members (the
//     player's CHANGE_SECONDS gives the walk), the block's rest after the round's last member;
//   · a single item is one step with its sets;
//   · the step's note carries the week's own line (a tempo, a harder version) and the "too easy?" line; the band setup
//     goes first in the set-up sheet.
// Every word is the builder's or the library entry's; nothing is rewritten. Imports types only from lib/program-ask.
//
// Pure. Client-safe.
import type { ProgramDay, ProgramItem, TimedStep } from '@/lib/program-ask/types';
import type { Session, Step } from './model';

const timed = (kind: 'warmup' | 'cooldown', s: TimedStep): Step => ({
  exId: `${kind}:${s.id}`, name: s.name, sets: 1, reps: null, workSeconds: Math.max(1, Math.round(s.seconds)), restSeconds: 0,
  setup: s.dose ?? '', cue: s.cue, clip: null,
});

function itemStep(i: ProgramItem, sets: number, rest: number, clips: Readonly<Record<string, string | null>>): Step {
  const note = [i.note, i.harder].filter((x): x is string => !!x).join(' ');
  return {
    exId: i.exId,
    name: `${i.label} ${i.name}`,
    sets: Math.max(1, sets),
    reps: i.reps,
    workSeconds: typeof i.workSeconds === 'number' && i.workSeconds > 0 ? i.workSeconds : null,
    restSeconds: Math.max(0, rest),
    setup: [i.bandSetup, i.setup].filter(Boolean).join(' '),
    cue: i.cue,
    clip: clips[i.exId] ?? null,
    ...(note ? { note } : {}),
  };
}

export function fromProgram(day: ProgramDay, o: { title: string; clips?: Readonly<Record<string, string | null>> }): Session {
  const clips = o.clips ?? {};
  const steps: Step[] = day.warmup.map((s) => timed('warmup', s));
  for (const b of day.blocks) {
    if (b.items.length === 1) { const i = b.items[0]; steps.push(itemStep(i, i.sets, i.restSeconds, clips)); continue; }
    const rounds = Math.max(1, ...b.items.map((i) => i.sets));
    const roundRest = b.items[b.items.length - 1].restSeconds;
    for (let r = 0; r < rounds; r++) {
      const live = b.items.filter((i) => i.sets > r);
      live.forEach((i, k) => steps.push(itemStep(i, 1, k === live.length - 1 ? roundRest : 0, clips)));
    }
  }
  steps.push(...day.cooldown.map((s) => timed('cooldown', s)));
  return { id: day.id, title: o.title, steps };
}
