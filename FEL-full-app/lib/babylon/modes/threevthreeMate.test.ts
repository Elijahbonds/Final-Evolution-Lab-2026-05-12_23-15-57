// lane/h3-aware (PR #315's H3e, ported): my teammate with the ball reads and plays — shoot / drive / swing it on — instead of release's
// 1 %-a-frame roll inside 3.5 m of the ring. Only his CHOICE changes: every shot he takes is still the mode's teammateShoots, its make
// chance RimForAll.matePct on the ring (RimDecides, #391), so the make rate of each decision type is the one release had.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  mateCall, MateBall, mateReadOn, swingOpen, MATE_SETTLE_SEC, MATE_READ_SEC, MATE_HOLD_MAX_SEC, MATE_SHOOT_RANGE_M, MATE_FINISH_M,
  MATE_DRIVE_MAX_SEC, MATE_DRIVE_FROM_M, RELEASE_ROLL_RIM_M, RELEASE_ROLL_PER_FRAME,
} from './threevthreeMate';
import { SHOOT_OPEN_M } from './threevthreeRules';
import { matePct } from '../core/RimForAll';
import { proximityContest01, rivalShotPct, LAYUP_RANGE } from '../core/BasketballCore';
import { closeFeel, openFeel } from '@/tests/helpers/feelOpen';

afterEach(() => closeFeel());
const DT = 1 / 60;

describe('mateCall — the teammate decision rules', () => {
  const base = { sinceCatchSec: 0.5, rimDist: 6, open: 1.0, laneToRim: false, driving: false, driveSec: 0, passOpen: false };
  it('a beat to catch it first, whatever is open', () => {
    expect(mateCall({ ...base, sinceCatchSec: MATE_SETTLE_SEC - 0.01, open: 9, laneToRim: true, passOpen: true })).toBe('hold');
  });
  it('open in range: the shot off the catch; out of range or covered: not', () => {
    expect(mateCall({ ...base, open: SHOOT_OPEN_M })).toBe('shoot');
    expect(mateCall({ ...base, open: SHOOT_OPEN_M, rimDist: MATE_SHOOT_RANGE_M + 0.5 })).not.toBe('shoot');
    expect(mateCall({ ...base, open: SHOOT_OPEN_M - 0.2 })).toBe('hold');
  });
  it('a clear lane from inside MATE_DRIVE_FROM_M: the drive, finished at the rim or after MATE_DRIVE_MAX_SEC', () => {
    expect(mateCall({ ...base, laneToRim: true })).toBe('drive');
    expect(mateCall({ ...base, laneToRim: true, rimDist: MATE_DRIVE_FROM_M + 0.5 })).not.toBe('drive');
    expect(mateCall({ ...base, driving: true, rimDist: 4, driveSec: 0.5 })).toBe('drive');
    expect(mateCall({ ...base, driving: true, rimDist: MATE_FINISH_M })).toBe('shoot');
    expect(mateCall({ ...base, driving: true, rimDist: 4, driveSec: MATE_DRIVE_MAX_SEC })).toBe('shoot');
  });
  it('the shot off the catch outranks the drive (open in range: let it go)', () => {
    expect(mateCall({ ...base, open: SHOOT_OPEN_M, laneToRim: true })).toBe('shoot');
  });
  it('nothing on: the swing to the open man after MATE_READ_SEC, and the ball never held past MATE_HOLD_MAX_SEC', () => {
    expect(mateCall({ ...base, passOpen: true, sinceCatchSec: MATE_READ_SEC - 0.05 })).toBe('hold');
    expect(mateCall({ ...base, passOpen: true, sinceCatchSec: MATE_READ_SEC })).toBe('pass');
    expect(mateCall({ ...base, sinceCatchSec: MATE_HOLD_MAX_SEC })).toBe('shoot');                                  // in range: a contested look
    expect(mateCall({ ...base, sinceCatchSec: MATE_HOLD_MAX_SEC, rimDist: MATE_SHOOT_RANGE_M + 1 })).toBe('pass');  // out of range: move it
    for (let t = 0; t <= MATE_HOLD_MAX_SEC + 1; t += 0.05) if (t >= MATE_HOLD_MAX_SEC) expect(mateCall({ ...base, sinceCatchSec: t })).not.toBe('hold');
  });
  it('the knobs are read live (a playtest override): a longer read holds the swing', () => {
    openFeel({ 'hoops.mateReadSec': 1.5 });
    expect(mateCall({ ...base, passOpen: true, sinceCatchSec: MATE_READ_SEC })).toBe('hold');
  });
});

