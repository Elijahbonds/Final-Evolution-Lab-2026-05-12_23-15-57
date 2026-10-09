import { describe, it, expect } from 'vitest';
import {
  rollRivalAttempt, judgeRivalAttempt, simRivalDunk, rivalFlight, DEFAULT_RIVAL_RUNUP,
  type RivalAttempt, type RivalJudgeContext,
} from './DunkRivalSim';
import { DUNK_TRICKS, SLAM_EDGE_EXEC, signatureFor, slamExecution } from './DunkSystem';
import { dunkCard, RIM_CLEAN } from './DunkCard';
import { judgeDunk } from './JudgePanel';
import { rivalNerve, rivalExecution } from './RivalNerve';
import { rivalTricksFor, rivalHitsBeats, rivalSlamOffset } from './RivalPlay';
import { NightMemory, dunkElements } from './DunkOriginality';
import { freshStakes, ATTEMPT_SCALE, ATTEMPTS_PER_DUNK } from './DunkStakes';
import { DUNK_RIVALS } from './DunkRivals';

const T = (id: string) => DUNK_TRICKS.find((t) => t.id === id)!;
/** a deterministic stream */
const seq = (xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };
const ctxOf = (o: Partial<RivalJudgeContext> = {}): RivalJudgeContext => ({
  styleId: 'power', styleTier: 3, hype: 40, crowd01: 0.5, slamHalf: 0.14, runUp: DEFAULT_RIVAL_RUNUP,
  memory: new NightMemory(), dunker: 'rival', usedCombos: new Set(), ...o,
});
const plan = (o: Partial<RivalAttempt> = {}): RivalAttempt => ({ tricks: [T('windmill')], acc: 0.9, early: false, blew: false, onBeat: true, nerveLabel: '', reach: 5, ...o });
const sum = (xs: { score: number }[]) => xs.reduce((a, j) => a + j.score, 0);

describe('the roll is the live rival\'s plan, word for word', () => {
  it('matches the old inline planRivalAttempt for the same random stream', () => {
    const sit = { deficit: -6, isFinalRound: true, attemptsLeft: 2, playerPace: 41 };
    for (const foe of DUNK_RIVALS) {
      for (const xs of [[0.1, 0.5, 0.9, 0.3, 0.2], [0.95, 0.05, 0.6, 0.7, 0.1], [0.4, 0.99, 0.99, 0.1, 0.9]]) {
        const got = rollRivalAttempt(sit, foe, seq(xs));
        // the reference: DunkMode.planRivalAttempt as it was before the move (2026-10-06)
        const r = seq(xs);
        const nerve = rivalNerve(sit), band = rivalExecution(nerve);
        const blew = r() < Math.min(0.85, nerve.blownChance * foe.risk);
        const reach = (nerve.diffMin + r() * (nerve.diffMax - nerve.diffMin)) * foe.reach;
        const exec = band.min + r() * (band.max - band.min);
        const acc = Math.max(0, Math.min(1, (exec - band.min) / Math.max(0.1, band.max - band.min)));
        const tricks = rivalTricksFor(reach, foe.signature, r);
        const early = acc >= SLAM_EDGE_EXEC && r() < 0.4;
        expect(got).toEqual({ tricks, acc, early, blew, onBeat: rivalHitsBeats(acc, blew), nerveLabel: nerve.label, reach });
      }
    }
  });
});

