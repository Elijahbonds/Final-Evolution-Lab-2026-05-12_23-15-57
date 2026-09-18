// basketballTree — Mode 1 Phase 5: the basketball animation blend tree.
//
// One decision function, one wiring class. Every basketball state a live
// 1v1/3v3 player can be in maps to a clip + loop mode + fade time, so the
// blend tree reads the GAME (dribble/drive/gather/release/contact/defend),
// not just "run vs idle". All clip names resolve through clipResolver —
// the tree can never request a clip that doesn't exist (the test suite
// proves it against the live registry).
//
// FootPlant: plant-and-cut contact lock. When CourtMovement reports a
// plant, we capture the lead foot's world position and pin it with a
// two-bone IK controller for the plant window (~0.18s) while the body
// rotates around it — no foot-skate through the cut. Court is flat, so
// this is the whole IK scope for Mode 1 (deliberate).

import { Vector3 } from '@babylonjs/core';
import type { Mesh, Observer, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { plantLeg } from './FootPlanting';
import type { CharacterAnimator } from './CharacterAnimator';
import { rateFor, StrideRateFilter, strideRef } from '../core/StrideMatch';
import { boneNode, findBone } from './boneLookup';

// ── Blend tree ─────────────────────────────────────────────────────────────
export type BasketballAnimState =
  | 'idle_dribble' | 'speed_dribble' | 'walk_dribble' | 'sprint_dribble' | 'crossover' | 'crossover_right' | 'protect'   // DRIBBLE GEARS (2026-09-17): walk / jog / sprint loops
  | 'drive' | 'gather' | 'shot_release' | 'layup' | 'dunk'
  | 'contact_stagger' | 'defend_slide' | 'defend_slide_right' | 'defend_idle' | 'box_out'
  | 'defend_backpedal' | 'closeout' | 'defend_slide_hard' | 'defend_slide_hard_right'   // DEFENSE-LOOK (2026-09-17): the retreat, the closeout, the sat-down slide
  | 'watch'
  | 'floor'
  | 'celebrate' | 'dejected';

export interface AnimTreeInput {
  speed01: number;
  /**
   * The body's PLANAR SPEED in m/s, for stride matching (StrideMatch).
   *
   * speed01 is normalised and cannot drive a stride: a clip has to be paced against real ground speed or the feet
   * and the floor disagree. Optional, so a mode that has not been wired yet simply keeps the old fixed cadence.
   */
  speedMps?: number;
  crossover: boolean;
  /** WHICH WAY the ball went. The clip was hardwired to `bball_crossover_left`, so a crossover to the RIGHT — half
   *  of them — played the left-handed clip and the body went the opposite way to the ball. Optional and defaulting
   *  to left, exactly like `slideDir` below, so a mode that has not been wired yet behaves as it always did. */
  crossoverDir?: 'left' | 'right';
  /** MOVE PACE: the playback rate for the tree's own crossover state (the turbo's 1.35×); the beats take it in their opts. */
  moveRate?: number;
  nearestDefender: number;
  hasBall: boolean;
  shooting: boolean;
  dunking: boolean;
  driving: boolean;          // sprinting toward the hoop with the ball
  defending: boolean;        // possession === defense
  bracing: boolean;          // box-out held
  staggered: boolean;        // contact/ankle-break stun active
  /** ONEVONE-DEFENSE-LOGIC: which way the defender is sliding (body frame) — picks the slide clip. Default left. */
  slideDir?: 'left' | 'right';
  /** DEFENSE-LOOK (2026-09-17): moving AWAY from the man while facing him (beaten, dropping back) — the backpedal. */
  retreat?: boolean;
  /** Closing the last two metres on a catch — chop steps under a high hand. */
  closeout?: boolean;
  /** Sitting down on him (L2 / an AI on the ball inside two metres) — the hard slide. */
  intense?: boolean;
  /** On the floor (a posterized body) — held until the mode lifts it. */
  floored?: boolean;
  celebrating?: boolean;
  dejected?: boolean;
}

export interface AnimChoice { state: BasketballAnimState; clip: string; loop: boolean; fadeSec: number }

const CLIP_FOR: Record<BasketballAnimState, { clip: string; loop: boolean; fadeSec: number }> = {
  idle_dribble:    { clip: 'bball_dribble_idle', loop: true, fadeSec: 0.18 },
  speed_dribble:   { clip: 'bball_dribble_jog', loop: true, fadeSec: 0.14 },    // DRIBBLE GEARS: the jog (78_10), paced by the jog reference
  walk_dribble:    { clip: 'bball_dribble_walk', loop: true, fadeSec: 0.16 },   // the walking dribble (06_01) — a slowed run used to play here
  sprint_dribble:  { clip: 'bball_dribble_run', loop: true, fadeSec: 0.12 },    // the sprint (78_06), its own pace
  crossover:       { clip: 'bball_crossover_left', loop: false, fadeSec: 0.08 },
  crossover_right: { clip: 'bball_crossover_right', loop: false, fadeSec: 0.08 },
  protect:         { clip: 'bball_defend_stance', loop: true, fadeSec: 0.2 },
  drive:           { clip: 'run_forward', loop: true, fadeSec: 0.1 },
  gather:          { clip: 'dunk_charge_gather', loop: true, fadeSec: 0.08 },
  shot_release:    { clip: 'bball_shoot_jumper', loop: true, fadeSec: 0.06 },
  layup:           { clip: 'bball_layup_gather', loop: false, fadeSec: 0.08 },
  dunk:            { clip: 'dunk_launch', loop: false, fadeSec: 0.06 },
  contact_stagger: { clip: 'bball_contact_react', loop: false, fadeSec: 0.08 },   // 2026-09-17: a basketball bump, not the fighter's flinch (arms behind the back)
  defend_slide:    { clip: 'bball_defend_slide_left', loop: true, fadeSec: 0.16 },
  defend_slide_right: { clip: 'bball_defend_slide_right', loop: true, fadeSec: 0.16 },
  defend_idle:     { clip: 'bball_defend_stance', loop: true, fadeSec: 0.2 },
  box_out:         { clip: 'bball_defend_stance', loop: true, fadeSec: 0.12 },
  // DEFENSE-LOOK (2026-09-17). A defender who is BEATEN drops back with his chest still on the man (the backpedal — a
  // slide loop played backwards was what he did before, which reads as a man moonwalking); a defender CLOSING OUT on a
  // catch chops his feet under a high hand instead of running at the shooter with his arms down; and INTENSE D (L2, or
  // an AI sitting on the ball) slides sat down — the hard slide capture — not the ordinary stance loop.
  defend_backpedal: { clip: 'bball_defend_backpedal', loop: true, fadeSec: 0.14 },
  closeout:        { clip: 'bball_closeout', loop: true, fadeSec: 0.12 },
  defend_slide_hard: { clip: 'bball_defend_slide_hard_left', loop: true, fadeSec: 0.14 },
  defend_slide_hard_right: { clip: 'bball_defend_slide_hard_right', loop: true, fadeSec: 0.14 },
  // BIOMECH-HOOPS-WAVE1 (2026-09-08): a body with no ball that is NOT defending (the shooter watching his arc, the rival
  // after his release) stands and watches — it used to drop into the defensive slide stance (G5: the follow-through's
  // silhouette died into a crouch the moment the hold released).
  watch:           { clip: 'idle_stand', loop: true, fadeSec: 0.2 },
  floor:           { clip: 'karate_floor_hold', loop: true, fadeSec: 0.12 },
  celebrate:       { clip: 'bball_score_celebrate', loop: false, fadeSec: 0.26 },   // POLISH: the arms-up first key popped a wrist 0.7 m out of a stance at 0.15
  dejected:        { clip: 'football_tackled_fall', loop: false, fadeSec: 0.2 },
};

/** The single decision: game context in, clip choice out. Pure. */
export function chooseBasketballClip(i: AnimTreeInput): AnimChoice {
  let state: BasketballAnimState;
  if (i.floored) state = 'floor';
  else if (i.staggered) state = 'contact_stagger';
  else if (i.dunking) state = 'dunk';
  else if (i.shooting) state = 'shot_release';
  else if (i.celebrating) state = 'celebrate';
  else if (i.dejected) state = 'dejected';
  else if (i.defending) {
    state = i.bracing ? 'box_out'
      : i.closeout ? 'closeout'
      : i.speed01 > 0.2
        ? (i.retreat ? 'defend_backpedal'
          : i.intense ? (i.slideDir === 'right' ? 'defend_slide_hard_right' : 'defend_slide_hard')
          : (i.slideDir === 'right' ? 'defend_slide_right' : 'defend_slide'))
        : 'defend_idle';
  } else if (i.crossover) state = i.crossoverDir === 'right' ? 'crossover_right' : 'crossover';
  else if (i.driving && i.hasBall) state = 'drive';
  else if (i.speed01 > 0.15) state = i.hasBall ? (i.speed01 < 0.42 ? 'walk_dribble' : i.speed01 > 0.74 ? 'sprint_dribble' : 'speed_dribble') : 'drive';   // DRIBBLE GEARS: the loop follows the gear (walk 1.6 / jog 4.2 / sprint 6.4 m/s of 6.4)
  else if (i.nearestDefender < 1.4 && i.hasBall) state = 'protect';
  else state = i.hasBall ? 'idle_dribble' : 'watch';
  return { state, ...CLIP_FOR[state] };
}

/** A one-shot state that ran out must not re-fire while the input still names it: the input with that trigger cleared. */
function withoutTrigger(i: AnimTreeInput, state: BasketballAnimState): AnimTreeInput {
  switch (state) {
    case 'contact_stagger': return { ...i, staggered: false };
    case 'crossover': case 'crossover_right': return { ...i, crossover: false };
    case 'layup': return { ...i, shooting: false };
    case 'dunk': return { ...i, dunking: false };
    case 'celebrate': return { ...i, celebrating: false };
    case 'dejected': return { ...i, dejected: false };
    default: return i;
  }
}
/** States that may cut a beat in flight. */
const PRIORITY = new Set<BasketballAnimState>(['floor', 'contact_stagger', 'dunk']);

export interface TreeBeatOpts { fadeSec?: number; speedRatio?: number; onSettle?: () => void; /** Sit in this loop after the beat until the mode calls release() (a knockdown → the floor). */ settleTo?: { clip: string; fadeSec?: number; speedRatio?: number };
  /** BIOMECH-HOOPS-WAVE1: HOLD the beat's last frame when it runs out (an aerial clip in a flight — the dunk contest's
   *  playAir) until the mode's next beat / release(): the 0.35 s launch used to run out mid-air and settle into the run
   *  loop, the arms crossfading down through a T at the jam. */
  holdEnd?: boolean }
export interface TreeHoldOpts { fadeSec?: number; speedRatio?: number }

/**
 * The ONE owner of a basketball body (ONEVONE-DEFENSE-LOGIC, 2026-09-07 — the boards' / combat's discipline). The mode
 * feeds update() every frame and never calls animator.play:
 *   - loops are deduped per state (no per-frame restart);
 *   - a NON-loop state the tree chooses (crossover, stagger, layup, dunk, celebrate) plays ONCE with the tree's own
 *     onEnd and settles into the loop the input asks for at that moment — it used to run out and leave the body
 *     frozen in its last pose (Babylon stops the group) until the state changed;
 *   - beat(clip) is a mode-owned one-shot (block reach, steal reach, hit react, knockdown → floor) that settles the
 *     same way; hold(clip) is a mode-owned loop (the meter-paced jumpshot, the gather telegraph) until release();
 *   - a cut beat's end callback is ignored (token) — Babylon raises the end observable from stop().
 */
export class BasketballAnimTree {
  private current: BasketballAnimState | null = null;
  private last: AnimTreeInput | null = null;
  private override: { kind: 'beat' | 'hold'; clip: string; state: BasketballAnimState | null } | null = null;
  private token = 0;
  private settledState: BasketballAnimState | null = null;
  /** The stride rate for the loop that is running, smoothed so a cadence never stutters. */
  private strideFilter = new StrideRateFilter();
  private strideClip: string | null = null;
  constructor(private animator: Pick<CharacterAnimator, 'play' | 'setPlaybackScale'>) {}
  /** The stride references for THIS rig: a body running the CMU loops paces against their stride, not the authored one. */
  private get ref() { return strideRef(!!(this.animator as { clipNames?: Set<string> }).clipNames?.has('bball_mc_run')); }

  /** POLISH (2026-09-17): a loop state DWELLS. The choice is pure and per frame, so a defender whose reads sat on a
   *  threshold flipped closeout ↔ slide ↔ backpedal every other frame (measured: 20 flip-flops in six 3v3 possessions,
   *  each one a 0.12 s crossfade restarted), and a handler flickered protect ↔ idle at 1.4 m. A sibling loop now has
   *  to be asked for DWELL_SEC before it replaces the running one; the one-shots (a shot, a dunk, a stagger) still cut in
   *  at once, and so does leaving the group (defending → not). */
  private stateSince = 0;
  private static readonly DWELL_SEC = 0.22;
  private static readonly DWELL_GROUPS: ReadonlyArray<ReadonlySet<BasketballAnimState>> = [
    new Set(['defend_idle', 'defend_slide', 'defend_slide_right', 'defend_slide_hard', 'defend_slide_hard_right', 'defend_backpedal', 'closeout', 'box_out']),
    new Set(['idle_dribble', 'protect', 'speed_dribble', 'walk_dribble', 'sprint_dribble', 'drive', 'watch']),
  ];
  private sameGroup(a: BasketballAnimState | null, b: BasketballAnimState): boolean {
    return !!a && BasketballAnimTree.DWELL_GROUPS.some((g) => g.has(a) && g.has(b));
  }
  private bypassDwell(from: BasketballAnimState | null, to: BasketballAnimState, input: AnimTreeInput): boolean {
    return from === 'idle_dribble' && input.speed01 > 0.7 && ['speed_dribble', 'sprint_dribble', 'drive'].includes(to);
  }
  update(input: AnimTreeInput): BasketballAnimState {
    this.last = input;
    const raw = chooseBasketballClip(input);
    if (this.settledState && raw.state !== this.settledState) this.settledState = null;
    const c = this.settledState ? chooseBasketballClip(withoutTrigger(input, this.settledState)) : raw;
    if (this.override) {
      // a mode-owned hold is never interrupted; a beat yields only to a priority state
      const yields = this.override.kind === 'beat' && PRIORITY.has(c.state) && c.state !== this.override.state;
      if (!yields) return this.override.state ?? this.current ?? c.state;
    }
    const now = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
    if (c.state !== this.current && c.loop && this.sameGroup(this.current, c.state) && !this.bypassDwell(this.current, c.state, input) && now - this.stateSince < BasketballAnimTree.DWELL_SEC) return this.current!;   // the dwell
    if (c.state !== this.current) {
      this.current = c.state; this.stateSince = now;
      if (c.loop) {
        this.token++; this.override = null;
        // adopt the new state's stride rate rather than sliding from the old one
        const r0 = rateFor(c.state, input.speedMps ?? 0, this.ref);
        this.strideClip = c.loop ? c.clip : null;
        if (r0 !== null) this.strideFilter.set(r0);
        this.animator.play(c.clip, { loop: true, fadeSec: c.fadeSec, speedRatio: r0 ?? 1 });
      } else { this.strideClip = null; const isMove = c.state === 'crossover' || c.state === 'crossover_right'; this.playBeat(c.clip, { fadeSec: isMove && (input.moveRate ?? 1) > 1 ? c.fadeSec * 0.6 : c.fadeSec, speedRatio: isMove ? input.moveRate ?? 1 : 1 }, c.state); }   // MOVE PACE
    }
    // STRIDE MATCHING, every frame. The loop is only (re)played on a STATE CHANGE — which is what keeps it stable —
    // so the rate has to be set on the RUNNING animation instead, or a per-frame play() would restart the clip every
    // frame. Only locomotion states have a rate; a shot or a knockdown returns null and is left alone.
    if (this.strideClip && !this.override && input.speedMps !== undefined) {
      const want = rateFor(c.state, input.speedMps, this.ref);
      if (want !== null) this.animator.setPlaybackScale(this.strideClip, this.strideFilter.step(want, 1 / 60));
    }
    return c.state;
  }

  /** A mode-owned one-shot. Settles into the tree's choice (or `settleTo`) on its natural end. */
  beat(clip: string, opts: TreeBeatOpts = {}): void { this.playBeat(clip, opts, null); }

  /** A mode-owned loop the tree never interrupts — until release(). */
  hold(clip: string, opts: TreeHoldOpts = {}): void {
    this.token++;
    this.override = { kind: 'hold', clip, state: null };
    this.current = null;
    this.animator.play(clip, { loop: true, fadeSec: opts.fadeSec ?? 0.12, speedRatio: opts.speedRatio ?? 1 });
  }

  /** End a beat / hold now and settle into the tree's choice. */
  release(): void {
    if (!this.override) return;
    this.token++;
    this.override = null; this.current = null;
    if (this.last) this.update(this.last);
  }

  /** End a HOLD now (a beat in flight is left to settle on its own — a steal's reach plays out through the reset). */
  releaseHold(): void { if (this.override?.kind === 'hold') this.release(); }

  /** A beat or hold is in flight. */
  get busy(): boolean { return this.override !== null; }
  /** The clip the mode owns right now, if any. */
  get held(): string | null { return this.override?.clip ?? null; }
  get state(): BasketballAnimState | null { return this.override?.state ?? this.current; }

  reset(): void { this.token++; this.override = null; this.current = null; this.settledState = null; }

  private playBeat(clip: string, opts: TreeBeatOpts, state: BasketballAnimState | null): void {
    const tok = ++this.token;
    this.override = { kind: 'beat', clip, state };
    this.animator.play(clip, {
      loop: false, fadeSec: opts.fadeSec ?? 0.1, speedRatio: opts.speedRatio ?? 1, restart: true,   // POLISH: 0.08 → 0.10 — the reach and hand-up beats out of a stance popped a wrist 1 m in a frame
      onEnd: () => {
        if (this.token !== tok) return;   // cut by a newer beat / hold / release / reset
        if (opts.holdEnd) { opts.onSettle?.(); return; }   // the pose holds where the clip left it; the override stands until the next beat / release
        this.override = null; this.current = null;
        if (state) this.settledState = state;
        opts.onSettle?.();
        if (opts.settleTo) this.hold(opts.settleTo.clip, opts.settleTo);
        else if (this.last) this.update(this.last);
      },
    });
  }
}

// ── Foot plant (two-bone IK contact lock) ──────────────────────────────────
export const PLANT_LOCK_SEC = 0.18;

export class FootPlant {
  // 2026-09-03: BoneIKController wrote bone matrices that this linked-node rig
  // decomposed into non-uniform scale (measured 0.94/0.85/0.91 — the Closet
  // "explosion"). The pin is now the node-space two-bone solver, applied in
  // onAfterAnimationsObservable so the clip's own leg pose is what gets pinned
  // (the harness updates modes BEFORE the clips evaluate).
  private lock: { foot: 'Left' | 'Right'; pin: Vector3; left: number; obs: Observer<Scene> } | null = null;

  constructor(private skeleton: Skeleton, private mesh: Mesh) {}

  /** Which foot is planted (the one currently lower/forward) — captured at
   *  plant start so the cut rotates around a fixed contact point. The factory
   *  argument is kept for callers; no scene node is needed any more. */
  plant(_sceneFootTarget?: (name: string) => TransformNode): void {
    if (this.lock) return;
    const lf = findBone(this.skeleton, 'LeftFoot');
    const rf = findBone(this.skeleton, 'RightFoot');
    if (!lf || !rf) return;
    const ly = lf.getTransformNode()?.getAbsolutePosition().y ?? 0;
    const ry = rf.getTransformNode()?.getAbsolutePosition().y ?? 0;
    const side = ly <= ry ? 'Left' : 'Right';
    const hip = findBone(this.skeleton, `${side}UpLeg`)?.getTransformNode();
    const knee = findBone(this.skeleton, `${side}Leg`)?.getTransformNode();
    const ankle = (side === 'Left' ? lf : rf).getTransformNode();
    if (!hip || !knee || !ankle) return;
    ankle.computeWorldMatrix(true);
    const pin = ankle.getAbsolutePosition().clone();
    const scene = this.mesh.getScene();
    const target = new Vector3();
    const obs = scene.onAfterAnimationsObservable.add(() => {
      ankle.computeWorldMatrix(true);
      target.set(pin.x, ankle.getAbsolutePosition().y, pin.z);   // the clip keeps its height
      plantLeg(hip, knee, ankle, target, this.mesh.forward);
    });
    this.lock = { foot: side, pin, left: PLANT_LOCK_SEC, obs };
  }

  /** Advance the lock window; the pin itself runs after animations. */
  update(dt: number): void {
    if (!this.lock) return;
    this.lock.left -= dt;
    if (this.lock.left <= 0) this.release();
  }

  release(): void {
    if (!this.lock) return;
    this.mesh.getScene().onAfterAnimationsObservable.remove(this.lock.obs);
    this.lock = null;
  }

  get active(): boolean { return this.lock !== null; }
  dispose(): void { this.release(); }
}

/** DEFENSE-LOOK (2026-09-17): is this body moving AWAY from the man it faces? (planar; a standing body is not retreating) */
export function retreatFor(pos: { x: number; z: number }, vel: { x: number; z: number }, man: { x: number; z: number } | null): boolean {
  if (!man) return false;
  const sp = Math.hypot(vel.x, vel.z); if (sp < 0.4) return false;
  const dx = man.x - pos.x, dz = man.z - pos.z; const dl = Math.hypot(dx, dz); if (dl < 1e-3) return false;
  return (vel.x * dx + vel.z * dz) / (sp * dl) < -0.45;
}
/** …and is it closing the last stretch ON the man (a closeout: fast, toward him, inside 2.6 m)? */
export function closeoutFor(pos: { x: number; z: number }, vel: { x: number; z: number }, man: { x: number; z: number } | null, speed01: number): boolean {
  if (!man || speed01 < 0.45) return false;
  const dx = man.x - pos.x, dz = man.z - pos.z; const dl = Math.hypot(dx, dz); if (dl < 0.9 || dl > 2.6) return false;
  const sp = Math.hypot(vel.x, vel.z); if (sp < 0.4) return false;
  return (vel.x * dx + vel.z * dz) / (sp * dl) > 0.6;
}
