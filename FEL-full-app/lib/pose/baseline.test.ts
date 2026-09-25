// THE BASELINE, pinned (movement play, phase 1, 2026-09-24). These are KNOWN-BAD facts about TODAY's body mapper
// (lib/input/poseControl.ts) replayed on the synthetic streams — the two misfires that matter most, confirmed in numbers
// by scripts/body/baseline.mts (report: ~/Claude/outbox/finish-release/movementplay/p1-baseline/BASELINE.md).
//
// They pass today BECAUSE the mapper is wrong. Phase 3 (per-mode body profiles) is expected to break both: when it
// does, flip each `it` to the fixed behaviour written in its comment rather than deleting it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { replay, dunkRead, duelRead, restStick, stickYStats, slamWindow, uprightFrame, realAt, TAKEOFF_ECHO_MS, LATE_JUMP_MS, LINE_SEC_MIN, type Emitted, type ReplayOptions } from './baseline';
import type { PoseFixture } from './synth';
import type { FelInput } from '../babylon/core/InputBus';
import { KEY_SPACE_DOWN } from '../babylon/core/StartWake';
import { EASTBAY_TIMING } from '../babylon/anim/authored/timing';

const load = (name: string) => JSON.parse(readFileSync(join(__dirname, '__fixtures__', `${name}.json`), 'utf8')) as PoseFixture;
const still = load('stand_still');
/** The owner's own stand (same body, same camera): his takes that never stand still calibrate on it, as the report does. */
const ownerStand: ReplayOptions = { calibration: 'stand', stand: still.frames[uprightFrame(still)] };

describe('BASELINE — today\'s poseControl on the streams (KNOWN-BAD: phase 3 flips these)', () => {
  it('KNOWN-BAD: every body dunk launches on the rise out of the dip, and the jump itself is its A — dropped or refused, never made', () => {
    // Phase 3: the launch waits for the real take-off, the slam is the arm's strike against the apex, and these are made.
    // HOTFIX (2026-09-24): both dunk modes now drop an A inside TAKEOFF_ECHO_MS of the launch as the take-off's own (the
    // keyboard's Space release and a pad's A on the run are one press, not a slam). The body's jump A is the same kind of echo
    // — its R2 → 0 and its A are one jump — so when it lands inside that window it is dropped, and the body has no slam left
    // (or a stray later A, refused TOO EARLY). When it lands later it is still the slam, refused TOO EARLY as before.
    const w = slamWindow(0);
    const takes: [string, ReplayOptions, 'echo' | 'slam'][] = [
      ['jump_two_foot_high', { calibration: 'stand' }, 'echo'],   // their own upright stand
      ['jump_one_foot_runup', { calibration: 'stand' }, 'echo'],
      ['jumpshot', { calibration: 'stand' }, 'echo'],
      ['dunk_elijah_two_foot', ownerStand, 'slam'],                // the run-up never stands still
    ];
    for (const [name, opt, jumpA] of takes) {
      const fx = load(name);
      const d = dunkRead(replay(fx, opt).events);
      const jump = fx.gt.jumps.find((j) => j.landing.t + 100 > d.launch!) ?? fx.gt.jumps[0];
      const oneFrame = 1000 / fx.settings.synth.fps;
      // R2 (the squat) back to 0 is the launch — from a frame captured no later than the take-off frame: the feet are down
      expect(d.launchBy, name).toBe('R2 released');
      expect(d.launchT, name).toBeLessThanOrEqual(jump.takeoff.t + oneFrame);
      // the first A of the flight is the hip rise of the jump itself, within 200 ms of the take-off …
      const first = jumpA === 'echo' ? d.echo : d.slam;
      expect(first, name).not.toBeNull();
      expect(Math.abs(first!.at - jump.takeoff.t), name).toBeLessThan(200);
      if (jumpA === 'echo') {
        // … inside the echo window of the launch: the take-off's own, not the slam
        expect(d.echo!.kind, name).toBe('takeoff');
        expect(d.echo!.afterLaunchMs, name).toBeLessThan(TAKEOFF_ECHO_MS);
        expect(['no slam', 'too early'], name).toContain(d.verdict);
      } else {
        // … past it: committed as the slam, long before even the buffer that holds a press for the window
        expect(d.echo, name).toBeNull();
        expect(d.slam!.clip, name).toBeLessThan(w.openAt - w.holdSec);
        expect(d.verdict, name).toBe('too early');
        expect(d.tooEarlyMs!, name).toBeGreaterThan(500);
        expect(d.missWhy, name).toBe('THREW IT AT THE IRON TOO EARLY');
      }
      expect(d.made, name).toBe(false);
    }
  });

  it('KNOWN-BAD: standing still reads as the L stick held full back (y = +1), and forward (y < 0) is unreachable', () => {
    // Phase 3: the resting stick is (0, 0), and a real forward lean or a run in place can push y below 0.
    // (the mapper writes a centred x as −0: `-Math.sign(0) * 0`)
    const atRest = (r: ReturnType<typeof replay>) => { const s = restStick(r)!; return { x: Math.abs(s.x), y: s.y }; };
    const rest = replay(still, { calibration: 'stand' });
    expect(atRest(rest)).toEqual({ x: 0, y: 1 });
    expect(stickYStats(rest).shareAtLevel).toBe(1);              // the whole take, standing, at full back stick
    for (const name of ['run_in_place', 'shuffle_lateral', 'jump_two_foot_high']) {
      const r = replay(load(name), { calibration: 'stand' });
      expect(atRest(r), name).toEqual({ x: 0, y: 1 });
      expect(stickYStats(r).min, name).toBeGreaterThanOrEqual(0);   // running, stepping, jumping: never forward
    }
  });
});

