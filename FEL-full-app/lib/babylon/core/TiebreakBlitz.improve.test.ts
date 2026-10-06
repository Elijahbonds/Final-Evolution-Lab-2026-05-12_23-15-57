// IMPROVE (2026-10-06): the Tiebreak owner-picked pass — win by two, the outgoing return, the skip lock, warm-up balls,
// the timing readout, the closing ring and the drawn flight (bounce, blob).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  commitSwing, freshBlitz, goingOut, matchCall, matchOver, mulberry32, NORMAL_FEEL, RETURN_OUT_SEC, ringClose01, skipGap,
  SKIP_LOCK_SEC, swingTiming, tickBlitz, TIEBREAK_MAX_PTS, TARGET, type BlitzState,
} from './TiebreakBlitz';
import { BALL_R, BOUNCE_AT, CONTACT_Y, FAR_Z, STRIKE_Y, incomingPoint, incomingY, outgoingPoint, shadowScale } from './TiebreakFlight';
import { SCORE_CEILINGS } from '@/lib/arena-score-integrity';

const always = () => true;
const never = () => false;
const rng = mulberry32(7);
const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), 'utf8');

/** A ball in the air, `t` seconds into a 1 s flight whose window opens at 0.8 s. */
function inFlight(t: number, extra: Partial<BlitzState> = {}): BlitzState {
  return { ...freshBlitz(), awaiting: true, ballT: t, ballLen: 1, windowOpenAt: 0.8, incoming: 'left', ...extra };
}

describe('Tiebreak #10 — win by two, with a sudden-death cap', () => {
  it('7-5 ends, 7-6 does not, 8-6 does, and 12-11 ends at the cap', () => {
    expect(matchOver(TARGET, 5)).toBe(true);
    expect(matchOver(TARGET, 6)).toBe(false);
    expect(matchOver(8, 6)).toBe(true);
    expect(matchOver(6, 8)).toBe(true);
    expect(matchOver(11, 10)).toBe(false);
    expect(matchOver(TIEBREAK_MAX_PTS, 11)).toBe(true);
    expect(matchOver(TARGET - 1, 0)).toBe(false);
  });

  it('a point won at 6-6 does not end the match; the next one does', () => {
    const s = inFlight(0.9, { myPts: 6, aiPts: 6 });
    expect(commitSwing(s, 'left', rng, 0.95, NORMAL_FEEL, always)).toBe('point-me');
    expect(s.myPts).toBe(7);
    expect(s.over).toBe(false);
    Object.assign(s, { awaiting: true, ballT: 0.9, ballLen: 1, windowOpenAt: 0.8, incoming: 'left' });
    commitSwing(s, 'left', rng, 0.95, NORMAL_FEEL, always);
    expect(s.myPts).toBe(8);
    expect(s.over).toBe(true);
  });

  it('calls the state of the match', () => {
    expect(matchCall(3, 2)).toBe('');
    expect(matchCall(6, 4)).toBe('SET POINT');
    expect(matchCall(4, 6)).toBe('SET POINT · AI');
    expect(matchCall(6, 6)).toBe('WIN BY 2');
    expect(matchCall(8, 7)).toBe('SET POINT');
    expect(matchCall(11, 11)).toBe('SUDDEN DEATH');
    expect(matchCall(8, 6)).toBe('');
  });

  it('the posted score (myPts) stays under the arena ceiling at the cap', () => {
    expect(SCORE_CEILINGS.tiebreak.max).toBeGreaterThanOrEqual(TIEBREAK_MAX_PTS);
    expect(read('../../../components/games/tiebreak-game.tsx')).toContain('score: myPts,');
  });
});

