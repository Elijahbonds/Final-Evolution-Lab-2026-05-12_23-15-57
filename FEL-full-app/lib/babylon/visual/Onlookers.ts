// Onlookers — World-Population Protocol L4 for the solo score-run venues.
//
// A Venice skatepark, a lift-served slope, a surf break in sight of a boardwalk, a pit fight: all imply people. The first
// version was capsule silhouettes (two instanced masters, 2 draws) — the owner's read on 2026-09-05 was "fix the arms of
// the NPCs": armless pills on the rail. Ship Pass 6 phase 3: onlookers are now ROSTER BODIES (athleteRoster, tinted seeds
// so the same spots get the same people every session), idling on the spot, capped so a crowd never competes with the
// athletes for frame budget (MAX_BODIES × ~6 draws). The constructor keeps its shape — modes construct it synchronously
// and call update(dt) and cheer(strength); the bodies land a moment later.
import { BoundingInfo, Vector3 } from '@babylonjs/core';
import type { Scene, TransformNode } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { DEFAULT_HERO_URL } from '../core/athleteRoster';

interface Figure { char: SpawnedCharacter; root: TransformNode; baseY: number; phase: number; bounds: BoundingInfo; parked: boolean; hidden?: boolean; resting: boolean; age: number }

/** IMPROVE (2026-10-06, the Cypher's #20): opt-in, so every other crowd (the dojo, the courts) is unchanged. */
export interface OnlookersOpts {
  /** IMPROVE (2026-10-06, Tennis #20): pause the bodies the active camera cannot see — their clips parked, their bob
   *  skipped — and resume each on its idle the moment it comes back into view (polled every CULL_SEC). Off by default. */
  pauseOffscreen?: boolean;
  /** Hold each body's clip still between cheers: the idle's keyframes stop being evaluated for a body that is only
   *  standing there (the root's own breathe-bob in update() keeps it alive), and a cheer starts it again. */
  restBetweenCheers?: boolean;
  /** IMPROVE (2026-10-06, Brain Brawl #16): called with each body's root the moment it lands — a mode that wants its crowd
   *  out of the shadow cascades takes it out here, however late the body arrives (the polls it replaces stopped at 12 s). */
  onSpawn?: (root: TransformNode) => void;
  /** IMPROVE (2026-10-06, Brain Brawl #18): while nobody is cheering, write the idle breathe-bob at most this often (s)
   *  instead of every frame — each write recomputes the body's world matrix. A cheer still moves every frame. */
  idleBobStepSec?: number;
}
/** A body rests this long after it lands and after a cheer ends (s): its clip has posed it (a clip held before its
 *  first evaluated frame would leave the bind pose) and the fade-in has finished. */
const REST_AFTER_SEC = 0.6;
const CULL_SEC = 0.25;

const BOB_HEIGHT = 0.02;
const CHEER_SEC = 1.6;
const CHEER_HOP = 0.3;
export const MAX_BODIES = 8;
/** Seed colours → deterministic roster picks; the roster's baked kit ignores the tint itself. */
const SEEDS = ['#3E5A70', '#F25F5C', '#2EC4B6', '#FFBF47', '#5B8DEF', '#B07CF5', '#7BD389', '#E27D60'];

export class Onlookers {
  private figures: Figure[] = [];
  private t = 0;
  private cheerT = 0;
  private disposed = false;
  private requested = 0;
  private rest: boolean;
  /** Seconds since the last cheer ended (or the crowd was built): bodies rest once this passes REST_AFTER_SEC. */
  private calmT = 0;
  private onSpawn: ((root: TransformNode) => void) | null;
  private bobStep: number;
  /** Seconds since the idle bob was last written (idleBobStepSec). */
  private bobAcc = 0;
  private readonly scene: Scene;
  private readonly pauseOffscreen: boolean;
  private sinceCull = 0;
  /** Bodies this crowd asked for (the headless checks count the crowd before the spawns land). */
  get count(): number { return Math.max(this.requested, this.figures.length); }

  constructor(scene: Scene, spots: Vector3[], tint = '#2b3550', lookAt: Vector3 = Vector3.Zero(), opts: OnlookersOpts = {}) {
    this.rest = opts.restBetweenCheers === true;
    this.onSpawn = opts.onSpawn ?? null;
    this.bobStep = Math.max(0, opts.idleBobStepSec ?? 0);
    this.scene = scene;
    this.pauseOffscreen = !!opts.pauseOffscreen;
    if (spots.length === 0) return;
    // spread the cap over the spots so a long rail still reads populated end to end
    const step = Math.max(1, Math.ceil(spots.length / MAX_BODIES));
    const chosen = spots.filter((_, i) => i % step === 0).slice(0, MAX_BODIES);
    this.requested = chosen.length;
    chosen.forEach((p, i) => {
      const seed = SEEDS[(i + tint.length) % SEEDS.length];
      const yaw = Math.atan2(lookAt.x - p.x, lookAt.z - p.z);   // face the action
      void CharacterLibrary.spawn(scene, DEFAULT_HERO_URL, { position: p.clone(), yawRad: yaw, tint: seed, startClip: 'idle', identity: false })
        .then((char) => {
          if (this.disposed) { char.dispose(); return; }
          for (const m of char.root.getChildMeshes()) m.isPickable = false;
          // the body's cull volume: a 1.2 m wide, 2.1 m tall box over the spot (it never leaves it)
          const bounds = new BoundingInfo(new Vector3(p.x - 0.6, p.y, p.z - 0.6), new Vector3(p.x + 0.6, p.y + 2.1, p.z + 0.6));
          this.figures.push({ char, root: char.root, baseY: p.y, phase: (i * 2.399) % (Math.PI * 2), bounds, parked: false, resting: false, age: 0 });
          try { this.onSpawn?.(char.root); } catch (e) { console.warn('[FEL-ONLOOKERS] onSpawn failed', (e as Error)?.message ?? e); }
        })
        .catch((e) => console.warn('[FEL-ONLOOKERS] body did not spawn', (e as Error)?.message ?? e));
    });
  }