// ── the reads run the modes' own slam code (HOTFIX 2026-09-24, core/slamPress + core/timingPress) ─────────────────────
// A stream is what reached the mode's onInput, in order: a keyboard Space is R 0.01 on the way down, its depth while held,
// and R 0 then an A TAGGED `src: 'space'` on the same instant when it comes up (InputBus.onKey). These are not KNOWN-BAD pins:
// they are the fix.
const ev = (at: number, e: FelInput): Emitted => ({ e, at, frame: 0, t: at });
const A = (at: number, pressed = true) => ev(at, { t: 'button', btn: 'A', pressed });
const R = (at: number, value: number) => ev(at, { t: 'trigger', side: 'R', value });
/** The keyboard's Space coming up: R 0, then the Space's own A. */
const spaceUp = (at: number) => [R(at, 0), ev(at, { t: 'button', btn: 'A', pressed: true, src: 'space' })];
/** App ms of flight-clock `clip` for a flight launched at `launch` (the hang's slow-mo included, as the reads count it). */
const onClip = (launch: number, clip: number) => launch + realAt(clip) * 1000;

describe('the dunk reads mirror the fixed modes', () => {
  const beat = EASTBAY_TIMING.extend;
  it("keyboard: Space up to take off, J on the beat — the Space's own A is dropped and the J is made (DunkMode)", () => {
    const L = 900;
    const d = dunkRead([R(0, KEY_SPACE_DOWN), R(100, 0.09), R(800, 0.73), ...spaceUp(L), A(onClip(L, beat)), A(onClip(L, beat) + 60, false)]);
    expect(d.launchBy).toBe('R2 released');
    expect(d.echo).toMatchObject({ kind: 'space', afterLaunchMs: 0 });
    expect(d.verdict).toBe('in window');
    expect(d.made).toBe(true);
  });
  it('pad: A on the run is the take-off, not the slam at clip 0; the A on the beat is made (DunkMode)', () => {
    const L = 600;
    const d = dunkRead([R(0, 1), A(L), A(L + 90, false), A(onClip(L, beat))]);
    expect(d.launchBy).toBe('A on the run');
    expect(d.echo).toMatchObject({ kind: 'takeoff', afterLaunchMs: 0 });
    expect(d.slam!.clip).toBeCloseTo(beat, 6);
    expect(d.made).toBe(true);
  });
  it('a real early A is still the slam and still refused TOO EARLY; the A on the beat after it is ignored (DunkMode)', () => {
    const L = 600;
    const d = dunkRead([R(0, 1), R(L, 0), A(L + 300), A(onClip(L, beat))]);
    expect(d.echo).toBeNull();
    expect(d.verdict).toBe('too early');
    expect(d.made).toBe(false);
    expect(d.notes.some((n) => n.what === 'A: ignored — the first press decides')).toBe(true);
  });
  it("duel, keyboard: the Space's own A is dropped and the J on the beat hits", () => {
    const L = 900;
    const d = duelRead([R(0, KEY_SPACE_DOWN), R(100, 0.09), ...spaceUp(L), A(onClip(L, beat))]);
    expect(d.presses.map((p) => p.kind)).toEqual(['echo', 'clean']);
    expect(d.hit).toBe(true);
    expect(d.tooEarlyMs).toBeNull();
  });
  it('duel: A on the run is the jump now (the hint says "tap jump"), dropped as the take-off; the A on the beat hits', () => {
    const L = 600;
    const d = duelRead([R(0, 1), A(L), A(onClip(L, beat))]);
    expect(d.launchBy).toBe('A on the run');
    expect(d.presses.map((p) => p.kind)).toEqual(['echo', 'clean']);
    expect(d.hit).toBe(true);
  });
  it('the jump tapped just after the line launched the run is not the slam, in both reads', () => {
    const line = LINE_SEC_MIN * 1000, late = line + 150;
    const stream = [R(0, 1), R(line + 50, 1), A(late), A(onClip(line, beat))];
    const d = dunkRead(stream);
    expect(d.launchBy).toBe('the line (est.)');
    expect(d.echo).toMatchObject({ kind: 'late', afterLaunchMs: 150 });
    expect(d.made).toBe(true);
    const u = duelRead(stream);
    expect(u.launchBy).toBe('the line (est.)');
    expect(u.presses.map((p) => p.kind)).toEqual(['echo', 'clean']);
    expect(u.hit).toBe(true);
    // …and only inside LATE_JUMP_MS of it: later, it is a real press (and far too early)
    const t = dunkRead([R(0, 1), R(line + 50, 1), A(line + LATE_JUMP_MS + 50), A(onClip(line, beat))]);
    expect(t.echo).toBeNull();
    expect(t.verdict).toBe('too early');
  });
  it('Space held to the line and let go on the beat is the slam, in both reads (as before the hotfix)', () => {
    const line = LINE_SEC_MIN * 1000;
    const stream = [R(0, KEY_SPACE_DOWN), R(100, 0.09), R(line + 50, 0.9), ...spaceUp(onClip(line, beat))];
    const d = dunkRead(stream);
    expect(d.echo).toBeNull();
    expect(d.verdict).toBe('in window');
    expect(d.made).toBe(true);
    const u = duelRead(stream);
    expect(u.presses.map((p) => p.kind)).toEqual(['clean']);
    expect(u.hit).toBe(true);
  });
  it('duel: the first press decides — a too-early A is refused at the window, and the re-press on the beat is spent', () => {
    const L = 600;
    const d = duelRead([R(0, 1), R(L, 0), A(L + 300), A(onClip(L, beat))]);
    expect(d.presses.map((p) => p.kind)).toEqual(['held', 'spent']);
    expect(d.hit).toBe(false);
    expect(d.tooEarlyMs).toBeGreaterThan(0);
  });
  it("duel, the owner's two-foot dunk: no longer \"hit\" on a late re-press (BASELINE.md:244)", () => {
    // HEAD scored it on its fourth A, after the landing, when the body came back into view
    const d = duelRead(replay(load('dunk_elijah_two_foot'), { calibration: 'stand' }).events);
    expect(d.presses[0].kind).toBe('echo');                  // the jump's own A, 17 ms after the launch
    expect(d.presses[1].kind).toBe('held');                  // the first real A: the verdict, far too early
    expect(d.presses.slice(2).every((p) => p.kind === 'spent')).toBe(true);
    expect(d.hit).toBe(false);
  });
});