describe('one attempt, judged as finishAttempt judges it', () => {
  it('a make: the card and the panel equal dunkCard + judgeDunk for his plan (the doc\'s acceptance)', () => {
    const c = ctxOf({ runUp: { ...DEFAULT_RIVAL_RUNUP, charge: 1 } });
    const p = plan({ tricks: [T('spin360'), T('windmill')], acc: 0.8, onBeat: true });
    const a = judgeRivalAttempt(p, c);
    expect(a.made).toBe(true);
    const f = rivalFlight(p, c);
    const half = c.slamHalf * f.slamWindowScale;
    const exec01 = slamExecution(rivalSlamOffset(0.8, false, half), 0, half, 1);
    const sig = signatureFor([], a.tricks.map((t) => t.id));
    const fresh = new NightMemory().read(a.elements, 'rival');
    const perfectish = Math.abs(rivalSlamOffset(0.8, false, half)) * 1000 <= 45;
    const card = dunkCard({
      trickDifficulty: f.attempt.difficulty - 3, runwayDifficulty: sig?.nod ?? 0, propBonus: 0,
      charge: 1, launchSpeed01: 1, styleTier: 3, styleTaps: 0, hype: 40, hang: false, repeat: false, execution01: exec01,
      chainTricks: a.tricks.length - 1, beatExec: Math.min(1.2, a.tricks.length * 0.4), flowStyle: (perfectish ? 1 : 0) + fresh.style,
    });
    expect({ d: a.difficulty, e: a.execution, s: a.style }).toEqual({ d: card.difficulty, e: card.execution, s: card.style });
    expect(a.scores).toEqual(judgeDunk(card.difficulty, card.execution, card.style, 0.5));
  });
  it('the execution read off his slam is the execution he rolled (late side within 2 %, early side exact)', () => {
    for (const acc of [0.3, 0.5, 0.72, 0.85, 1]) {
      expect(judgeRivalAttempt(plan({ acc, early: false }), ctxOf()).execution01).toBeGreaterThanOrEqual(acc - 1e-9);
      expect(judgeRivalAttempt(plan({ acc, early: false }), ctxOf()).execution01).toBeLessThanOrEqual(acc + 0.02);
    }
    for (const acc of [0.72, 0.85, 1]) expect(judgeRivalAttempt(plan({ acc, early: true }), ctxOf()).execution01).toBeCloseTo(acc, 9);
  });
  it('a blown plan never presses (a miss), and a slam under RIM_CLEAN hits iron (a miss) — the live rival\'s two misses', () => {
    expect(judgeRivalAttempt(plan({ blew: true, acc: 1 }), ctxOf()).made).toBe(false);
    expect(judgeRivalAttempt(plan({ acc: RIM_CLEAN - 0.05, onBeat: false }), ctxOf()).made).toBe(false);
    expect(judgeRivalAttempt(plan({ acc: RIM_CLEAN + 0.05, onBeat: false }), ctxOf()).made).toBe(true);
  });
  it('a miss is judged on what the panel saw: the style and the tricks thrown, ×0.6, no execution, the neutral room', () => {
    const p = plan({ blew: true, tricks: [T('eastbay')] });
    const a = judgeRivalAttempt(p, ctxOf({ styleTier: 5.5 }));
    expect(a.difficulty).toBeCloseTo((5.5 + T('eastbay').difficulty) * 0.6, 9);
    expect(a.style).toBeCloseTo(5.5 * 0.22, 9);
    expect(a.scores).toEqual(judgeDunk(a.difficulty, 0, a.style));
  });
  it('the run-up buys the air: a walk-up flight holds one trick of a planned chain', () => {
    const chain = plan({ tricks: [T('spin360'), T('windmill')] });
    const loaded = { ...DEFAULT_RIVAL_RUNUP, charge: 1 };
    expect(judgeRivalAttempt(chain, ctxOf({ runUp: loaded })).tricks).toHaveLength(2);
    expect(judgeRivalAttempt(chain, ctxOf({ runUp: DEFAULT_RIVAL_RUNUP, styleTier: 5.5 })).tricks).toHaveLength(2);   // FLASHY buys air too
    const walk = { ...DEFAULT_RIVAL_RUNUP, launchSpeed01: 0, charge: 0 };
    expect(judgeRivalAttempt(chain, ctxOf({ runUp: walk })).tricks).toHaveLength(1);
  });
  it('the tricks\' window tax narrows the slam: the same leak is ON TIME in a taxed window (a PERFECT FLIGHT) and LATE in the base one', () => {
    const c = ctxOf({ runUp: { ...DEFAULT_RIVAL_RUNUP, charge: 1 }, slamHalf: 0.14 });
    const two = plan({ tricks: [T('spin360'), T('windmill')], acc: 0.6, onBeat: true });
    expect(judgeRivalAttempt(two, c).perfect).toBe(true);                 // 0.98 × 0.4 × 0.14 × 0.7055 ≈ 39 ms — inside ±45
    expect(judgeRivalAttempt(two, ctxOf({ runUp: c.runUp, slamHalf: 0.2 })).perfect).toBe(false);   // a wider base, the same leak: late
  });
  it('off the beat pays no beat execution; on the beat pays', () => {
    const on = judgeRivalAttempt(plan({ onBeat: true, acc: 0.8 }), ctxOf());
    const off = judgeRivalAttempt(plan({ onBeat: false, acc: 0.8 }), ctxOf());
    expect(on.execution - off.execution).toBeCloseTo(0.4, 9);
  });
});

