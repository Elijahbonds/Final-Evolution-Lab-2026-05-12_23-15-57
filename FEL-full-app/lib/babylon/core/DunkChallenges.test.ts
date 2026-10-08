import { describe, it, expect } from 'vitest';
import {
  DUNK_CHALLENGES, challengeById, nextChallenge, checkChallenge, challengeLine, challengeChip, challengeCard, type ChallengeFacts,
} from './DunkChallenges';
import { DunkFlight, DUNK_TRICKS, SPIN_720, signatureFor } from './DunkSystem';
import { approachBonus } from './DunkApproach';
import { launchProfile } from './DunkParkour';
import { BEAT_EXEC_EACH, BEAT_EXEC_MAX, PERFECT_FLIGHT_STYLE } from './DunkBeats';

const T = (id: string) => (id === 'spin720' ? SPIN_720 : DUNK_TRICKS.find((t) => t.id === id)!);
const facts = (o: Partial<ChallengeFacts> = {}): ChallengeFacts => ({
  made: true, tricks: [], prop: 'none', range: 'IN THE PAINT', foot: 'one', side: 'HEAD-ON', perfect: false, onBeat: 0, total: 40, ...o,
});

/** A practice dunk's challenge card, built the way the mode builds it (flight.launch → the tricks → dunkCard inputs). */
function scenario(o: { tricks: string[]; tier?: number; dist: number; angle?: number; foot: 'one' | 'two'; prop: number; exec: number; onBeat: number; perfect?: boolean; charge?: number }): number {
  const tier = o.tier ?? 3, charge = o.charge ?? 0.5, speed = 1;
  const ap = approachBonus(o.angle ?? 0, o.foot, o.dist).difficulty + launchProfile(o.foot, false).difficulty;
  const f = new DunkFlight();
  f.launch(Math.min(1, charge * 0.5 + speed * 0.5), tier, ap);
  for (const t of o.tricks) f.take(T(t));
  const sig = signatureFor([], f.attempt.tricks.map((t) => t.id));
  return challengeCard({
    trickDifficulty: f.attempt.difficulty - tier, runwayDifficulty: sig?.nod ?? 0, propBonus: o.prop, charge, launchSpeed01: speed,
    styleTier: tier, styleTaps: 0, hang: false, execution01: o.exec, chainTricks: Math.max(0, f.attempt.tricks.length - 1),
    beatExec: Math.min(BEAT_EXEC_MAX, o.onBeat * BEAT_EXEC_EACH), flowStyle: o.perfect ? PERFECT_FLIGHT_STYLE : 0,
  }).total;
}

