// StrikeSystem — Mode 2 Phase 3: strikes with real frame data, cancel-window
// combos, and a weapon-attachment layer. One state machine for EVERY
// combat expression (empty hand, staff, blade…) — swapping the weapon swaps
// the moveset table and the hand prop, never the logic.
//
//   Frame data — every move is startup → active → recovery. Hits only
//   register during active. READABILITY RULE: no move may start up in
//   under 100ms (enforced by validateMoveset — a strike you can't see
//   coming is a design bug, not a difficulty setting).
//   Cancel windows — a strike can chain into a listed follow-up during a
//   window that opens at active-end and runs into recovery. Mashing early
//   buffers the input (gameFeel's lesson) so chains feel intentional, not
//   dropped.
//   WeaponRig — attaches a (procedural) weapon mesh to the RightHand bone
//   and binds its moveset. Same fighter, same state machine, new identity.

import { MeshBuilder, StandardMaterial, Color3, Vector3 } from '@babylonjs/core';
import type { Mesh, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import type { AttackDef } from './FightCore';
import { boneNode, findBone } from '../anim/boneLookup';
import { MOVES, STRIKE_TIMING, attackFromMove, type HordeMove } from './HordeDynamics';   // phase 4: the book

// ── Moves with frame data ──────────────────────────────────────────────────
export interface CombatMove {
  atk: AttackDef;             // damage/range/guard economics (FightCore)
  startupSec: number;
  activeSec: number;
  recoverySec: number;
  cancelInto: string[];       // move ids this can chain into — '*' = any (the Storm string rule, phase 4)
  cancelWindowSec: number;    // window after active-end (ignored under '*': the window runs to the end of recovery)
  /** Phase 4: the cancel POINT (s from the press). Under '*' a press from here on cancels into the next link; before it,
   *  the press waits. Defaults to active-end. */
  cancelAtSec?: number;
  /** Phase 5: the book's launcher / air-link / slam flags, so a StrikeSystem mode can lift a body the way VS does. */
  launch?: boolean; air?: boolean; slam?: boolean;
  weight: 'light' | 'medium' | 'heavy' | 'finisher';
  tags: string[];             // stance gating (StanceSystem.moveTags)
}

export const MIN_STARTUP_SEC = 0.1;      // the readability floor

/** How long a press waits for the game to be able to take it. The horde measured its way to 0.4 s (HordeDynamics
 *  QUEUE_SEC) and this is the same number for the same reason: it has to outlive a whole swing, not a fraction of
 *  one, or the queue only serves presses that were nearly late enough to work anyway. */
export const QUEUE_MS = 400;

/** Design-table lint: no unreadable strikes, no cancel-into-self loops
 *  that never end, cancel targets must exist. */
export function validateMoveset(moves: Record<string, CombatMove>): string[] {
  const errs: string[] = [];
  for (const [id, m] of Object.entries(moves)) {
    if (m.startupSec < MIN_STARTUP_SEC) errs.push(`${id}: startup ${m.startupSec}s < ${MIN_STARTUP_SEC}s (unreadable)`);
    if (m.activeSec <= 0) errs.push(`${id}: no active frames`);
    for (const c of m.cancelInto) if (!moves[c]) errs.push(`${id}: cancels into unknown "${c}"`);
  }
  return errs;
}

// ── Strike instance state machine ──────────────────────────────────────────
export type StrikePhase = 'startup' | 'active' | 'recovery' | 'done';

export class StrikeInstance {
  phase: StrikePhase = 'startup';
  private t = 0;
  private hitRegistered = false;

  constructor(public move: CombatMove) {}

  /** Advance; returns true on the frame the ACTIVE window opens (the
   *  impact-check moment for the mode). */
  update(dt: number): boolean {
    this.t += dt;
    const m = this.move;
    if (this.phase === 'startup' && this.t >= m.startupSec) {
      this.phase = 'active'; return true;
    }
    if (this.phase === 'active' && this.t >= m.startupSec + m.activeSec) this.phase = 'recovery';
    if (this.phase === 'recovery' && this.t >= m.startupSec + m.activeSec + m.recoverySec) this.phase = 'done';
    return false;
  }

  /** Can this strike be canceled into `nextId` right now? Window: from
   *  active-end through cancelWindowSec of recovery. */
  canCancelInto(nextId: string): boolean {
    if (this.move.cancelInto.includes('*')) {
      // THE STRING RULE (phase 4): past the cancel point every move is a link, until the swing is done. Measured before it:
      // a mash of one button on showdown / duel produced 8 swings of 40 presses, because jab could only cancel into kick
      // or heavy and a heavy into nothing.
      if (this.phase === 'done') return false;
      return this.t >= (this.move.cancelAtSec ?? this.move.startupSec + this.move.activeSec);
    }
    if (!this.move.cancelInto.includes(nextId)) return false;
    if (this.phase !== 'recovery') return false;
    const cancelStart = this.move.startupSec + this.move.activeSec;
    return this.t <= cancelStart + this.move.cancelWindowSec;
  }
  /** Phase 4: ms of this swing still to run (the queue outlives the whole swing under the string rule). */
  get remainingMs(): number { const m = this.move; return Math.max(0, (m.startupSec + m.activeSec + m.recoverySec - this.t) * 1000); }

  get inCancelWindow(): boolean {
    if (this.phase !== 'recovery') return false;
    return this.t <= this.move.startupSec + this.move.activeSec + this.move.cancelWindowSec;
  }

  /** True while the strike can still register its hit (active frames,
   *  once). consumeHit() marks it spent. */
  get hitLive(): boolean { return this.phase === 'active' && !this.hitRegistered; }
  consumeHit(): void { this.hitRegistered = true; }
}

/** Owns one fighter's strike state: current move, buffered next input,
 *  cancel-window chaining. Modes feed intents; this answers cleanly. */
export class StrikeController {
  current: StrikeInstance | null = null;
  private buffered: string | null = null;
  private bufferUntil = 0;

  constructor(private moveset: Record<string, CombatMove>) {}

  /**
   * Request a strike. If mid-recovery inside a cancel window, chains. Otherwise the press is QUEUED.
   *
   * THE PRESS USED TO DIE BEFORE THE SWING ENDED (measured 2026-09-19). The buffer expired 140 ms after the PRESS,
   * and it was only ever consumed once the current strike reached `done`. A fists jab runs 0.42 s, so a press at the
   * start of a swing was discarded 280 ms before anything could accept it, while a press in the last 140 ms landed.
   * Driven through this controller with the real arsenal timings, 21 of 46 press offsets across a swing came out —
   * and every one that did not was in the FIRST part of the swing. Mashing as you commit to a punch, the most natural
   * input in a fight, was the one case guaranteed to be eaten. That is what "laggy" was.
   *
   * The queue now lives as long as the horde's (QUEUE_MS, the number that mode already measured its way to) and is
   * taken at the CANCEL POINT as well as at the end of the swing — see `update`.
   */
  request(moveId: string, nowMs: number): boolean {
    if (!this.moveset[moveId]) return false;
    if (!this.current || this.current.phase === 'done') {
      this.current = new StrikeInstance(this.moveset[moveId]);
      return true;
    }
    if (this.current.canCancelInto(moveId)) {
      this.current = new StrikeInstance(this.moveset[moveId]);
      return true;
    }
    this.buffered = moveId;
    // the queue outlives the swing it was pressed in (the horde's rule): a press at the start of a heavy used to die 280 ms
    // before anything could take it
    this.bufferUntil = nowMs + Math.max(QUEUE_MS, this.current.remainingMs + 60);
    return false;
  }

  update(dt: number, nowMs: number): { startedActive: boolean } {
    // A PRESS THAT MISSED ITS WINDOW IS FORGOTTEN. It used to sit in the field indefinitely: the clean-up path
    // nulled `current` and never touched `buffered`, so a press could outlive the swing it was meant for by minutes.
    // Nothing fired it — every consumer re-checks the deadline — but a dead command left lying in a state machine is
    // a bug waiting for its second reader.
    if (this.buffered && nowMs > this.bufferUntil) this.buffered = null;
    if (!this.current) return { startedActive: false };
    const opened = this.current.update(dt);
    // TAKE THE QUEUED PRESS AT THE CANCEL POINT, not only at the end of the swing. A press made before the window
    // opens is the player asking to chain; holding it until the chain is legal is the whole point of a queue.
    if (this.buffered && nowMs <= this.bufferUntil && this.current.canCancelInto(this.buffered)) {
      const next = this.buffered; this.buffered = null;
      this.current = new StrikeInstance(this.moveset[next]);
      return { startedActive: opened };
    }
    if (this.current.phase === 'done' && this.buffered && nowMs <= this.bufferUntil) {
      const next = this.buffered; this.buffered = null;
      this.current = new StrikeInstance(this.moveset[next]);
    }
    if (this.current.phase === 'done' && (!this.buffered || nowMs > this.bufferUntil)) {
      this.current = null;
    }
    return { startedActive: opened };
  }

  get busy(): boolean { return this.current !== null; }
  swapMoveset(moveset: Record<string, CombatMove>): void {
    this.moveset = moveset;
    this.current = null; this.buffered = null;
  }
}

// ── Weapon attachment ──────────────────────────────────────────────────────
export interface WeaponDef {
  id: string;
  label: string;
  moveset: Record<string, CombatMove>;
  /** procedural prop builder (real art via the asset pipeline later) */
  buildProp: (scene: Scene) => Mesh;
  rangeMult: number;          // applied to AttackDef.range at request time
}

export const FISTS: WeaponDef = {
  id: 'fists', label: 'FISTS', rangeMult: 1,
  moveset: {},                // filled by karateMoveset() below
  buildProp: () => { throw new Error('fists have no prop'); },
};

/** Phase 4: the horde's book as a StrikeSystem moveset — one CombatMove per HordeMove, timings from STRIKE_TIMING scaled
 *  by the move's speed, damage from attackFromMove, and the string rule ('*') on every one. jab / kick / heavy keep their
 *  ids, so a rival brain that requests by those names is unchanged. */
export function bookMoveset(karate: Record<'jab' | 'kick' | 'heavy', AttackDef>): Record<string, CombatMove> {
  const out: Record<string, CombatMove> = {};
  for (const m of Object.values(MOVES) as HordeMove[]) {
    const base = m.weight === 'light' ? karate.jab : m.weight === 'medium' ? karate.kick : karate.heavy;
    const a = attackFromMove(m, base);
    const t = STRIKE_TIMING[m.weight];
    const startupSec = Math.max(MIN_STARTUP_SEC, t.hitAt / m.speed);
    const activeSec = m.weight === 'light' ? 0.08 : m.weight === 'medium' ? 0.1 : 0.12;
    const cancelAtSec = t.cancelAt / m.speed;
    const recoverySec = Math.max(0.12, cancelAtSec - startupSec - activeSec + (m.weight === 'finisher' ? 0.3 : m.weight === 'heavy' ? 0.22 : 0.12));
    out[m.id] = { atk: { ...a, line: a.line ?? 'vertical' }, startupSec, activeSec, recoverySec, cancelInto: ['*'], cancelWindowSec: 0, cancelAtSec, launch: !!m.launch, air: !!m.air, slam: !!m.slam, weight: m.weight, tags: [m.weight === 'light' ? 'jab' : m.weight === 'medium' ? 'kick' : 'heavy'] };
  }
  return out;
}
/** Phase 4: a weapon moveset under the string rule — every move cancels into any other past its cancel point. */
export function stringRule(moveset: Record<string, CombatMove>): Record<string, CombatMove> {
  const out: Record<string, CombatMove> = {};
  for (const [id, m] of Object.entries(moveset)) out[id] = { ...m, cancelInto: ['*'], cancelAtSec: m.startupSec + m.activeSec * 0.5 };
  return out;
}

/** Build the empty-hand moveset from FightCore's karate table. */
export function karateMoveset(karate: Record<'jab' | 'kick' | 'heavy', AttackDef>): Record<string, CombatMove> {
  return {
    jab: {
      atk: karate.jab, startupSec: 0.12, activeSec: 0.08, recoverySec: 0.22,
      cancelInto: ['kick', 'heavy'], cancelWindowSec: 0.18, weight: 'light', tags: ['jab'],
    },
    kick: {
      atk: karate.kick, startupSec: 0.18, activeSec: 0.1, recoverySec: 0.3,
      cancelInto: ['heavy'], cancelWindowSec: 0.16, weight: 'medium', tags: ['kick'],
    },
    heavy: {
      atk: karate.heavy, startupSec: 0.26, activeSec: 0.12, recoverySec: 0.42,
      cancelInto: [], cancelWindowSec: 0, weight: 'heavy', tags: ['heavy'],
    },
  };
}

/** Staff moveset from FightCore's staff table — longer startup, wider
 *  cancel windows (a polearm flows), bigger recovery. */
export function staffMoveset(staff: Record<'jab' | 'kick' | 'heavy', AttackDef>): Record<string, CombatMove> {
  return {
    poke: {
      atk: staff.jab, startupSec: 0.2, activeSec: 0.1, recoverySec: 0.3,
      cancelInto: ['sweep', 'overhead'], cancelWindowSec: 0.22, weight: 'light', tags: ['jab'],
    },
    sweep: {
      atk: staff.kick, startupSec: 0.26, activeSec: 0.12, recoverySec: 0.36,
      cancelInto: ['overhead'], cancelWindowSec: 0.2, weight: 'medium', tags: ['kick'],
    },
    overhead: {
      atk: staff.heavy, startupSec: 0.34, activeSec: 0.14, recoverySec: 0.5,
      cancelInto: [], cancelWindowSec: 0, weight: 'heavy', tags: ['heavy'],
    },
  };
}

export function bladeMoveset(): Record<string, CombatMove> {
  // The katana identity: fastest startup, shortest range, chip-poor but
  // combo-rich — win by volume and angles, lose the range war to staff.
  const a = (dmg: number, range: number, startupMs: number, stunSec: number, knockback: number, chiGain: number, guardDmg: number) =>
    ({ id: '', label: '', clip: 'hook', dmg, range, startupMs, stunSec, knockback, chiGain, guardDmg });
  return {
    slash: {
      atk: { ...a(7, 1.9, 130, 0.35, 0.5, 9, 5), id: 'slash', label: 'SLASH', clip: 'hook' },
      startupSec: 0.13, activeSec: 0.08, recoverySec: 0.2,
      cancelInto: ['crossslash', 'riser'], cancelWindowSec: 0.2, weight: 'light', tags: ['jab'],
    },
    crossslash: {
      atk: { ...a(9, 1.9, 160, 0.4, 0.8, 10, 7), id: 'crossslash', label: 'CROSS', clip: 'roundhouse' },
      startupSec: 0.16, activeSec: 0.09, recoverySec: 0.26,
      cancelInto: ['riser'], cancelWindowSec: 0.18, weight: 'medium', tags: ['kick'],
    },
    riser: {
      atk: { ...a(15, 2.0, 300, 0.8, 1.8, 16, 20), id: 'riser', label: 'RISER', clip: 'uppercut' },
      startupSec: 0.3, activeSec: 0.12, recoverySec: 0.46,
      cancelInto: [], cancelWindowSec: 0, weight: 'heavy', tags: ['heavy'],
    },
  };
}

export function staffWeapon(): WeaponDef {
  return {
    id: 'staff', label: 'STAFF', rangeMult: 1,
    moveset: {},              // caller binds staffMoveset(STAFF_ATTACKS)
    buildProp: (scene) => {
      const m = MeshBuilder.CreateCylinder('staff', { height: 1.8, diameter: 0.05 }, scene);
      const mat = new StandardMaterial('staffMat', scene);
      mat.diffuseColor = new Color3(0.5, 0.35, 0.2);
      m.material = mat;
      return m;
    },
  };
}

/** Attaches a weapon prop to the RightHand bone; swaps the strike table. */
export class WeaponRig {
  private prop: Mesh | null = null;

  constructor(private controller: StrikeController) {}

  equip(scene: Scene, skeleton: Skeleton, weapon: WeaponDef | null, moveset: Record<string, CombatMove>): void {
    this.unequip();
    this.controller.swapMoveset(moveset);
    if (!weapon || weapon.id === 'fists') return;
    const hand = boneNode(skeleton, 'RightHand');
    if (!hand) { console.warn('[FEL-COMBAT] no RightHand bone — weapon prop skipped'); return; }
    this.prop = weapon.buildProp(scene);
    this.prop.parent = hand as TransformNode;
    this.prop.position = Vector3.Zero();
  }

  unequip(): void {
    this.prop?.dispose();
    this.prop = null;
  }
}
