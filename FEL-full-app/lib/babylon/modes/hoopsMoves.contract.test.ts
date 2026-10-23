// hoops-moves (owner 2026-10-20): the 1v1 / 3v3 hooks for the round-2 handle items, and the glue they call (modes/hoopsFlow).
//   · the outside hand when guarded is stepped every frame on MY carry, after the carry's update, with the nearest LIVE defender — a
//     quiet carry path (runMove), never a requestMove (a chain move that reads a defender and rolls), never a roll of its own;
//   · my HandleHost carries the combo flow (anim/comboFlow) and the mode shows its label;
//   · the spin picks its left-hand body by the ball's hand, and every body that spins has it.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PlayerGuardHand, comboBanner, ComboFlow, spinClipFor } from './hoopsFlow';
import { AI_HAND_DWELL_SEC } from '../core/AiBallHand';
import { GUARD_RANGE_M } from '../core/GuardHand';
import { stickMoveFor, type StickGesture } from '../core/StickHandle';
import { requestMove } from '../anim/handleMotion';
import { spinStartHand } from '../anim/leftMoveTwins';

const one = readFileSync('lib/babylon/modes/OneVOneMode.ts', 'utf8');
const three = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');
const glue = readFileSync('lib/babylon/modes/hoopsFlow.ts', 'utf8');

describe('the modes\' hooks', () => {
  for (const [name, src, tag] of [['1v1', one, '1V1'], ['3v3', three, '3V3']] as const) {
    it(`${name}: the guard hand is stepped once a frame on my carry with the nearest live defender, and the combo label is shown`, () => {
      expect(src.match(/guardHand\.step\(/g)?.length, name).toBe(1);
      const at = src.indexOf('guardHand.step('); const line = src.slice(src.lastIndexOf('\n', at), src.indexOf('\n', at));
      expect(line).toContain(`'${tag}'`);
      expect(line).toMatch(/!shooting && !dunking && !finish && !gather && !spin && !pausedDribble && !posting/);
      expect(line).toMatch(new RegExp(`comboBanner\\(meFlow, \\(t, ms\\) => bannerFlash\\(ctx, t, ms\\), '${tag}'\\)`));
      expect(line).toMatch(name === '1v1' ? /foeStunSec === 0 && !foeFloored \? foe\.root\.position : null/ : /nearestLiveFoe\(\)/);
      // after the carry's own update this frame (the stick reads the hand next)
      expect(src.indexOf('guardHand.step(')).toBeGreaterThan(src.indexOf(name === '1v1' ? 'meCarry?.update(dt, drib.speed01' : 'for (const [b, c] of carries) c.update('));
    });
    it(`${name}: my HandleHost carries the flow; the spin's body follows the ball's hand; the left spin twin is made at spawn`, () => {
      expect(src).toMatch(/flow: meFlow,/);
      expect(src).toMatch(/: spinClipFor\((meCarry, me\.animator|carries\.get\(me\), me\.char\.animator)\)/);   // the carry, not its hand: spinStartHand
      expect(src).toMatch(/leftMoveTwins\((me\.animator, me\.skeleton|char\.animator, char\.skeleton)\);/);
    });
  }
  it('the glue crosses on the carry — no requestMove, no roll, no odds', () => {
    const body = glue.slice(glue.indexOf('export class PlayerGuardHand'), glue.indexOf('export function comboBanner'));
    expect(body).toMatch(/carry\.runMove\('crossover', \{ pace: 1 \}\)/);
    expect(body).not.toMatch(/requestMove\(|roll\(|Math\.random|resolveHandleMove/);
  });
});

describe('PlayerGuardHand on a carry', () => {
  const carry = () => { const c = { hand: 'Right' as 'Left' | 'Right', move: null as null | object, runs: 0, runMove: vi.fn(() => { c.hand = c.hand === 'Right' ? 'Left' : 'Right'; c.runs++; return true; }) }; return c; };
  // me at the origin facing +z: +x is my LEFT on screen? athleteRight(yaw 0) — the defender is put on whichever side the carry's hand is
  const me = { position: { x: 0, z: 0 }, rotation: { y: 0 } };
  it('a defender on my ball side within reach: the ball crosses away after the dwell; out of range or on the other side: nothing', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    for (const dx of [0.8, -0.8]) {
      const c = carry(); const g = new PlayerGuardHand();
      let crossedAt = -1;
      for (let f = 1; f <= 120 && crossedAt < 0; f++) if (g.step(1 / 60, c as never, me, { x: dx, z: 0.6 }, true, 'T')) crossedAt = f / 60;
      // one of the two sides is the ball side: there the hand crosses; on the other it was already away from him
      if (crossedAt > 0) { expect(crossedAt).toBeCloseTo(AI_HAND_DWELL_SEC, 1); expect(c.runMove).toHaveBeenCalledWith('crossover', { pace: 1 }); expect(g.crosses).toBe(1); }
      else expect(c.runs).toBe(0);
    }
    const far = carry(), g2 = new PlayerGuardHand();
    for (let f = 0; f < 120; f++) for (const dx of [0.8, -0.8]) g2.step(1 / 60, far as never, me, { x: dx * (GUARD_RANGE_M + 0.5), z: 0 }, true, 'T');
    expect(far.runs).toBe(0);
    const none = carry(), g3 = new PlayerGuardHand();
    for (let f = 0; f < 120; f++) g3.step(1 / 60, none as never, me, null, true, 'T');
    expect(none.runs).toBe(0);
  });
  it('my move running holds it (the carry\'s move), and not dribbling holds it', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    for (const dx of [0.8, -0.8]) {
      const busy = carry(); busy.move = { name: 'crossover' }; const g = new PlayerGuardHand();
      for (let f = 0; f < 120; f++) g.step(1 / 60, busy as never, me, { x: dx, z: 0.6 }, true, 'T');
      const held = carry(), g2 = new PlayerGuardHand();
      for (let f = 0; f < 120; f++) g2.step(1 / 60, held as never, me, { x: dx, z: 0.6 }, false, 'T');
      expect(busy.runs + held.runs).toBe(0);
    }
  });
  it('exactly one of the two sides is the ball side (the read is the athlete\'s, not the screen\'s)', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const results = [0.8, -0.8].map((dx) => { const c = carry(); const g = new PlayerGuardHand(); for (let f = 0; f < 120; f++) g.step(1 / 60, c as never, me, { x: dx, z: 0.6 }, true, 'T'); return c.runs; });
    expect(results.filter((n) => n > 0).length).toBe(1);
  });
});