describe('the challenge table', () => {
  it('six original set pieces with generic names, unique ids, and a target on the 30–50 card', () => {
    expect(DUNK_CHALLENGES.length).toBeGreaterThanOrEqual(4);
    expect(new Set(DUNK_CHALLENGES.map((c) => c.id)).size).toBe(DUNK_CHALLENGES.length);
    for (const c of DUNK_CHALLENGES) {
      expect(c.target).toBeGreaterThanOrEqual(30); expect(c.target).toBeLessThanOrEqual(50);
      expect(c.name).toMatch(/^[A-Z0-9 ']+$/);
    }
    // the owner's four examples are on it
    for (const id of ['stripe', 'overthree', 'bounce720', 'perfectprop']) expect(challengeById(id)).not.toBeNull();
  });
  it('L1 cycles none → each → none', () => {
    let c = nextChallenge(null);
    const seen: string[] = [];
    while (c) { seen.push(c.id); c = nextChallenge(c.id); }
    expect(seen).toEqual(DUNK_CHALLENGES.map((x) => x.id));
    expect(nextChallenge('nope')?.id).toBe(DUNK_CHALLENGES[0].id);
  });
});

describe('the set pieces', () => {
  it('FROM THE STRIPE needs the stripe take-off', () => {
    const c = challengeById('stripe')!;
    expect(checkChallenge(c, facts({ range: 'FROM THE ELBOW' })).verdict).toBe('notSetPiece');
    expect(checkChallenge(c, facts({ range: 'FROM THE STRIPE', total: 40 })).verdict).toBe('cleared');
  });
  it('OVER THREE needs the three in a row (and sets it up)', () => {
    const c = challengeById('overthree')!;
    expect(c.prop).toBe('row3');
    expect(checkChallenge(c, facts({ prop: 'car', total: 50 })).verdict).toBe('notSetPiece');
    expect(checkChallenge(c, facts({ prop: 'row3', total: 41 })).verdict).toBe('short');
  });
  it('720 OFF THE BOUNCE needs the bounce AND the 720', () => {
    const c = challengeById('bounce720')!;
    expect(checkChallenge(c, facts({ prop: 'bounce', tricks: ['spin360'] })).missing).toMatch(/720/);
    expect(checkChallenge(c, facts({ prop: 'selflob', tricks: ['spin720'] })).missing).toMatch(/BOUNCE/);
    expect(checkChallenge(c, facts({ prop: 'bounce', tricks: ['spin720'], total: 43 })).verdict).toBe('cleared');
  });
  it('PERFECT FLIGHT WITH A PROP needs a prop and a perfect flight', () => {
    const c = challengeById('perfectprop')!;
    expect(checkChallenge(c, facts({ prop: 'none', perfect: true })).verdict).toBe('notSetPiece');
    expect(checkChallenge(c, facts({ prop: 'selflob', perfect: false })).verdict).toBe('notSetPiece');
    expect(checkChallenge(c, facts({ prop: 'selflob', perfect: true, total: 41 })).verdict).toBe('cleared');
  });
  it('ONE FOOT OFF THE BASELINE and TWO ON THE BEAT read the side, the foot, the chain and the beats', () => {
    expect(checkChallenge(challengeById('baseline')!, facts({ side: 'WING' })).verdict).toBe('notSetPiece');
    expect(checkChallenge(challengeById('baseline')!, facts({ side: 'BASELINE', foot: 'two' })).verdict).toBe('notSetPiece');
    expect(checkChallenge(challengeById('baseline')!, facts({ side: 'BASELINE', foot: 'one', total: 39 })).verdict).toBe('cleared');
    expect(checkChallenge(challengeById('beatchain')!, facts({ tricks: ['spin360', 'windmill'], onBeat: 1 })).verdict).toBe('notSetPiece');
    expect(checkChallenge(challengeById('beatchain')!, facts({ tricks: ['spin360', 'windmill'], onBeat: 2, total: 44 })).verdict).toBe('cleared');
  });
  it('no make is no dunk, whatever the set piece', () => {
    for (const c of DUNK_CHALLENGES) expect(checkChallenge(c, facts({ made: false, total: 50 })).verdict).toBe('missed');
  });
  it('the target is inclusive: equal clears, one under is short', () => {
    const c = challengeById('stripe')!;
    expect(checkChallenge(c, facts({ range: 'FROM THE STRIPE', total: c.target })).verdict).toBe('cleared');
    expect(checkChallenge(c, facts({ range: 'FROM THE STRIPE', total: c.target - 1 })).verdict).toBe('short');
  });
});

describe('the targets are reachable and not free (TUNED, measured on the contest\'s own card)', () => {
  // a clean, well-timed set piece in POWER clears; the same set piece done sloppily (execution 0.5, off the beat) does not
  const cases: { id: string; clean: Parameters<typeof scenario>[0]; sloppy: Parameters<typeof scenario>[0] }[] = [
    { id: 'stripe', clean: { tricks: ['windmill'], dist: 4.3, foot: 'one', prop: 0, exec: 0.8, onBeat: 1 }, sloppy: { tricks: [], dist: 4.3, foot: 'one', prop: 0, exec: 0.5, onBeat: 0 } },
    { id: 'overthree', clean: { tricks: ['spin360'], dist: 1.6, foot: 'two', prop: 4.5, exec: 0.75, onBeat: 1 }, sloppy: { tricks: [], dist: 1.6, foot: 'two', prop: 4.5, exec: 0.5, onBeat: 0 } },
    { id: 'bounce720', clean: { tricks: ['spin720'], dist: 1.6, foot: 'one', prop: 2.5, exec: 0.8, onBeat: 1 }, sloppy: { tricks: ['spin720'], dist: 1.6, foot: 'one', prop: 2.5, exec: 0.5, onBeat: 0 } },
    { id: 'perfectprop', clean: { tricks: ['windmill'], dist: 1.6, foot: 'one', prop: 1.5, exec: 0.95, onBeat: 1, perfect: true }, sloppy: { tricks: [], dist: 1.6, foot: 'one', prop: 1.5, exec: 0.5, onBeat: 0 } },
    { id: 'baseline', clean: { tricks: [], dist: 1.6, angle: 0.6, foot: 'one', prop: 0, exec: 0.9, onBeat: 0 }, sloppy: { tricks: [], dist: 1.6, angle: 0.6, foot: 'one', prop: 0, exec: 0.5, onBeat: 0 } },
    { id: 'beatchain', clean: { tricks: ['spin360', 'windmill'], dist: 1.6, foot: 'one', prop: 0, exec: 0.75, onBeat: 2, charge: 1 }, sloppy: { tricks: ['spin360', 'windmill'], dist: 1.6, foot: 'one', prop: 0, exec: 0.5, onBeat: 0, charge: 1 } },
  ];
  for (const k of cases) {
    it(`${k.id}: clean clears, sloppy does not`, () => {
      const c = challengeById(k.id)!;
      expect(scenario(k.clean)).toBeGreaterThanOrEqual(c.target);
      expect(scenario(k.sloppy)).toBeLessThan(c.target);
    });
  }
  it('the card is a neutral room: the night\'s hype and a repeat never move it', () => {
    const base = { trickDifficulty: 2.4, runwayDifficulty: 0, propBonus: 0, charge: 0.5, launchSpeed01: 1, styleTier: 3, styleTaps: 0, hang: false, execution01: 0.8, chainTricks: 0 };
    const a = challengeCard(base);
    const b = challengeCard({ ...base, hype: 100, repeat: true } as typeof base);
    expect(b).toEqual(a);
  });
});

describe('the words', () => {
  it('the banner and the chip', () => {
    const c = challengeById('stripe')!;
    expect(challengeLine(c, checkChallenge(c, facts({ range: 'FROM THE STRIPE', total: 42 })), 38)).toBe('FROM THE STRIPE — 42 / 40 · CLEARED! · BEST 42');
    expect(challengeLine(c, checkChallenge(c, facts({ range: 'FROM THE STRIPE', total: 37 })))).toBe('FROM THE STRIPE — 37 / 40 · 3 SHORT');
    expect(challengeLine(c, checkChallenge(c, facts({ range: 'IN THE PAINT' })))).toMatch(/NOT THE SET PIECE: TAKE OFF FROM THE STRIPE/);
    expect(challengeChip(c, 38, false)).toBe('FROM THE STRIPE · TARGET 40 · BEST 38');
    expect(challengeChip(null)).toBe('');
  });
});
