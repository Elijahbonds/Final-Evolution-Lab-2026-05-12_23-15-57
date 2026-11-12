// SIGNATURE-PROGRAMS (2026-10-25): the plan and its adaptation — a retest that reads up advances a phase early, one that
// reads down (or low readiness, or a pain flag) repeats a week, a pain flag NEVER advances, and every plan stays 8–12 weeks.
import { describe, expect, it } from 'vitest';
import type { PainDecision } from '@/lib/health/painRule';
import { decide, painHolds, isHarder, readinessRead, type Reads } from './adapt';
import { SIGNATURE_PROGRAMS, signatureProgram } from './content';
import { MAX_PROGRAM_WEEKS, MIN_PROGRAM_WEEKS, decisionOptions, expandPlan, positionIn, type PlanWeek } from './plan';
import type { PlanEvent, ReadResult, SignatureProgram } from './types';

const VJ = signatureProgram('vertical-jump')!;
const ev = (w: PlanWeek, kind: PlanEvent['kind']): PlanEvent => ({ afterWeek: w.n, phaseId: w.phaseId, kind, line: '', reads: {}, at: '' });
const weekAt = (p: SignatureProgram, n: number, events: PlanEvent[] = []) => expandPlan(p, { youth: false, events }).find((w) => w.n === n)!;
const run = (p: SignatureProgram, week: PlanWeek, reads: Reads, o: { pain?: PainDecision | null; hardStopped?: boolean; events?: PlanEvent[] } = {}) =>
  decide({ program: p, events: o.events ?? [], week, reads, painDecision: o.pain ?? null, hardStopped: o.hardStopped ?? false, nextLabel: 'Next phase' });

describe('the plan', () => {
  it('runs the coach templates\' wave: the build week adds a set to the key lift; Prep and Cool-down stay as written at Idle', () => {
    const [w1, w2] = expandPlan(VJ, { youth: false });
    const key1 = w1.sessions[0].items.find((i) => i.isKeySet)!;
    const key2 = w2.sessions[0].items.find((i) => i.isKeySet)!;
    expect(key2.sets).toBe(key1.sets + 1);
    expect(key1.effortBand).toBe('drive');
    for (const i of w2.sessions[0].items.filter((x) => x.section === 'prep' || x.section === 'cooldown')) expect(i.effortBand).toBe('idle');
  });

  it('under youth rules runs the youth wave: nothing past Drive, no Surge', () => {
    for (const p of SIGNATURE_PROGRAMS) for (const w of expandPlan(p, { youth: true, cap: false })) for (const s of w.sessions) for (const i of s.items) {
      expect(['idle', 'cruise', 'drive']).toContain(i.effortBand);
    }
  });

  it('an advance at an early checkpoint skips the rest of the phase; a repeat at an end checkpoint runs the last week again', () => {
    const build2 = weekAt(VJ, 4); // base 1–2, build week 2 (the easier week) is the early checkpoint
    expect(build2.checkpoint).toBe('early');
    const advanced = expandPlan(VJ, { youth: false, events: [ev(build2, 'advance')] });
    expect(advanced.length).toBe(8);
    expect(advanced[4].phaseId).toBe('power');
    const base2 = weekAt(VJ, 2);
    expect(base2.checkpoint).toBe('end');
    const repeated = expandPlan(VJ, { youth: false, events: [ev(base2, 'repeat')] });
    expect(repeated.length).toBe(11);
    expect(repeated[2]).toMatchObject({ phaseId: 'base', repeat: true, checkpoint: 'end' });
    expect(repeated[3].phaseId).toBe('build');
  });

  it('never offers a decision that takes the plan outside 8–12 weeks, whatever the retests read, in any order', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (const p of SIGNATURE_PROGRAMS) {
      for (let trial = 0; trial < 60; trial++) {
        const events: PlanEvent[] = [];
        for (let guard = 0; guard < 30; guard++) {
          const weeks = expandPlan(p, { youth: false, events, cap: false });
          const next = weeks.find((w) => w.checkpoint && !events.some((e) => e.afterWeek === w.n));
          if (!next) break;
          const opts = decisionOptions(p, events, next);
          events.push(ev(next, opts[Math.floor(rnd() * opts.length)]));
        }
        const total = expandPlan(p, { youth: false, events, cap: false }).length;
        expect(total, `${p.id} ${events.map((e) => e.kind).join(',')}`).toBeGreaterThanOrEqual(MIN_PROGRAM_WEEKS);
        expect(total).toBeLessThanOrEqual(MAX_PROGRAM_WEEKS);
      }
    }
  });

  it('knows the next session and a checkpoint waiting for its decision', () => {
    const weeks = expandPlan(VJ, { youth: false });
    const done = { 'w1:A': 'x', 'w1:B': 'x', 'w1:C': 'x', 'w2:A': 'x', 'w2:B': 'x', 'w2:C': 'x' };
    const pos = positionIn(weeks, done, []);
    expect(pos.session?.id).toBe('w3:A');
    expect(pos.pendingCheckpoint?.n).toBe(2);
    expect(positionIn(weeks, done, [ev(weeks[1], 'continue')]).pendingCheckpoint).toBeNull();
  });
});