  /** Call once a frame. A slow breathe, plus the tail of any cheer in progress. */
  update(dt: number): void {
    if (this.figures.length === 0) return;
    this.t += dt;
    if (this.cheerT > 0) this.cheerT = Math.max(0, this.cheerT - dt);
    const excite = this.cheerT / CHEER_SEC;
    if (this.pauseOffscreen) { this.sinceCull += dt; if (this.sinceCull >= CULL_SEC) { this.sinceCull = 0; this.cull(); } }
    if (this.rest) {
      for (const f of this.figures) f.age += dt;
      this.calmT = this.cheerT > 0 ? 0 : this.calmT + dt;
      if (this.calmT >= REST_AFTER_SEC) {
        for (const f of this.figures) {
          if (f.resting || f.age < REST_AFTER_SEC) continue;
          f.resting = true;
          try { f.char.animator?.currentGroup?.pause(); } catch { /* nothing playing: nothing to hold */ }
        }
      }
    }
    if (this.bobStep > 0 && excite === 0) {
      this.bobAcc += dt;
      if (this.bobAcc < this.bobStep) return;
    }
    this.bobAcc = 0;
    for (const f of this.figures) {
      if (f.parked || f.hidden) continue;   // nobody can see it (pauseOffscreen), or put away behind the lens (cullBehind): no bob either
      const sway = Math.sin(this.t * (1.4 + excite * 6) + f.phase);
      const lift = BOB_HEIGHT * sway + (excite > 0 ? Math.abs(Math.sin(this.t * 9 + f.phase)) * CHEER_HOP * excite : 0);
      f.root.position.y = f.baseY + lift;
    }
  }

  /**
   * IMPROVE (2026-10-06, surf item 6): opt-in — the bodies BEHIND the lens are put away. Surf's crowd stands on the sand while
   * its camera faces out to sea (forward.z ≈ −0.98), and up to six skinned bodies were skinned, animated and drawn for nothing.
   * A body more than `margin` m behind the camera's plane (`eye`, unit `forward`) is disabled and its clip paused; it comes
   * back, clip resumed, the moment it is in front again. Returns how many are shown. Modes that never call it are unchanged.
   */
  cullBehind(eye: { x: number; y: number; z: number }, forward: { x: number; y: number; z: number }, margin = 3): number {
    let shown = 0;
    for (const f of this.figures) {
      const p = f.root.position;
      const ahead = (p.x - eye.x) * forward.x + (p.y + 1 - eye.y) * forward.y + (p.z - eye.z) * forward.z;
      const hide = ahead < -margin;
      if (!hide) shown++;
      if (hide === !!f.hidden) continue;
      f.hidden = hide;
      f.root.setEnabled(!hide);
      const g = f.char.animator?.currentGroup;
      try { if (hide) g?.pause(); else g?.restart(); } catch { /* a body with no clip playing has nothing to pause */ }
    }
    return shown;
  }

  /** pauseOffscreen: park the bodies outside the camera's view, wake the ones back in it. */
  private cull(): void {
    const cam = this.scene.activeCamera;
    if (!cam) return;
    for (const f of this.figures) {
      if (f.hidden) continue;   // cullBehind owns this body while it is put away
      const seen = cam.isInFrustum(f.bounds);
      if (!seen && !f.parked) { f.parked = true; try { f.char.animator?.park?.(); } catch { /* a body with no animator just stops bobbing */ } }
      else if (seen && f.parked) { f.parked = false; try { f.char.animator?.play?.('idle', { loop: true }); } catch { /* as above */ } }
    }
  }

  /** The big moment happened. 0..1 — a bigger moment cheers longer. */
  cheer(strength = 1): void {
    this.cheerT = Math.max(this.cheerT, CHEER_SEC * Math.max(0.2, Math.min(1, strength)));
    for (const f of this.figures) {
      if (f.parked || f.hidden) continue;   // nobody can see it (pauseOffscreen / cullBehind): no cheer
      // a resting body (restBetweenCheers) picks its held clip back up first, so a body with no cheer clip still moves
      if (f.resting) { f.resting = false; try { f.char.animator?.currentGroup?.restart(); } catch { /* nothing held */ } }
      try { f.char.animator?.play?.('cheer', { loop: false }); } catch { /* no cheer clip on this body — the hop carries it */ }
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const f of this.figures) f.char.dispose();
    this.figures = [];
  }
}