describe('Tiebreak #8 — the return flies out before his shot comes in', () => {
  it('a clean return starts the next ball behind zero, and presses are ignored while it is going out', () => {
    const s = inFlight(0.9);
    expect(commitSwing(s, 'left', rng, 0.95, NORMAL_FEEL, never)).toBe('return');
    expect(s.ballT).toBeCloseTo(-RETURN_OUT_SEC, 9);
    expect(goingOut(s)).toBe(true);
    const rally = s.rally;
    expect(commitSwing(s, 'left', rng, 0.95, NORMAL_FEEL, never)).toBe('ignore');
    expect(commitSwing(s, 'right', rng, 0.95, NORMAL_FEEL, never)).toBe('ignore');
    expect(s.rally).toBe(rally);
    expect(s.aiPts).toBe(0);
    tickBlitz(s, RETURN_OUT_SEC + 0.01, { rng, reactBase: 0.95, feel: NORMAL_FEEL, aiNets: never });
    expect(goingOut(s)).toBe(false);
    expect(s.ballT).toBeGreaterThan(0);
  });
});

describe('Tiebreak #9 — a late press does not skip the hold', () => {
  it('locks the skip for SKIP_LOCK_SEC after a point, then allows it', () => {
    const s = inFlight(0.9);
    commitSwing(s, 'right', rng, 0.95, NORMAL_FEEL, never);   // wrong side: point AI, the hold starts
    expect(s.awaiting).toBe(false);
    expect(skipGap(s)).toBe(false);
    tickBlitz(s, SKIP_LOCK_SEC - 0.05, { rng, reactBase: 0.95, feel: NORMAL_FEEL, aiNets: never });
    expect(skipGap(s)).toBe(false);
    tickBlitz(s, 0.1, { rng, reactBase: 0.95, feel: NORMAL_FEEL, aiNets: never });
    expect(skipGap(s)).toBe(true);
    expect(s.gap).toBe(0);
  });
});

describe('Tiebreak #17 — warm-up balls score nothing', () => {
  it('a clean warm-up hit, a missed one and an ace each use one ball and leave 0-0', () => {
    const s = freshBlitz(3);
    expect(s.warmup).toBe(3);
    Object.assign(s, { awaiting: true, ballT: 0.9, ballLen: 1, windowOpenAt: 0.8, incoming: 'left' });
    expect(commitSwing(s, 'left', rng, 0.95, NORMAL_FEEL, always)).toBe('return');
    expect([s.warmup, s.myPts, s.aiPts, s.bestRally, s.awaiting]).toEqual([2, 0, 0, 0, false]);
    Object.assign(s, { awaiting: true, ballT: 0.9, incoming: 'left' });
    expect(commitSwing(s, 'right', rng, 0.95, NORMAL_FEEL, always)).toBe('point-ai');
    expect([s.warmup, s.myPts, s.aiPts, s.lastMissed]).toEqual([1, 0, 0, null]);
    Object.assign(s, { awaiting: true, ballT: 0.99, incoming: 'left' });
    expect(tickBlitz(s, 0.05, { rng, reactBase: 0.95, feel: NORMAL_FEEL, aiNets: always })).toBe('ace');
    expect([s.warmup, s.myPts, s.aiPts]).toEqual([0, 0, 0]);
    Object.assign(s, { awaiting: true, ballT: 0.9, incoming: 'left' });
    commitSwing(s, 'left', rng, 0.95, NORMAL_FEEL, always);
    expect(s.myPts).toBe(1);
  });

  it('a fresh match has none unless asked', () => {
    expect(freshBlitz().warmup).toBe(0);
  });
});

describe('Tiebreak #12 #1 — the timing readout and the closing ring', () => {
  it('reads early in ms, inside as a fraction of the window', () => {
    expect(swingTiming({ ballT: 0.73, windowOpenAt: 0.8, ballLen: 1 })).toEqual({ phase: 'early', ms: 70, at01: 0 });
    expect(swingTiming({ ballT: 0.9, windowOpenAt: 0.8, ballLen: 1 }).at01).toBeCloseTo(0.5, 6);
    expect(swingTiming({ ballT: 0.9, windowOpenAt: 0.8, ballLen: 1 }).phase).toBe('in');
    expect(swingTiming({ ballT: 1.02, windowOpenAt: 0.8, ballLen: 1 })).toEqual({ phase: 'late', ms: 20, at01: 1 });
  });

  it('the ring is wide at the strike and closed exactly when the window opens', () => {
    expect(ringClose01({ ballT: 0, windowOpenAt: 0.8 })).toBe(0);
    expect(ringClose01({ ballT: 0.4, windowOpenAt: 0.8 })).toBeCloseTo(0.5, 9);
    expect(ringClose01({ ballT: 0.8, windowOpenAt: 0.8 })).toBe(1);
    expect(ringClose01({ ballT: 0.95, windowOpenAt: 0.8 })).toBe(1);
  });
});

