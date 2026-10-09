// IMPROVE (2026-10-06, Big Air items 3–6, 9–13) — the play layer's rules (bigAirPlay.ts) and the mode's wiring of them.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AIR_HINT, coachLine, inCleanWindow, barK, stompState, stompCall, zoneCall, HANG, apexHang, judgeRead, repeatShare, sheetLine,
} from './bigAirPlay';
import { sessionWon } from './AirSessionMode';
import { BIG_AIR_TRICK, BIG_AIR_TUNING } from '../../feel/cores/big-air-constants';

describe('the first attempt\'s coach and the control card (item 6, item 5)', () => {
  it('says what to press now, by phase, on the first attempt only', () => {
    expect(coachLine(0, 'Run', { spinning: false, taps: 0 }, false)).toMatch(/STRIDE/);
    expect(coachLine(0, 'Air', { spinning: false, taps: 0 }, false)).toBe('A — SPIN');
    expect(coachLine(0, 'Air', { spinning: true, taps: 1 }, false)).toMatch(/PLANT/);
    expect(coachLine(0, 'Air', { spinning: false, taps: 2 }, false)).toMatch(/STOMP/);
    expect(coachLine(0, 'Air', { spinning: true, taps: 1 }, true)).toBe('B — STOMP IT');   // the window wins
    expect(coachLine(1, 'Run', { spinning: false, taps: 0 }, false)).toBeNull();
    expect(coachLine(0, 'Land', { spinning: false, taps: 0 }, false)).toBeNull();
  });
  it('names every verb on the card, grabs and the big spins included', () => {
    for (const w of ['STRIDE', 'BOOST', 'A SPIN', 'A PLANT', 'X GRAB', 'Y BIG SPIN', 'B STOMP']) expect(AIR_HINT).toContain(w);
  });
});

describe('the spin dial and the speed bar (items 4, 8)', () => {
  it('marks the clean window: ± the core\'s tolerance of every half turn', () => {
    const tol = BIG_AIR_TRICK.cleanTolerance!;
    expect(inCleanWindow(1.0, tol)).toBe(true);
    expect(inCleanWindow(1.5 + tol - 0.001, tol)).toBe(true);
    expect(inCleanWindow(1.25, tol)).toBe(false);
    expect(inCleanWindow(-0.5, tol)).toBe(true);
  });
  it('puts a speed on a 0..1 bar', () => {
    expect(barK(13, 26)).toBe(0.5);
    expect(barK(40, 26)).toBe(1);
    expect(barK(-1, 26)).toBe(0);
  });
});

describe('the stomp cue (item 11)', () => {
  const W = BIG_AIR_TRICK.stickWindowMs!;
  it('is NOW inside the stick window, WAIT before it, nothing out of the air', () => {
    expect(stompState(0.1, W)).toBe('now');
    expect(stompState(W / 1000, W)).toBe('now');
    expect(stompState(0.5, W)).toBe('wait');
    expect(stompState(null, W)).toBeNull();
  });
  it('calls an early stomp by how early, no stomp as none, and a stuck landing not at all', () => {
    expect(stompCall(false, 0.5, W)).toBe(`STOMP EARLY · ${500 - W} MS`);
    expect(stompCall(false, null, W)).toBe('NO STOMP');
    expect(stompCall(true, 0.1, W)).toBeNull();
  });
  it('says where on the hill a capped landing set down', () => {
    expect(zoneCall('knuckle')).toMatch(/KNUCKLE/);
    expect(zoneCall('flat')).toMatch(/OVERSHOT/);
    expect(zoneCall('sweet')).toBeNull();
  });
});

describe('the apex hang (item 12)', () => {
  it('fires once, at the top, with a big spin running', () => {
    expect(apexHang(0.2, -0.1, true, 2, false)).toBe(true);
    expect(apexHang(0.2, -0.1, true, 2, true)).toBe(false);          // once an air
    expect(apexHang(0.2, -0.1, false, 2, false)).toBe(false);        // no spin running
    expect(apexHang(0.2, -0.1, true, HANG.minTurns - 0.1, false)).toBe(false);   // not a big one
    expect(apexHang(-0.1, -0.3, true, 2, false)).toBe(false);        // already falling
  });
  it('is short and not a freeze', () => {
    expect(HANG.sec).toBeLessThanOrEqual(0.35);
    expect(HANG.scale).toBeGreaterThan(0.3);
  });
});