describe('comboBanner / spinClipFor', () => {
  it('shows the flow\'s label once', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const f = new ComboFlow(() => 0); const shown: string[] = [];
    f.press({ move: 'hesi', runningK: null, runningName: null, cutIn: false });
    f.press({ move: 'crossover', runningK: 0.2, runningName: 'hesi', cutIn: true });
    comboBanner(f, (t) => shown.push(t), 'T'); comboBanner(f, (t) => shown.push(t), 'T');
    expect(shown).toEqual(['HESI CROSS']);
  });
  it('the left twin when the spin\'s ball starts in the left hand and the body has it; the plain spin otherwise', () => {
    const has = { groups: new Map([['bball_spin', 1], ['bball_spin_left', 1]]) }, without = { groups: new Map([['bball_spin', 1]]) };
    const held = (hand: 'Left' | 'Right') => ({ hand, move: null });
    expect(spinClipFor(held('Left'), has)).toBe('bball_spin_left');
    expect(spinClipFor(held('Right'), has)).toBe('bball_spin');
    expect(spinClipFor(held('Left'), without)).toBe('bball_spin');
    expect(spinClipFor(undefined, has)).toBe('bball_spin');
    // thrown out of a running move (the rotation's entry flick, a between still in flight): the body of the hand the ball is GOING to
    expect(spinClipFor({ hand: 'Right', move: { endHand: 'left' } }, has)).toBe('bball_spin_left');
    expect(spinClipFor({ hand: 'Left', move: { endHand: 'right' } }, has)).toBe('bball_spin');
  });
  it('the spin\'s body names the hand requestMove starts its ball path from — every case, against the renderer itself', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    for (const hand of ['Left', 'Right'] as const) for (const running of [null, 'left', 'right'] as const) {
      const carry = { hand, move: running ? { name: 'between_legs', endHand: running, k: 0.3, t: 0.1, cutIn: null } : null, runMove: () => true, queueMove: () => true };
      const r = requestMove({ carry: carry as never, beat: () => {} }, { move: 'spin', decide: { kind: 'none' }, clip: null, path: 'spin' });
      expect(spinStartHand(carry as never), `${hand} ${running}`).toBe(r.startHand === 'left' ? 'Left' : 'Right');
    }
  });
});

// THE FOUR NEW MOVES (owner 2026-10-20: "in-and-out, snatch-back, hesi-cross, and the spin from the left hand"). No new binding: each is
// reached from the #240 Pro Stick map as it stands (InputBus / StickHandle / HandleSystem / modeVerbs untouched) — pinned here from BOTH
// ball hands, so a later remap that drops one fails by name.
describe('the round-2 moves reach the stick from either hand (no new binding)', () => {
  const flick = (x: number, y: number): StickGesture => ({ kind: 'flick', dir: 'up', dir8: 'up', x, y });
  const read = (hand: 'Left' | 'Right', escape = false) => ({ speed01: 0.4, pressured: true, sprint: escape, hand, escape });
  for (const hand of ['Right', 'Left'] as const) {
    const toward = hand === 'Right' ? 1 : -1, s = hand === 'Right' ? 'right' : 'left', o = hand === 'Right' ? 'left' : 'right';
    it(`ball in the ${hand} hand`, () => {
      expect(stickMoveFor(flick(0, -1), read(hand))).toEqual({ move: 'in_and_out', side: s });   // UP: the in-and-out, on the ball's side
      expect(stickMoveFor(flick(0, 1), read(hand, true))).toEqual({ move: 'snatchback', side: o });   // R2 + DOWN: the snatch-back, it crosses
      expect(stickMoveFor(flick(0, 1), read(hand))?.move).toBe('stepback');   // DOWN without R2 stays the step-back (#240)
      // the hesi-cross: TOWARD (the hesi), then UP-AWAY (the crossover) in the hesi's float — the combo window flows it (anim/comboFlow)
      expect(stickMoveFor(flick(toward, 0), read(hand))?.move).toBe('hesi');
      expect(stickMoveFor(flick(-toward * 0.7, -0.7), read(hand))).toEqual({ move: 'crossover', side: o });
      expect(stickMoveFor({ kind: 'sweep', sign: 1 }, read(hand))?.move).toBe('spin');   // ROTATE: the spin, its body by the hand (spinClipFor)
    });
  }
});
