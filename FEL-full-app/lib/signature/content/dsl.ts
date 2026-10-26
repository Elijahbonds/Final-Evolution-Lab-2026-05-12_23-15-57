// lib/signature/content/dsl.ts — SIGNATURE-PROGRAMS (2026-10-25): the few helpers the four programs are written with,
// so each item reads as one line: library id, section, sets, dose, rest. Pure.
import type { ExitRule, ItemSection, ProgramItem, SourceRef } from '../types';

/**
 * One item. `dose` is a counted reps text ("8", "6 each side", "5 contacts") or a number of seconds (a timed set);
 * a timed set's per-side tail goes in `extra.reps` ("each side").
 */
export function it(ex: string, section: ItemSection, sets: number, dose: string | number, rest: number, extra: Partial<Omit<ProgramItem, 'ex' | 'section' | 'sets' | 'rest'>> = {}): ProgramItem {
  return typeof dose === 'number'
    ? { ex, section, sets, secs: dose, rest, ...extra }
    : { ex, section, sets, reps: dose, rest, ...extra };
}

/** A jump or a landing: `contacts` per set (every foot contact counts) and the calm step-down served when jumps are held. */
export function jump(ex: string, sets: number, reps: string, contacts: number, rest: number, down: string, extra: Partial<ProgramItem> = {}): ProgramItem {
  return { ex, section: 'prime', sets, reps, rest, contacts, down, cues: ['quiet-landing'], ...extra };
}

export const blueprint = (where: string): SourceRef => ({ book: 'blueprint', where });
export const playbook = (where: string): SourceRef => ({ book: 'playbook', where });
export const dunk = (where: string): SourceRef => ({ book: 'dunk', where });
export const gap = (where: string): SourceRef => ({ book: 'gap', where });

export const exit = (reads: ExitRule['reads'], o: Partial<Omit<ExitRule, 'reads'>> = {}): ExitRule => ({
  reads, earlyAfterWeek: o.earlyAfterWeek ?? null, maxRepeats: o.maxRepeats ?? 1, repeatWeeks: o.repeatWeeks ?? 1,
});

// ── the owner's recurring pieces ──────────────────────────────────────────────────────────────────────────────────

/** Breath and stack (DUNK-PROGRAM §6.2; Blueprint phase 1 ch3 "Diaphragmatic Breath"): the 90/90 position of the ladder. */
export const breathStack = (): ProgramItem => it('90-90-breathing', 'prep', 1, 120, 0);
/** The Neural Flush that ends every session (DUNK-PROGRAM §6.1 block 7; Blueprint phase 5 ch19 "Neural Flush"). */
export const neuralFlush = (): ProgramItem => it('crocodile-breathing', 'cooldown', 1, 120, 0);
export const longExhale = (): ProgramItem => it('seated-long-exhale-breathing', 'cooldown', 1, 120, 0);
export const legsUpFlush = (): ProgramItem => it('legs-up-the-wall-breathing', 'cooldown', 1, 120, 0);
/** Knee-to-wall rocks (DUNK-PROGRAM §7.1, the heels / ankle-range row; Blueprint phase 2 ch7 ankle range). */
export const ankleRocks = (): ProgramItem => it('knee-to-wall-ankle-rock', 'prep', 2, '10 each side', 15);
/** The T-spine flow's open book (DUNK-PROGRAM §8.3; Playbook ch4 "Unlocking the Joints"). */
export const openBook = (): ProgramItem => it('open-book', 'prep', 2, '6 each side', 15);