describe('the judge (item 10) and the win (item 9)', () => {
  it('reads a repeated rotation lower, a crash as nothing, a stomp above a clean', () => {
    const fresh = judgeRead('clean', 2, 2.4);
    const again = judgeRead('clean', 2, 2.4, repeatShare(1, BIG_AIR_TUNING.repeatDecay));
    expect(again).toBeLessThan(fresh);
    expect(fresh - again).toBeCloseTo(2.5 * (1 - BIG_AIR_TUNING.repeatDecay![1]));
    expect(judgeRead('crash', 3, 5)).toBe(0);
    expect(judgeRead('stuck', 2, 2)).toBeGreaterThan(judgeRead('clean', 2, 2));
    expect(repeatShare(9, [1, 0.5])).toBe(0.5);
    expect(repeatShare(2, undefined)).toBe(1);
  });
  it('is won on the total the card posts', () => {
    expect(sessionWon(905, 900)).toBe(true);
    expect(sessionWon(899, 900)).toBe(false);
    const src = readFileSync(join(process.cwd(), 'lib/babylon/modes/AirSessionMode.ts'), 'utf8');
    expect(src).toMatch(/const total = S\.score \+ S\.bonus;[\s\S]{0,400}const won = sessionWon\(total, opts\.winScore\);/);
    expect(src).not.toMatch(/S\.score >= opts\.winScore/);
  });
});

describe('the score sheet (item 13)', () => {
  it('lists every attempt: grade, direction and size, points, the hill\'s or the repeat\'s note', () => {
    const line = sheetLine([
      { grade: 'stuck', rotations: 1.5, pts: 820, zone: 'sweet', repeat: 0 },
      { grade: 'clean', rotations: 1.5, pts: 233, zone: 'sweet', repeat: 1 },
      { grade: 'sketchy', rotations: -1, pts: 120, zone: 'flat', repeat: 0 },
      { grade: 'crash', rotations: 0.8, pts: 0, zone: 'knuckle', repeat: 0 },
    ]);
    expect(line.split(';')).toEqual(['STUCK|FS 540|+820|', 'CLEAN|FS 540|+233|×2', 'SKETCHY|BS 360|+120|FLAT', 'CRASH|FS 360|+0|KNUCKLE']);
    expect(sheetLine([])).toBe('');
  });
});

describe('the mode\'s wiring (items 3, 5, 7)', () => {
  const src = readFileSync(join(process.cwd(), 'lib/babylon/modes/AirSessionMode.ts'), 'utf8');
  it('spins about the vertical, not as a flip', () => {
    expect(src).toMatch(/Math\.PI \+ \(st\.phase === 'Air' \? \(st\.spinTurns \?\? 0\) \* Math\.PI \* 2 : 0\)/);
    expect(src).not.toMatch(/st\.phase === 'Air' \? \(st\.spinTurns \?\? 0\) \* Math\.PI \* 2 : -core/);
  });
  it('maps Y to the Y tricks and X to the X grab, as the board family does', () => {
    expect(src).toMatch(/e\.btn === 'Y' && phase === 'Air'\) \{ nameTrick\('Y'\)/);
    expect(src).toMatch(/e\.btn === 'X' && phase === 'Air'\) \{ nameTrick\('X'\)/);
  });
  it('mounts the trick layer (the grab\'s hand) with the core owning the spin', () => {
    expect(src).toMatch(/new BoardTrickLayer\(ctx\.scene, athlete\.skeleton, athlete\.root, board, \{ bodySpin: false \}\)/);
    expect(src).toMatch(/trickLayer\?\.start\(t\)/);
    expect(src).toMatch(/trickLayer\?\.apply\(dt, st\.phase === 'Air'\)/);
  });
});
