// lib/program-ask/check.ts — PROGRAM-ASK (2026-11-02): every rule a built program must keep, as one function. The tests
// run it over a matrix of asks (program-ask.test.ts), and the server runs it on every program before it leaves (a program
// with a problem is never shown: the route answers 500 and logs it), so a rule is enforced in code, not in review.
//
// Pure.
import { MAX_EFFORT_CUE } from '@/lib/coach/taxonomy';
import { MAX_WEEKLY_SET_GROWTH } from '@/lib/coach/templates/waves';
import type { LibraryExercise } from '@/lib/library/types';
import { isDepthDrop } from '@/lib/workout/plan-generator';
import { VOLUME_SHORT } from './copy';
import { FULL_DAY_REQUIRED, LIGHTER_MAX_SHARE, MAX_SETS, PULL_PUSH_RATIO, TIME_TOLERANCE, WEEK_REQUIRED } from './rules';
import { eligible, fitsKit, isImpact } from './slots';
import { daySeconds, timeWindow } from './time';
import type { BuiltProgram, ProgramWeek, SlotId } from './types';

export interface CheckOptions { jumpsOpen: boolean }

const working = (w: ProgramWeek) => w.days.flatMap((d) => d.blocks.filter((b) => b.kind !== 'filler').flatMap((b) => b.items));
/**
 * A week's work: sets × reps (a timed set counts its seconds ÷ 3, about a rep's worth). FEL's measure of "lighter": the
 * lighter week's work is at most LIGHTER_MAX_SHARE of the week before, and every set in it is at Cruise. (The coach
 * templates measure sets alone; a short plan already at one set an item gets lighter by reps, so this counts both.)
 */
export const weekWork = (w: ProgramWeek): number => working(w).reduce((a, i) => a + i.sets * (i.workSeconds ? Math.round(i.workSeconds / 3) : Number(/\d+/.exec(i.reps ?? '')?.[0] ?? 8)), 0);
/** Strength sets only (what the wave's growth cap is about: jumps and speed drills come in on their own week rules). */
export const strengthSets = (w: ProgramWeek) => working(w).filter((i) => !['power', 'speed', 'cond', 'mobility', 'calf'].includes(i.slot)).reduce((a, i) => a + i.sets, 0);

/** A fingerprint of a week's prescription: if two weeks share it, nothing changed between them. */
export const weekSignature = (w: ProgramWeek): string =>
  working(w).map((i) => `${i.key}:${i.exId}:${i.sets}:${i.reps ?? ''}:${i.workSeconds ?? ''}:${i.tempo ?? ''}:${i.effort}:${i.restSeconds}`).join('|');