describe('his whole dunk', () => {
  it('a skip mid-attempt judges the plan he is ON — a make never rolls again', () => {
    let rolls = 0;
    const r = simRivalDunk(plan({ acc: 0.9 }), freshStakes(), () => { rolls++; return plan({ blew: true }); }, ctxOf());
    expect(rolls).toBe(0);
    expect(r.made).toBe(true);
    expect(r.attempts).toBe(1);
    expect(r.total).toBe(Math.round(sum(r.scores) * ATTEMPT_SCALE[0]));
  });
  it('a miss is retried with a fresh roll while the stakes allow; the make on the third try is scaled as the third', () => {
    let rolls = 0;
    const r = simRivalDunk(plan({ blew: true }), freshStakes(), () => { rolls++; return rolls < 2 ? plan({ blew: true }) : plan({ acc: 0.9 }); }, ctxOf());
    expect(rolls).toBe(2);
    expect(r.made).toBe(true);
    expect(r.attempts).toBe(3);
    expect(r.total).toBe(Math.round(sum(r.scores) * ATTEMPT_SCALE[2]));
  });
  it('three misses: the last is judged, the dunk is over, and the loop cannot run on', () => {
    let rolls = 0;
    const r = simRivalDunk(null, freshStakes(), () => { rolls++; return plan({ blew: true }); }, ctxOf());
    expect(r.made).toBe(false);
    expect(r.attempts).toBe(ATTEMPTS_PER_DUNK);
    expect(rolls).toBe(ATTEMPTS_PER_DUNK);
    expect(r.total).toBe(Math.round(sum(r.scores) * ATTEMPT_SCALE[2]));
  });
  it('the attempts already spent count: a skip after his first miss has two left', () => {
    let rolls = 0;
    const spent = { ...freshStakes(), attemptsUsed: 1 };
    const r = simRivalDunk(null, spent, () => { rolls++; return plan({ blew: true }); }, ctxOf());
    expect(rolls).toBe(2);
    expect(r.attempts).toBe(3);
  });
  it('a make is remembered by the night and by his repeat memory; the same dunk again is SEEN IT', () => {
    const c = ctxOf();
    const first = simRivalDunk(plan(), freshStakes(), () => plan(), c);
    expect(first.seenIt).toBe(false);
    expect(c.memory.firstBy('trick:windmill')).toBe('rival');
    const again = simRivalDunk(plan(), freshStakes(), () => plan(), c);
    expect(again.seenIt).toBe(true);
    expect(again.difficulty).toBeLessThan(first.difficulty);
  });
  it('a miss shows the night nothing', () => {
    const c = ctxOf();
    simRivalDunk(plan({ blew: true }), { ...freshStakes(), attemptsUsed: 2 }, () => plan({ blew: true }), c);
    expect(c.memory.size).toBe(0);
    expect(c.usedCombos.size).toBe(0);
  });
  it('a dunk the PLAYER showed first is a copy for him, read by his own id', () => {
    const c = ctxOf({ dunker: 'ty' });
    c.memory.show(dunkElements({ tricks: [{ id: 'windmill', label: 'WINDMILL' }], runway: [], prop: null, foot: 'one', range: 'IN THE PAINT', side: 'HEAD-ON', hang: false }), 'player');
    const r = simRivalDunk(plan(), freshStakes(), () => plan(), c);
    expect(r.fresh?.copied.map((e) => e.key)).toContain('trick:windmill');
    expect(r.seenIt).toBe(true);
  });
  it('the name is his signature dunk, or the tricks, or nothing for a plain one', () => {
    expect(simRivalDunk(plan({ tricks: [] }), freshStakes(), () => plan(), ctxOf()).name).toBe('');
    expect(simRivalDunk(plan({ tricks: [T('tomahawk')] }), freshStakes(), () => plan(), ctxOf()).name).toBe('TOMAHAWK');
  });
});
