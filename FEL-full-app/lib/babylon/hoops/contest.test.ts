// hoops-p02 (1v1/3v3 phase 2): one contest model for every shooter, and the contest → make table for the three shooters.
import { describe, expect, it } from 'vitest';
import { contestFrom, contestOn, jumpContest, closingSpeed, ONE_CONTEST_ON, CONTEST_RANGE_M, JUMP_CONTEST, CLOSEOUT_CONTEST, type ContestBody } from './contest';
import { JUMP_SEC } from './blocks';
import { contestedPct, contestTier, HAND_UP_CONTEST } from '../core/HoopsDefense';
import { rivalShotPct } from '../core/BasketballCore';
import { matePct } from '../core/RimForAll';
import { rivalReleasePct, THREEV_TIER } from '../modes/threevthreeRules';

const body = (o: Partial<ContestBody>): ContestBody => ({ dist: 1.5, facingCos: 1, handUp: false, jumpAge: Infinity, closeMps: 0, ...o });

describe('hoops/contest — one model', () => {
  it('ships on', () => { expect(ONE_CONTEST_ON).toBe(true); });
  it('distance alone: 1 in his chest, 0 at the range, planar', () => {
    expect(contestFrom(body({ dist: 0 })).contest).toBeCloseTo(1, 6);
    expect(contestFrom(body({ dist: CONTEST_RANGE_M })).contest).toBe(0);
    expect(contestFrom(body({ dist: Infinity })).contest).toBe(0);
  });
  it('closer is never less contest', () => {
    let prev = -1;
    for (let d = 3; d >= 0; d -= 0.1) { const c = contestFrom(body({ dist: d })).contest; expect(c).toBeGreaterThanOrEqual(prev); prev = c; }
  });
  it('a hand raised toward him adds; facing away it does not', () => {
    const base = contestFrom(body({ dist: 1.2 })).contest;
    expect(contestFrom(body({ dist: 1.2, handUp: true })).contest).toBeGreaterThan(base);
    expect(contestFrom(body({ dist: 1.2, handUp: true, facingCos: -0.5 })).contest).toBeCloseTo(base, 6);
    expect(contestFrom(body({ dist: 0.8, handUp: true })).hand).toBeCloseTo(HAND_UP_CONTEST, 6);
  });
  it('the jump on a curve: most at the top, less leaving or landing, nothing once landed', () => {
    expect(jumpContest(JUMP_SEC / 2)).toBeCloseTo(JUMP_CONTEST, 6);
    expect(jumpContest(0.05)).toBeLessThan(jumpContest(JUMP_SEC / 2));
    expect(jumpContest(JUMP_SEC - 0.05)).toBeLessThan(jumpContest(JUMP_SEC / 2));
    expect(jumpContest(JUMP_SEC)).toBe(0);
    expect(jumpContest(Infinity)).toBe(0);
  });
  it('a hand and a jump: the larger counts, never both', () => {
    const c = contestFrom(body({ dist: 1.2, handUp: true, jumpAge: JUMP_SEC / 2 }));
    expect(c.contest).toBeCloseTo(c.dist + Math.max(c.hand, c.jump), 6);
  });
  it('a closeout AT the shooter adds; one running past him does not', () => {
    const def = { x: 0, z: 0 }, shooter = { x: 0, z: 2 };
    const at = closingSpeed(def, { x: 0, z: 4 }, shooter), past = closingSpeed(def, { x: 4, z: 0 }, shooter);
    expect(at).toBeCloseTo(4, 6); expect(past).toBeCloseTo(0, 6);
    expect(contestFrom(body({ dist: 2, closeMps: at })).closeout).toBeCloseTo(CLOSEOUT_CONTEST, 6);
    expect(contestFrom(body({ dist: 2, closeMps: past })).closeout).toBe(0);
    expect(contestFrom(body({ dist: 2, closeMps: -3 })).closeout).toBe(0);
  });
  it('several defenders: the most any one puts on the shot', () => {
    const a = body({ dist: 2 }), b = body({ dist: 1 });
    expect(contestOn([a, b]).contest).toBeCloseTo(contestFrom(b).contest, 6);
    expect(contestOn([]).contest).toBe(0);
  });
  it('the banner tiers are unchanged', () => {
    expect(contestTier(0.8).label).toBe('SMOTHERED'); expect(contestTier(0.1).label).toBe('WIDE OPEN');
  });
});

// THE GATE: one contest table, three shooters. Each row is the make chance at that contest for my jumper (a GOOD release, 0.6),
// the rival (1v1 rivalShotPct, the 3v3 rivalReleasePct at PRO) and my 3v3 mates (matePct), for a jumper and a layup. Every column must
// fall as the contest rises (monotonic), and an open look must beat a smothered one.
describe('contest → make %, one table, three shooters (monotonic)', () => {
  const levels = [0, 0.15, 0.35, 0.5, 0.75, 1];
  const knobs = THREEV_TIER.pro;
  const cols: Record<string, (c: number) => number> = {
    'hero jumper (good 0.6)': (c) => contestedPct(0.6, c),
    'rival 1v1 jumper 5 m': (c) => rivalShotPct(5, c, 'jumper'),
    'rival 1v1 layup': (c) => rivalShotPct(1, c, 'layup'),
    'rival 3v3 jumper': (c) => rivalReleasePct({ style: 'jumper', pullUp: false, distToRim: 5, defenseFactor: c, ground: Math.min(c, 0.25), mistake: 1 }, knobs),
    'rival 3v3 layup': (c) => rivalReleasePct({ style: 'layup', pullUp: false, distToRim: 1, defenseFactor: c, ground: Math.min(c, 0.25), mistake: 1 }, knobs),
    'mate jumper 5 m': (c) => matePct('shot', 5, c, 'jumper'),
    'mate layup': (c) => matePct('shot', 1, c, 'layup'),
  };
  for (const [name, f] of Object.entries(cols)) {
    it(`${name}: falls as the contest rises`, () => {
      const row = levels.map(f);
      for (let i = 1; i < row.length; i++) expect(row[i]).toBeLessThanOrEqual(row[i - 1] + 1e-9);
      expect(row[0]).toBeGreaterThan(row[row.length - 1]);
    });
  }
});