export function programProblems(p: BuiltProgram, library: readonly LibraryExercise[], o: CheckOptions): string[] {
  const out: string[] = [];
  const r = p.request;
  const byId = new Map(library.map((e) => [e.id, e]));
  const jumpsOpen = r.age === 'adult' && o.jumpsOpen;
  const el = { owned: r.equipment, level: r.level, age: r.age, jumpsOpen, lowLoad: r.lowLoad };
  const levelUp = { ...el, level: r.level === 'beginner' && r.age !== 'child' ? 'intermediate' as const : r.level === 'intermediate' ? 'advanced' as const : r.level };
  const win = timeWindow(r.minutes, TIME_TOLERANCE);

  for (const w of p.weeks) {
    for (const d of w.days) {
      const where = `week ${w.n} ${d.id}`;
      if (!d.warmup.length) out.push(`${where}: no warm-up`);
      if (!d.cooldown.length) out.push(`${where}: no cool-down`);
      const secs = daySeconds(d);
      if (secs < win[0] || secs > win[1]) out.push(`${where}: ${Math.round(secs / 60)} min is outside ${r.minutes} ± 10%`);
      for (const b of d.blocks) for (const i of b.items) {
        const e = byId.get(i.exId);
        if (!e) { out.push(`${where}: ${i.exId} is not a library entry`); continue; }
        if (e.name !== i.name) out.push(`${where}: ${i.exId} is named ${i.name}, the library says ${e.name}`);
        if (e.review.status === 'rejected') out.push(`${where}: ${e.name} is rejected`);
        if (!fitsKit(e, r.equipment)) out.push(`${where}: ${e.name} needs ${e.equipment.join(', ')}`);
        if (!eligible(e, w.block > 1 || i.harderStart ? levelUp : el)) out.push(`${where}: ${e.name} is not allowed for this person`);
        if (!i.effortWords) out.push(`${where}: ${e.name} has no effort word`);
        if (b.kind !== 'filler' && !['speed', 'power', 'mobility', 'cond'].includes(i.slot) && (!i.harder || !i.easier)) out.push(`${where}: ${e.name} has no too-easy / too-hard line`);
        if ((e.equipment.includes('band') || e.equipment.includes('mini-band')) && !i.bandSetup) out.push(`${where}: ${e.name} has no band setup`);
        if (isDepthDrop(e)) out.push(`${where}: a depth drop`);
        if (isImpact(e)) {
          if (!jumpsOpen) out.push(`${where}: jump work (${e.name}) with the gate closed`);
          if (w.weekInBlock === 1 || w.lighter) out.push(`${where}: jump work (${e.name}) in a block's first or lighter week`);
        }
        if (r.age !== 'adult') {
          if (!e.youthOk) out.push(`${where}: ${e.name} is adults only`);
          if (i.cue && MAX_EFFORT_CUE.test(i.cue)) out.push(`${where}: a max-effort cue for youth (${i.cue})`);
          if (i.effort === 'surge' || (i.effort as string) === 'full') out.push(`${where}: ${i.effort} effort for youth`);
          if (i.contacts) out.push(`${where}: jump contacts for youth`);
        }
        if (r.age === 'child' && i.effort !== 'cruise' && i.effort !== 'idle') out.push(`${where}: ${i.effort} effort under 13`);
        if (i.sets > MAX_SETS[r.age] && b.kind !== 'filler') out.push(`${where}: ${i.sets} sets of ${e.name}`);
        if ((i.effort as string) === 'full') out.push(`${where}: full throttle`);
      }
      // a full-body day covers every job
      if (d.focus === 'full') {
        const slots = new Set<SlotId>(d.blocks.flatMap((b) => b.items.map((i) => i.slot)));
        for (const req of FULL_DAY_REQUIRED) {
          const ok = typeof req === 'string' ? slots.has(req) : req.some((x) => slots.has(x));
          if (!ok && !standIn(p, typeof req === 'string' ? req : req[0])) out.push(`${where}: full-body day without ${typeof req === 'string' ? req : req.join(' or ')}`);
        }
      }
    }
    // the week covers every job, whatever the split
    const slots = new Set<SlotId>(w.days.flatMap((d) => d.blocks.flatMap((b) => b.items.map((i) => i.slot))));
    for (const req of [...WEEK_REQUIRED, ['vpush', 'vpull'] as SlotId[]]) {
      const ok = typeof req === 'string' ? slots.has(req) : req.some((x) => slots.has(x));
      if (!ok && !standIn(p, typeof req === 'string' ? req : req[0])) out.push(`week ${w.n}: no ${typeof req === 'string' ? req : req.join(' or ')}`);
    }
  }

  // weekly volume in range on the building weeks, or the program says why not
  for (const v of p.volume) {
    p.weeks.forEach((w, k) => {
      if (w.lighter) return;
      const n = v.perWeek[k];
      if (n > v.range[1]) out.push(`week ${w.n}: ${v.group} ${n} sets is over ${v.range[1]}`);
      if (n < v.range[0] && !p.notes.some((x) => x === VOLUME_SHORT(areaWord(v.group), Math.min(...v.perWeek.filter((_, j) => !p.weeks[j].lighter)), v.range[0]))) {
        out.push(`week ${w.n}: ${v.group} ${n} sets is under ${v.range[0]} and the program does not say so`);
      }
    });
  }
  // pull at least push, and not lopsided the other way
  const pull = p.volume.find((v) => v.group === 'pull')!;
  const push = p.volume.find((v) => v.group === 'push')!;
  p.weeks.forEach((w, k) => {
    if (w.lighter || !push.perWeek[k]) return;
    const ratio = pull.perWeek[k] / push.perWeek[k];
    if (ratio < PULL_PUSH_RATIO[0] - 1e-9 || ratio > PULL_PUSH_RATIO[1] + 1e-9) out.push(`week ${w.n}: pull/push ${ratio.toFixed(2)} outside ${PULL_PUSH_RATIO.join('–')}`);
  });

  // progression: every week differs from the one before; each block ends lighter, with a checkpoint
  p.weeks.forEach((w, k) => {
    if (k === 0) return;
    const prev = p.weeks[k - 1];
    if (weekSignature(w) === weekSignature(prev)) out.push(`week ${w.n} is the same as week ${prev.n}`);
    if (w.block === prev.block && !w.lighter && strengthSets(w) > strengthSets(prev) * (1 + MAX_WEEKLY_SET_GROWTH) + 1e-9) out.push(`week ${w.n}: sets grew more than ${MAX_WEEKLY_SET_GROWTH * 100}%`);
    if (w.lighter && weekWork(w) > weekWork(prev) * LIGHTER_MAX_SHARE + 1e-9) out.push(`week ${w.n}: the lighter week is not lighter (${weekWork(w)} vs ${weekWork(prev)})`);
    if (w.lighter && working(w).some((i) => i.effort !== 'cruise' && i.effort !== 'idle')) out.push(`week ${w.n}: the lighter week has hard sets`);
  });
  const blocks = [...new Set(p.weeks.map((w) => w.block))];
  for (const b of blocks) {
    const ws = p.weeks.filter((w) => w.block === b);
    const last = ws[ws.length - 1];
    if (!last.lighter || !last.checkpoint) out.push(`block ${b} does not end with a lighter week and a checkpoint`);
  }
  return out;
}

const areaWord = (g: string) => (g === 'knee' ? 'the legs' : g === 'hip' ? 'the hips' : g === 'push' ? 'pushing' : g === 'pull' ? 'pulling' : 'the trunk');

/** The program said in plain words that a stand-in does this job (or that the kit has nothing to pull against). */
function standIn(p: BuiltProgram, slot: SlotId): boolean {
  const words: Partial<Record<SlotId, RegExp>> = { vpull: /pulldown|rows and pulldowns/, hpull: /\brow\b|rows and pulldowns/, vpush: /overhead press/, hpush: /\bpush\b/ };
  const re = words[slot];
  return !!re && p.notes.some((n) => re.test(n));
}