describe('Tiebreak #15 #14 #8 — the drawn flight', () => {
  it('starts at the strike, touches the court at the bounce, meets you at contact height, never below the court', () => {
    expect(incomingY(0)).toBeCloseTo(STRIKE_Y, 9);
    expect(incomingY(BOUNCE_AT)).toBeCloseTo(BALL_R, 9);
    expect(incomingY(1)).toBeCloseTo(CONTACT_Y, 9);
    for (let p = 0; p <= 1.0001; p += 0.01) expect(incomingY(p)).toBeGreaterThanOrEqual(BALL_R - 1e-9);
    // the bounce comes before any hit window opens (the window is ≥ 0.55 of the flight, and 0.80 at the start)
    expect(BOUNCE_AT).toBeLessThan(NORMAL_FEEL.windowOpen);
    // continuous across the bounce
    expect(Math.abs(incomingY(BOUNCE_AT - 1e-4) - incomingY(BOUNCE_AT + 1e-4))).toBeLessThan(0.01);
  });

  it('the return goes from your racket to his strike point', () => {
    const from = { x: -2.5, y: 1, z: 8.8 };
    const to = incomingPoint('right', 0, { x: 0, y: 0, z: 0 });
    expect(to.z).toBe(FAR_Z);
    const out = { x: 0, y: 0, z: 0 };
    expect(outgoingPoint(from, to, 0, out)).toEqual(from);
    outgoingPoint(from, to, 1, out);
    expect(out.x).toBeCloseTo(to.x, 9); expect(out.y).toBeCloseTo(to.y, 9); expect(out.z).toBeCloseTo(to.z, 9);
    expect(outgoingPoint(from, to, 0.5, out).y).toBeGreaterThan(Math.max(from.y, to.y));
  });

  it('the blob shrinks as the ball climbs, and never vanishes', () => {
    expect(shadowScale(BALL_R)).toBe(1);
    expect(shadowScale(2)).toBeLessThan(shadowScale(1));
    expect(shadowScale(10)).toBe(0.45);
  });
});

describe('Tiebreak mode and host — the wiring the items need', () => {
  const mode = read('../modes/TiebreakMode.ts');
  const host = read('../../../components/games/tiebreak-game.tsx');
  const update = mode.slice(mode.indexOf('update(ctx: ModeContext'), mode.indexOf('dispose(): void'));

  it('#18: update() builds no template strings to detect a HUD change', () => {
    expect(update).not.toMatch(/const (mark|now) = `/);
    expect(update).toContain('state.myPts !== hudMy');
  });

  it('#19 #20: the markers are unlit and frozen, and dispose takes their materials', () => {
    expect(mode).not.toContain('PBRMaterial');
    expect(mode).toContain('m.disableLighting = true;');
    expect(mode).toContain('m.freeze();');
    for (const m of ['ball', 'ring', 'shadow']) expect(mode).toContain(`${m}?.dispose(false, true);`);
  });

  it('#2 #3 #4 #5: the ring faces the camera; the rival serves and swings; the bodies shuffle', () => {
    expect(mode).toContain('ring.billboardMode = Mesh.BILLBOARDMODE_ALL;');
    expect(mode).toContain('SPORT_CLIP.tennisServe');
    expect(mode).toContain('SPORT_CLIP.tennisShuffleLeft');
    expect(mode).toMatch(/result === 'return'[\s\S]{0,400}rivalSwing\(/);
  });

  it('#11 #12 #17: the host draws the rally, the timing bar and the warm-up', () => {
    expect(host).toContain('RALLY');
    expect(host).toContain('hud.hitAt');
    expect(host).toContain('WARM-UP');
  });
});
