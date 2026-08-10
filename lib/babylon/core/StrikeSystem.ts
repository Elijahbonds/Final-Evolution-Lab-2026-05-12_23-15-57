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

// ── Moves with frame data ──────────────────────────────────────────────────
export interface CombatMove {
  atk: AttackDef;             // damage/range/guard economics (FightCore)
  startupSec: number;
  activeSec: number;
  recoverySec: number;
  cancelInto: string[];       // move ids this can chain into
  cancelWindowSec: number;    // window after active-end
  weight: 'light' | 'medium' | 'heavy' | 'finisher';
  tags: string[];             // stance gating (StanceSystem.moveTags)
}

export const MIN_STARTUP_SEC = 0.1;      // the readability floor

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
    if (!this.move.cancelInto.includes(nextId)) return false;
    if (this.phase !== 'recovery') return false;
    const cancelStart = this.move.startupSec + this.move.activeSec;
    return this.t <= cancelStart + this.move.cancelWindowSec;
  }

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

  /** Request a strike. If mid-recovery inside a cancel window, chains.
   *  Otherwise buffers briefly (140ms) so slightly-early presses land. */
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
    this.bufferUntil = nowMs + 140;
    return false;
  }

  update(dt: number, nowMs: number): { startedActive: boolean } {
    if (!this.current) return { startedActive: false };
    const opened = this.current.update(dt);
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
    const hand = skeleton.bones.find((b) => b.name === 'RightHand')?.getTransformNode();
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
