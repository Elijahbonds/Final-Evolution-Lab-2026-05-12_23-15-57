// TennisPlay — the tennis rules added on 2026-10-06 (docs/IMPROVEMENTS-2026-10-05.md, Tennis 1–20), executed.
import { describe, it, expect } from 'vitest';
import {
  serverAfter, ANSWER_READ_SEC, answeredWith, EARLY_LOCK_SEC, earlyPress, zoneHold, AI_SHOT_BASE, aiShotWeights, pickShot,
  ringDt, ringKey,
} from './TennisPlay';
import { SWING_BANDS, TennisScore, gradeSwing, type TennisShot } from './RallyCore';
import { ANSWER } from './tennisHud';

const SHOTS: TennisShot[] = ['drive', 'slice', 'lob', 'drop'];
const share = (w: Record<TennisShot, number>, k: TennisShot) => w[k] / SHOTS.reduce((s, x) => s + w[x], 0);

describe('Tennis #2: the serve changes ends with the game', () => {
  it('the server keeps it through the points of a game and hands it over when the game is won', () => {
    expect(serverAfter(0, 'point')).toBe(0);
    expect(serverAfter(1, 'point')).toBe(1);
    expect(serverAfter(0, 'game')).toBe(1);
    expect(serverAfter(1, 'game')).toBe(0);
    expect(serverAfter(0, 'match')).toBe(0);
  });

  it('over a real match the serve alternates game by game (both sides serve)', () => {
    const t = new TennisScore(3);
    let server: 0 | 1 = 0; const servedGames: (0 | 1)[] = [server];
    for (let g = 0; g < 4; g++) {
      let r: 'point' | 'game' | 'match' = 'point';
      while (r === 'point') { r = t.award((g % 2) as 0 | 1); server = serverAfter(server, r); }
      if (r === 'match') break;
      servedGames.push(server);
    }
    expect(servedGames).toEqual([0, 1, 0, 1, 0]);   // 2–2 after four games: the fifth is the player's again
  });
});

describe('Tennis #1: the shown answer is worth playing', () => {
  it('the answer is the HUD\'s answer for the incoming shot, and a serve has none', () => {
    for (const k of SHOTS) {
      expect(answeredWith(k, ANSWER[k])).toBe(true);
      for (const p of SHOTS) if (p !== ANSWER[k]) expect(answeredWith(k, p)).toBe(false);
    }
    expect(answeredWith(undefined, 'drive')).toBe(false);
  });

  it('it costs the opponent a real slice of their read, but less than one grade step of it (TUNED, conservative)', () => {
    expect(ANSWER_READ_SEC).toBeGreaterThan(0);
    expect(ANSWER_READ_SEC).toBeLessThan(0.45 - 0.3);   // a good ball's read over a late one's: answering is not a free grade
  });
});

describe('Tennis #6: a too-early swing costs the ball', () => {
  it('inside the band is a swing; just outside it locks; a whole second early is only a wait', () => {
    expect(earlyPress(0)).toBe('swing');
    expect(earlyPress(-SWING_BANDS.ok)).toBe('swing');
    expect(earlyPress(-SWING_BANDS.ok - 0.01)).toBe('lock');
    expect(earlyPress(-EARLY_LOCK_SEC)).toBe('lock');
    expect(earlyPress(-EARLY_LOCK_SEC - 0.01)).toBe('wait');
    expect(earlyPress(-1.2)).toBe('wait');
    expect(earlyPress(0.5)).toBe('swing');   // after contact is the late grade's business, not a lock
  });

  it('mashing cannot step over the lock zone: every press train at 4/s or faster lands one in it before the band', () => {
    const period = 0.25;
    expect(EARLY_LOCK_SEC - SWING_BANDS.ok).toBeGreaterThanOrEqual(period);
    for (let phase = 0; phase < period; phase += 0.01) {
      // presses at -1.5 + phase, then every `period` s: the first one inside -EARLY_LOCK_SEC..0 must be a lock
      let first: string | null = null;
      for (let t = -1.5 + phase; t < 0.4; t += period) { const e = earlyPress(t); if (e !== 'wait') { first = e; break; } }
      expect(first).toBe('lock');
    }
  });
});