describe('MateBall — one teammate\'s clock with the ball', () => {
  const rim = { x: 0, z: 0 };
  it('the swing goes to me first when I am open (the ball back to the player), else to the open teammate', () => {
    const mb = new MateBall();
    const f = { self: { x: 0, z: 9 }, rim, me: { x: -5, z: 6 }, other: { x: 5, z: 6 }, defenders: [{ x: 0, z: 8 }] };
    let t = mb.step(DT, f); for (let i = 0; i < 200 && t.call === 'hold'; i++) t = mb.step(DT, f);
    expect(t.call).toBe('pass'); expect(t.to).toBe('me');
    const mb2 = new MateBall();
    const g = { ...f, defenders: [{ x: 0, z: 8 }, { x: -5, z: 6.5 }] };   // a man on me
    let u = mb2.step(DT, g); for (let i = 0; i < 200 && u.call === 'hold'; i++) u = mb2.step(DT, g);
    expect(u.call).toBe('pass'); expect(u.to).toBe('other');
    expect(swingOpen(g.self, g.me, g.defenders)).toBe(false);
  });
  it('a drive heads at the rim, and finishes as a shot at MATE_FINISH_M; a new catch starts a new read', () => {
    const mb = new MateBall();
    let p = { x: 0, z: 6 }; let t = mb.step(DT, { self: p, rim, me: { x: -5, z: 6 }, other: null, defenders: [{ x: 1.5, z: 6.5 }] });
    let n = 0;
    for (; n < 400 && t.call !== 'shoot'; n++) {
      if (t.call === 'drive') { expect(t.dirX).toBeCloseTo(0, 6); expect(t.dirZ).toBeCloseTo(-1, 6); expect(mb.onDrive).toBe(true); p = { x: 0, z: p.z - 5 * DT }; }
      t = mb.step(DT, { self: p, rim, me: { x: -5, z: 6 }, other: null, defenders: [{ x: 1.5, z: 6.5 }] });
    }
    expect(t.call).toBe('shoot'); expect(t.offDrive).toBe(true);
    expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(MATE_FINISH_M + 0.1);
    const again = mb.step(DT, { self: p, rim, me: { x: -5, z: 6 }, other: null, defenders: [{ x: 1.5, z: 6.5 }] });
    expect(again.call).toBe('hold'); expect(again.sinceCatchSec).toBeCloseTo(DT, 9);
  });
  it('drop(): the next catch is a fresh read', () => {
    const mb = new MateBall(); const f = { self: { x: 0, z: 9 }, rim, me: { x: -5, z: 6 }, other: null, defenders: [{ x: 0, z: 8 }] };
    for (let i = 0; i < 30; i++) mb.step(DT, f);
    mb.drop();
    expect(mb.step(DT, f).sinceCatchSec).toBeCloseTo(DT, 9);
  });
  it('the A/B: hoops.mateReadOn 0 is release\'s roll (kept as it was: inside 3.5 m of the ring, 1 % a frame)', () => {
    expect(mateReadOn()).toBe(true);
    openFeel({ 'hoops.mateReadOn': 0 });
    expect(mateReadOn()).toBe(false);
    expect([RELEASE_ROLL_RIM_M, RELEASE_ROLL_PER_FRAME]).toEqual([3.5, 0.01]);
  });
});

// The make rate of each decision type stays release's: every path is teammateShoots(ctx, body, i) with its default finish 'shot', whose
// chance is matePct('shot', the 3D distance to the ring, the nearest defender's contest, the style) decided on the ring.
describe('3v3 make rates are unchanged per decision type', () => {
  const src = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');
  const mate = readFileSync('lib/babylon/modes/threevthreeMate.ts', 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  it('the read rolls no dice and touches no percentage', () => {
    expect(mate).not.toMatch(/Math\.random|Pct|pct|rimVerdict|made/);
  });
  it('the shot (off the catch, off the drive, at the hold\'s end) is teammateShoots with its default finish — the same call release\'s roll made', () => {
    const turn = src.slice(src.indexOf('function mateTurn('), src.indexOf('function mateSwing('));
    expect(turn).toMatch(/if \(t\.call === 'shoot'\) \{.*void teammateShoots\(ctx, body, i\); \}\n/);
    expect(src).toMatch(/!mateReadOn\(\) && carrierId === \(i === 0 \? 'mate0' : 'mate1'\) && Vector3\.Distance\(body\.char\.root\.position, RIM\) < RELEASE_ROLL_RIM_M && Math\.random\(\) < RELEASE_ROLL_PER_FRAME\) \{.*\n\s*void teammateShoots\(ctx, body, i\);/);
  });
  it('teammateShoots still decides on the ring with matePct (RimDecides): the odds code is release\'s', () => {
    const shoots = src.slice(src.indexOf('async function teammateShoots('), src.indexOf('async function resolveMyShot('));
    expect(shoots).toMatch(/const dist = Vector3\.Distance\(body\.char\.root\.position, RIM\);/);
    expect(shoots).toMatch(/const mateContest = proximityContest01\(/);
    expect(shoots).toMatch(/const mateStyle: 'layup' \| 'jumper' = dist < LAYUP_RANGE \? 'layup' : 'jumper';/);
    expect(shoots).toMatch(/const mPct = matePct\(finish, dist, mateContest, mateStyle\);/);
    expect(shoots).toMatch(/const mv = rimVerdictFor\(mateMiss\.from, mPct, /);
  });
  it('the numbers per decision type (pinned): an open catch-and-shoot, a contested look at the hold\'s end, a drive\'s finish', () => {
    const d3 = (flat: number) => Math.hypot(flat, 3.05);   // the 3D distance teammateShoots measures (the ring is 3.05 m up)
    const style = (flat: number) => (d3(flat) < LAYUP_RANGE ? 'layup' : 'jumper');
    const catchShoot = matePct('shot', d3(6.0), proximityContest01(SHOOT_OPEN_M), style(6.0));
    const holdEnd = matePct('shot', d3(5.0), proximityContest01(1.0), style(5.0));
    const driveFinish = matePct('shot', d3(MATE_FINISH_M), proximityContest01(1.5), style(MATE_FINISH_M));
    expect(catchShoot).toBeCloseTo(0.38 - 0.2 * 0.42, 9);   // 6.73 m: the 0.38 band, contest 0.2
    expect(holdEnd).toBeCloseTo(0.46 - (2 / 3) * 0.42, 9);  // 5.86 m: the 0.46 band, contest 0.67
    expect(driveFinish).toBeCloseTo(0.52 - 0.5 * 0.42, 9);  // 3.88 m: the 0.52 band, contest 0.5
    for (const [f, c] of [[6.0, SHOOT_OPEN_M], [5.0, 1.0], [MATE_FINISH_M, 1.5]] as const) expect(matePct('shot', d3(f), proximityContest01(c), style(f))).toBe(rivalShotPct(d3(f), proximityContest01(c), 'jumper'));
  });
});