describe('the checkpoint decision', () => {
  const early = weekAt(VJ, 4); // build: exits on jump and form
  const end = weekAt(VJ, 2);   // base: exits on landing and jump

  it('retest up → advance a phase early', () => {
    const d = run(VJ, early, { jump: 'up', form: 'up' });
    expect(d.kind).toBe('advance');
    expect(d.line).toMatch(/move on early/);
    expect(expandPlan(VJ, { youth: false, events: [{ ...d, at: '' }] }).length).toBe(8);
  });

  it('a retest that only holds, or has no number, keeps the plan on schedule', () => {
    expect(run(VJ, early, { jump: 'up', form: 'same' }).kind).toBe('continue');
    const none = run(VJ, early, {});
    expect(none.kind).toBe('continue');
    expect(none.line).toMatch(/No saved .* numbers yet/);
  });

  it('retest down → repeat the block at the phase end (continue at an early checkpoint)', () => {
    expect(run(VJ, end, { jump: 'down', landing: 'pass' }).kind).toBe('repeat');
    expect(run(VJ, early, { jump: 'down', form: 'up' }).kind).toBe('continue');
  });

  it('low readiness (two Low days this week) → ease: the week repeats, never an advance', () => {
    expect(readinessRead(2, 2)).toBe('down');
    expect(readinessRead(1, 2)).toBe('same');
    expect(readinessRead(null, 2)).toBe('none');
    expect(run(VJ, end, { jump: 'up', landing: 'pass', readiness: 'down' }).kind).toBe('repeat');
    expect(run(VJ, early, { jump: 'up', form: 'up', readiness: 'down' }).kind).toBe('continue');
  });

  it('NEVER harder on a pain flag: no advance under any pain decision but continue, whatever the retests read', () => {
    const decisions: PainDecision[] = ['easier_variation', 'step_down_flag_coach', 'stop_see_clinician', 'stop_tell_adult'];
    const values: ReadResult[] = ['up', 'pass', 'same', 'down', 'none', 'not_yet'];
    let checked = 0;
    for (const p of SIGNATURE_PROGRAMS) {
      for (const w of expandPlan(p, { youth: false, cap: false }).filter((x) => x.checkpoint)) {
        for (const pain of decisions) for (const a of values) for (const b of values) {
          const d = run(p, w, { jump: a, form: b, landing: a, shot: b, readiness: b }, { pain });
          expect(isHarder(d.kind), `${p.id} week ${w.n} ${pain}`).toBe(false);
          expect(painHolds(pain)).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
    const d = run(VJ, end, { jump: 'up', landing: 'pass' }, { pain: 'step_down_flag_coach' });
    expect(d.kind).toBe('repeat');
    expect(d.line).toMatch(/pain check-in hasn't settled/);
  });

  it('a standing red flag moves nothing', () => {
    const d = run(VJ, early, { jump: 'up', form: 'up' }, { hardStopped: true });
    expect(d.kind).toBe('continue');
    expect(d.line).toMatch(/stop training features/);
  });

  it('with no room left the plan moves on rather than run past 12 weeks', () => {
    const base2 = weekAt(VJ, 2);
    const once = [ev(base2, 'repeat')];
    const again = weekAt(VJ, 3, once);
    const twice = [...once, ev(again, 'repeat')];
    const third = weekAt(VJ, 4, twice);
    expect(third.phaseId).toBe('base');
    const d = run(VJ, third, { jump: 'down', landing: 'pass' }, { events: twice });
    expect(d.kind).toBe('continue');
    expect(d.line).toMatch(/longest/);
  });
});