describe('Tennis #10: holding a Zone Shot', () => {
  it('perfect holds it, good costs the point and keeps the racket, anything worse breaks one', () => {
    expect(zoneHold('perfect')).toBe('held');
    expect(zoneHold('good')).toBe('point');
    expect(zoneHold('early')).toBe('racket');
    expect(zoneHold('late')).toBe('racket');
    expect(zoneHold('miss')).toBe('racket');
  });
});

describe('Tennis #11: the opponent reads where the player stands', () => {
  const at = (x: number, z: number, stretched = false) => aiShotWeights({ playerX: x, playerZ: z, halfWidth: 4, halfLength: 12, stretched });

  it('lobs more at a player at the net, drops more at one on the baseline', () => {
    const net = at(0, 1), base = at(0, 12);
    expect(share(net, 'lob')).toBeGreaterThan(share(base, 'lob'));
    expect(share(base, 'drop')).toBeGreaterThan(share(net, 'drop'));
    expect(share(net, 'lob')).toBeGreaterThan(AI_SHOT_BASE.lob);
  });

  it('drives into the open court when the player is pulled wide; a stretched opponent plays defence', () => {
    expect(share(at(3.8, 12), 'drive')).toBeGreaterThan(share(at(0, 12), 'drive'));
    const calm = at(0, 12), str = at(0, 12, true);
    expect(share(str, 'drive')).toBeLessThan(share(calm, 'drive'));
    expect(share(str, 'lob') + share(str, 'slice')).toBeGreaterThan(share(calm, 'lob') + share(calm, 'slice'));
  });

  it('weights, not a decision: every shot stays possible, wherever the player is', () => {
    for (const x of [0, 2, 4]) for (const z of [0, 6, 12]) for (const s of [false, true]) {
      const w = at(x, z, s);
      for (const k of SHOTS) expect(w[k]).toBeGreaterThan(0);
    }
  });

  it('pickShot honours the weights (a fixed roll is a fixed pick; the mix converges)', () => {
    const w = { drive: 1, slice: 1, lob: 1, drop: 1 };
    expect(pickShot(w, 0)).toBe('drive');
    expect(pickShot(w, 0.3)).toBe('slice');
    expect(pickShot(w, 0.6)).toBe('lob');
    expect(pickShot(w, 0.99)).toBe('drop');
    const counts: Record<TennisShot, number> = { drive: 0, slice: 0, lob: 0, drop: 0 };
    const N = 4000; for (let i = 0; i < N; i++) counts[pickShot(AI_SHOT_BASE, (i + 0.5) / N)]++;
    for (const k of SHOTS) expect(counts[k] / N).toBeCloseTo(AI_SHOT_BASE[k], 2);
  });
});

describe('Tennis #4 / #13: the landing ring', () => {
  it('plots the swing you would make now: clamped to the band, so it is never a miss', () => {
    expect(ringDt(-2)).toBe(-SWING_BANDS.ok);
    expect(ringDt(0.05)).toBe(0.05);
    expect(ringDt(3)).toBe(SWING_BANDS.ok);
    for (const dt of [-3, -0.5, -0.2, 0, 0.2, 0.5, 3]) expect(gradeSwing(ringDt(dt))).not.toBe('miss');
    expect(gradeSwing(ringDt(-1))).toBe('early');   // before the band the ring shows the earliest playable swing
  });

  it('the re-plan key changes with the shot, the grade and the aim, and not with noise below 1/20 of the aim', () => {
    const k = ringKey('drive', 'perfect', 0);
    expect(ringKey('slice', 'perfect', 0)).not.toBe(k);
    expect(ringKey('drive', 'good', 0)).not.toBe(k);
    expect(ringKey('drive', 'perfect', 0.1)).not.toBe(k);
    expect(ringKey('drive', 'perfect', 0.01)).toBe(k);
    const seen = new Set<number>();
    for (const s of SHOTS) for (const q of ['perfect', 'good', 'early', 'late', 'miss'] as const) for (let a = -1; a <= 1.0001; a += 0.05) seen.add(ringKey(s, q, a));
    expect(seen.size).toBe(4 * 5 * 41);   // no two plots share a key
  });
});
