// lib/program-ask/kept.ts — EVERY-SCREEN P3 (2026-11-10): build the program the person asked for; when that one cannot
// keep every rule (./rules24.ts), the nearest one that can — five, then ten minutes longer a session; or, when the
// weekly limits cannot fill the length asked (a 90-minute mobility plan, six days a week), five to fifteen minutes
// shorter — and the program says so in plain words. Before this a request the builder could not fit (the rig's grid: 151 of 1,680 twenty-minute
// requests, after the builder's own fixes) was refused outright: the server answered with an error and the person got no
// plan at all. No rule is loosened: every program that leaves here keeps all of them, or none leaves.
//
// Pure.
import type { LibraryExercise } from '@/lib/library/types';
import { buildProgram, type BuildInput } from './build';
import { LONGER_THAN_ASKED, SHORTER_THAN_ASKED } from './copy';
import { MINUTES } from './rules';
import { builderRuleFailures } from './rules24';
import type { BuiltProgram } from './types';

/** Minutes added (then taken off) a session, in the order tried. */
export const LENGTH_STEPS = [5, 10, -5, -10, -15] as const;

/** `longer`: minutes added to each session (negative: taken off), 0 when built as asked. */
export interface Kept { program: BuiltProgram; failures: string[]; longer: number }

export function buildKept(input: BuildInput & { library: readonly LibraryExercise[] }): Kept {
  const jumpsOpen = !!input.jumpsOpen;
  const first = buildProgram(input);
  const failures = builderRuleFailures(first, input.library, { jumpsOpen });
  if (!failures.length) return { program: first, failures, longer: 0 };
  for (const add of LENGTH_STEPS) {
    const minutes = input.request.minutes + add;
    if (minutes > MINUTES.max || minutes < MINUTES.min) continue;
    const p = buildProgram({ ...input, request: { ...input.request, minutes } });
    if (builderRuleFailures(p, input.library, { jumpsOpen }).length) continue;
    p.notes.unshift((add > 0 ? LONGER_THAN_ASKED : SHORTER_THAN_ASKED)(input.request.minutes, minutes));
    return { program: p, failures: [], longer: add };
  }
  return { program: first, failures, longer: 0 };
}
