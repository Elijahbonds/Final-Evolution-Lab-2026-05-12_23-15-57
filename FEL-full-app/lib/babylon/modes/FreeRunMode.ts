// FreeRunMode — A+ mission #10 (2026-09-06): free-running tricking, replacing GymnasticsMode on the roster. Owner benchmark:
// Skate 3 trick-scoring model + Mirror's Edge traversal feel.
//
// TRAVERSAL: a Havok character controller (PhysicsCharacterController) against static box aggregates for every course
// piece — no fall-through by construction; the only non-physical pieces are the gates (start / checkpoint / finish arches)
// and the slide BAR, which is a gate you must slide under (the capsule cannot crouch; clipping it costs speed). Momentum
// gates the verbs (FreeRunCore.verbsFor): walk and you can only jump; run and you can vault and slide; sprint and the
// wall and the ledges open up. Wall-run, wall-kick, cat leap, precision jump, landing roll.
// TRICKS + SCORING: Skate's own ComboChain (imported, not rewritten) — every link pays N×, a clean touchdown with no linked
// move banks the pot, a bail burns it — with FreeRunCore.trickPoints = difficulty × launch × execution (Skate's sketchy
// multiplier). Tricks come off vaults, wall-kicks and drops, not only flat ground.
// STATE: per scene (a host that mounts twice must never share a controller or a course — the Carnival lesson).

import { Vector3, MeshBuilder, StandardMaterial, Color3, PhysicsAggregate, PhysicsShapeType, PhysicsCharacterController, CharacterSupportedState, Ray, type Mesh, type Scene, type AbstractMesh } from '@babylonjs/core';
import type { HudValue, ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { DEFAULT_HERO_URL } from '../core/athleteRoster';
import { installSafePlay } from '../anim/clipRegistry';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { assertSpawned } from '../core/FrameGuard';
import { initPhysics } from '../core/Physics';
import { ComboChain } from '../core/ComboChain';
import {
  verbsFor, stepSpeed, gradeDrop, speedAfterLanding, trickPoints, trickCompletes, FREERUN_TRICKS, TIERS, tierById,
  timeBonus, runGrade, RUN_MAX, ROLL_WINDOW_S, type RunState, type Env, type FreeRunTrick, type Tier, type Landing, type LAUNCH_MULT,
} from '../core/FreeRunCore';
import { coursePieces, courseLength, checkpoints, respawnFor, overGap, routeAt, type Piece } from './freeRunCourse';

const CAPSULE_H = 1.7, CAPSULE_R = 0.32;
const JUMP_V = 6.4, VAULT_V = 4.6, WALLRUN_SEC = 1.1, WALLKICK_V = 6.8, WALLKICK_PUSH = 5.2, SLIDE_SEC = 0.7, DOWN_SEC = 1.3;
const BANK_AFTER_SEC = 0.6;          // Skate's revert window: roll clean this long and the pot banks
const PICK_TIMEOUT_S = 6;
const FALL_Y = -2.5;
const BAR_CLIP_SPEED = 0.45;         // clip the bar without sliding: keep this much speed

type Launch = keyof typeof LAUNCH_MULT;
type Phase = 'pick' | 'run' | 'done';

interface St {
  scene: Scene;
  phase: Phase; pickSec: number; autoBegin: boolean;
  tier: Tier; pieces: Piece[]; meshes: AbstractMesh[]; aggs: PhysicsAggregate[];
  hero: SpawnedCharacter | null; cc: PhysicsCharacterController | null;
  state: RunState; speed: number; heading: Vector3; stick: Vector3;
  airStartY: number; airSec: number; launch: Launch; trick: FreeRunTrick | null; trickSpun: number;
  wallSec: number; wallNormal: Vector3; slideSec: number; downSec: number; groundSec: number;
  rollAt: number | null; clock: number;
  combo: ComboChain; started: boolean; runSec: number; finished: boolean;
  checkpoint: number; highTouched: boolean; bails: number; barsCleared: Set<number>;
  env: Env; anim: string;
}
const states = new WeakMap<Scene, St>();
const live = new Set<St>();

const MAT: Record<string, string> = { ground: '#8E8A84', vault: '#C9A15A', wall: '#B8735A', ledge: '#3FB8B0', roof: '#3FB8B0', bar: '#E0C060', start: '#3DDC97', finish: '#F4C542', checkpoint: '#4FD1E8', gap: '#000000' };

export const FreeRunMode: ModeDefinition = (() => {
  const st = (ctx: ModeContext): St | undefined => states.get(ctx.scene);

  function buildCourse(ctx: ModeContext, S: St): void {
    for (const m of S.meshes) m.dispose(); S.meshes = []; S.aggs = [];
    S.pieces = coursePieces(S.tier);
    const mats = new Map<string, StandardMaterial>();
    const matFor = (kind: string) => {
      let m = mats.get(kind);
      if (!m) { m = new StandardMaterial(`fr_mat_${kind}`, ctx.scene); m.diffuseColor = Color3.FromHexString(MAT[kind] ?? '#888888'); m.specularColor = Color3.Black(); if (kind === 'ledge' || kind === 'roof' || kind === 'finish' || kind === 'start' || kind === 'checkpoint') m.emissiveColor = Color3.FromHexString(MAT[kind]).scale(0.25); mats.set(kind, m); }
      return m;
    };
    for (const [i, p] of S.pieces.entries()) {
      if (p.kind === 'gap') continue;                                    // a gap is the absence of ground
      const isGate = p.kind === 'start' || p.kind === 'finish' || p.kind === 'checkpoint';
      const box: Mesh = MeshBuilder.CreateBox(`fr_${p.kind}_${i}`, { width: p.w, height: p.h, depth: p.d }, ctx.scene);
      box.position.set(p.x, p.y, p.z);
      box.material = matFor(p.kind);
      box.metadata = { freerun: p.kind, pieceIndex: i };
      if (isGate) { box.visibility = 0.35; box.isPickable = false; }
      else if (p.kind === 'bar') { box.isPickable = true; }             // a gate you slide under; not a collider (the capsule cannot crouch)
      else S.aggs.push(new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 0, friction: 0.9 }, ctx.scene));
      S.meshes.push(box);
    }
  }

  function hud(ctx: ModeContext, S: St, extra: Record<string, HudValue> = {}): void {
    const h = S.combo.hud;
    ctx.setHud({
      speed: Math.round(S.speed * 10) / 10, speedMax: RUN_MAX,
      verbs: verbsFor(S.state, S.speed, S.env).join(' · '),
      combo: h.combo, pot: h.pot, banked: h.banked, score: h.banked + h.pot,
      time: Math.round(S.runSec * 10) / 10, checkpoint: `${S.checkpoint}/${checkpoints(S.pieces).length}`,
      tier: S.tier.name, route: S.highTouched ? 'HIGH LINE' : 'LOW LINE', runState: S.state,
      ...extra,
    });
  }

  function flash(ctx: ModeContext, text: string, ms = 700): void {
    ctx.setHud({ banner: text });
    setTimeout(() => ctx.setHud({ banner: '' }), ms);
  }

  function play(S: St, clip: string, loop: boolean): void {
    if (!S.hero || S.anim === clip) return;
    S.anim = clip;
    S.hero.animator.play(clip, { loop, fadeSec: 0.1 });
  }

  // ── probes: what the course offers right now ─────────────────────────
  function probe(ctx: ModeContext, S: St): void {
    const p = S.hero!.root.position;
    const fwd = S.heading;
    const cast = (origin: Vector3, dir: Vector3, len: number, kinds: string[]): { hit: boolean; normal: Vector3 | null; point: Vector3 | null } => {
      const pick = ctx.scene.pickWithRay(new Ray(origin, dir, len), (m) => !!(m.metadata as { freerun?: string } | null)?.freerun && kinds.includes((m.metadata as { freerun: string }).freerun));
      return pick?.hit ? { hit: true, normal: pick.getNormal(true), point: pick.pickedPoint } : { hit: false, normal: null, point: null };
    };
    const knee = cast(p.add(new Vector3(0, 0.6, 0)), fwd, 1.7, ['vault']);
    const chest = cast(p.add(new Vector3(0, 1.3, 0)), fwd, 1.4, ['wall']);
    const head = cast(p.add(new Vector3(0, 1.45, 0)), fwd, 1.9, ['bar']);
    const ledge = cast(p.add(new Vector3(0, 4.2, 0)).add(fwd.scale(2.2)), new Vector3(0, -1, 0), 2.6, ['ledge', 'roof']);
    S.env = { vaultAhead: knee.hit, wallAhead: chest.hit, ledgeAhead: ledge.hit && !!ledge.point && ledge.point.y > p.y + 1.2, barAhead: head.hit };
    if (chest.hit && chest.normal) S.wallNormal.copyFrom(chest.normal);
  }

  // ── the run's beats ──────────────────────────────────────────────────
  function beginAir(S: St, launch: Launch, vy: number): void {
    const v = S.cc!.getVelocity();
    S.cc!.setVelocity(new Vector3(S.heading.x * S.speed, vy, S.heading.z * S.speed).add(new Vector3(0, 0, 0)).addInPlace(new Vector3(v.x * 0, 0, v.z * 0)));
    S.state = 'air'; S.airStartY = S.hero!.root.position.y; S.airSec = 0; S.launch = launch; S.trick = null; S.trickSpun = 0; S.rollAt = null;
    play(S, 'jump_up', false);
  }

  function land(ctx: ModeContext, S: St): void {
    const drop = Math.max(0, S.airStartY - S.hero!.root.position.y);
    const rolledWithin = S.rollAt === null ? null : S.clock - S.rollAt;
    let landing: Landing = gradeDrop(drop, rolledWithin);
    // a trick that did not come round is a bail, whatever the drop
    if (S.trick && !trickCompletes(S.trick, S.airSec)) landing = 'bail';
    if (S.trick) {
      const pts = trickPoints(S.trick, S.launch, landing);
      if (pts > 0) { S.combo.add(`${S.trick.name}${S.launch !== 'ground' ? ` OFF ${S.launch.toUpperCase()}` : ''}`, pts, 'air'); flash(ctx, `${S.trick.name} ${landing === 'sketchy' ? '· SKETCHY' : ''} +${pts}`); }
    } else if (landing === 'clean' && drop >= 2.4) { S.combo.add('ROLL', 30, 'revert'); flash(ctx, 'ROLL +30'); }
    S.hero!.root.rotation.x = 0; S.hero!.root.rotation.z = 0;
    S.speed = speedAfterLanding(S.speed, landing);
    if (landing === 'bail') {
      const lost = S.combo.bail(); S.bails++;
      S.state = 'down'; S.downSec = DOWN_SEC;
      play(S, 'football_tackled_fall', false);
      ctx.feel?.impact?.(0.7); SoundKit.play('miss');
      flash(ctx, lost > 0 ? `BAILED — ${lost} lost` : 'BAILED', 900);
    } else {
      S.state = 'ground'; S.groundSec = 0;
      play(S, landing === 'sketchy' ? 'jump_land' : 'jump_land', false);
      ctx.feel?.impact?.(landing === 'sketchy' ? 0.45 : 0.2);
      if (landing === 'sketchy') flash(ctx, 'HARD LANDING — roll next time', 700);
    }
    EffectsKit.burst(ctx.scene, S.hero!.root.position, 'dust');
    S.trick = null;
    hud(ctx, S);
  }

  function respawn(ctx: ModeContext, S: St): void {
    const r = respawnFor(S.pieces, S.checkpoint);
    S.cc!.setPosition(new Vector3(r.x, r.y + CAPSULE_H / 2 + 0.05, r.z));
    S.cc!.setVelocity(Vector3.Zero());
    const lost = S.combo.bail(); S.bails++;
    S.speed = 0; S.state = 'ground'; S.trick = null; S.hero!.root.rotation.set(0, S.hero!.root.rotation.y, 0);
    SoundKit.play('miss');
    flash(ctx, lost > 0 ? `FELL — ${lost} lost · back to the checkpoint` : 'FELL — back to the checkpoint', 1000);
  }

  function finish(ctx: ModeContext, S: St): void {
    if (S.finished) return;
    S.finished = true; S.phase = 'done';
    S.combo.bank();
    const tb = timeBonus(S.runSec, S.tier);
    const rb = S.highTouched ? S.tier.routeBonus : 0;
    const total = S.combo.banked + tb + rb;
    const grade = runGrade(total, S.tier);
    SoundKit.play('whistle'); SoundKit.play('crowdCheer');
    EffectsKit.burst(ctx.scene, S.hero!.root.position.add(new Vector3(0, 1.8, 0)), 'confetti');
    play(S, 'dunk_celebrate_big', false);
    hud(ctx, S, { banner: `FINISH · ${S.runSec.toFixed(1)}s · GRADE ${grade}` });
    setTimeout(() => ctx.end(grade === 'S' || grade === 'A' ? 'win' : 'complete', total, {
      timeSec: Math.round(S.runSec * 10) / 10, tricks: S.combo.banked, timeBonus: tb, routeBonus: rb, bestCombo: S.combo.bestCombo,
      tier: S.tier.id, bails: S.bails, highLine: S.highTouched ? 1 : 0,
    }), 1400);
  }

  // ── pick ─────────────────────────────────────────────────────────────
  function showPick(ctx: ModeContext, S: St): void {
    ctx.setHud({ banner: `COURSE   ◀  ${S.tier.name}  ▶`, hint: `${S.tier.gaps} gaps · par ${S.tier.parSec}s · high line +${S.tier.routeBonus}  ·  any face button starts`, tier: S.tier.name, verbs: '', time: 0 });
  }

  async function begin(ctx: ModeContext, S: St): Promise<void> {
    if (S.phase !== 'pick') return;
    S.phase = 'run';
    buildCourse(ctx, S);
    ctx.setHud({ banner: '', hint: 'stick RUNS · A JUMP / VAULT / WALL RUN · B SLIDE / ROLL · X FLIP (stick picks) · Y TWIST / CAT LEAP' });
    hud(ctx, S);
  }

  return {
    modeId: 'freerun', mood: 'nightGame', camPreset: 'runner',

    async load(ctx: ModeContext) {
      const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tier') : null;
      const S: St = {
        scene: ctx.scene, phase: 'pick', pickSec: 0, autoBegin: !!q,
        tier: tierById(q ? Number(q) : 1), pieces: [], meshes: [], aggs: [],
        hero: null, cc: null, state: 'ground', speed: 0, heading: new Vector3(0, 0, 1), stick: new Vector3(),
        airStartY: 0, airSec: 0, launch: 'ground', trick: null, trickSpun: 0,
        wallSec: 0, wallNormal: new Vector3(1, 0, 0), slideSec: 0, downSec: 0, groundSec: 0, rollAt: null, clock: 0,
        combo: new ComboChain(), started: false, runSec: 0, finished: false,
        checkpoint: 0, highTouched: false, bails: 0, barsCleared: new Set(),
        env: { vaultAhead: false, wallAhead: false, ledgeAhead: false, barAhead: false }, anim: '',
      };
      states.set(ctx.scene, S); live.add(S);

      // Havok first: the course pieces are static aggregates, the runner a character capsule
      const handle = await initPhysics(ctx.scene);
      handle.ground.dispose();                                  // the helper's catch-all floor would fill every gap
      const floor = ctx.scene.getMeshByName('physics_ground'); floor?.dispose();
      if (S.scene.isDisposed) return;

      S.hero = await CharacterLibrary.spawn(ctx.scene, DEFAULT_HERO_URL, { position: new Vector3(0, 0, 3), yawRad: 0, startClip: 'idle_stand', modeId: 'freerun' });
      installSafePlay(S.hero.animator, 'freerun');
      if (S.scene.isDisposed) return;
      S.cc = new PhysicsCharacterController(new Vector3(0, CAPSULE_H / 2 + 0.05, 3), { capsuleHeight: CAPSULE_H, capsuleRadius: CAPSULE_R }, ctx.scene);
      buildCourse(ctx, S);                                      // the pick screen shows the course
      ctx.heroRef.current = S.hero.root; ctx.objectiveRef.current = null;
      ctx.camDirector.setPreset('runner');
      ctx.camDirector.snapTo(S.hero.root.position, S.hero.root.position.add(new Vector3(0, 0, 8)));
      SoundKit.startAmbient('wind');
      assertSpawned(ctx.scene, { hero: S.hero.root, minWorldMeshes: 6, modeId: 'freerun' });
      if (!S.autoBegin) showPick(ctx, S);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      const S = st(ctx); if (!S || !S.hero || !S.cc) return;
      if (S.phase === 'pick') {
        if (e.t === 'dpad' && e.pressed && (e.dir === 'left' || e.dir === 'right')) {
          const i = TIERS.findIndex((t) => t.id === S.tier.id);
          S.tier = TIERS[(i + (e.dir === 'right' ? 1 : -1) + TIERS.length) % TIERS.length];
          SoundKit.play('uiTick', { pitch: e.dir === 'right' ? 1.2 : 0.9, volume: 0.3 }); showPick(ctx, S);
        } else if (e.t === 'button' && e.pressed && (e.btn === 'A' || e.btn === 'B' || e.btn === 'X' || e.btn === 'Y')) void begin(ctx, S);
        return;
      }
      if (S.phase !== 'run') return;
      if (e.t === 'stick' && e.side === 'L') { S.stick.set(e.x, 0, -e.y); return; }
      if (e.t !== 'button' || !e.pressed) return;
      const verbs = verbsFor(S.state, S.speed, S.env);
      if (e.btn === 'A') {
        if (S.state === 'ground') {
          if (verbs.includes('WALL RUN')) { S.state = 'wallrun'; S.wallSec = WALLRUN_SEC; S.airStartY = S.hero.root.position.y; play(S, 'run', true); S.combo.add('WALL RUN', 45, 'grind'); flash(ctx, 'WALL RUN'); SoundKit.play('whoosh'); }
          else if (verbs.includes('VAULT')) { beginAir(S, 'vault', VAULT_V); S.combo.add('VAULT', 40, 'grind'); flash(ctx, 'VAULT'); SoundKit.play('whoosh'); }
          else { beginAir(S, 'ground', JUMP_V); }
        } else if ((S.state === 'wallrun' || S.state === 'air') && (verbs.includes('WALL KICK'))) {
          const away = S.wallNormal.clone(); away.y = 0; if (away.lengthSquared() < 0.01) away.set(-S.heading.x, 0, -S.heading.z); away.normalize();
          S.heading.copyFrom(away); S.speed = Math.max(S.speed, 4.5);
          S.state = 'air'; S.airStartY = S.hero.root.position.y; S.airSec = 0; S.launch = 'wallkick'; S.trick = null; S.rollAt = null;
          S.cc.setVelocity(new Vector3(away.x * WALLKICK_PUSH, WALLKICK_V, away.z * WALLKICK_PUSH));
          S.combo.add('WALL KICK', 60, 'grind'); flash(ctx, 'WALL KICK'); SoundKit.play('impact', { pitch: 1.3, volume: 0.4 }); play(S, 'jump_up', false);
        }
      } else if (e.btn === 'B') {
        if (S.state === 'ground' && verbs.includes('SLIDE')) { S.state = 'slide'; S.slideSec = SLIDE_SEC; play(S, 'football_juke_left', false); S.combo.add('SLIDE', 35, 'manual'); flash(ctx, 'SLIDE'); SoundKit.play('whoosh', { pitch: 0.8 }); }
        else if (S.state === 'air') { S.rollAt = S.clock; }                    // the roll is timed against touchdown
      } else if (e.btn === 'X' || e.btn === 'Y') {
        if (S.state === 'air' && !S.trick) {
          if (e.btn === 'Y' && verbs.includes('CAT LEAP')) {
            // catch the ledge: snap up onto it and keep running the high line
            const p = S.hero.root.position;
            const target = p.add(S.heading.scale(2.2)); target.y = 3.7 + CAPSULE_H / 2;
            S.cc.setPosition(target); S.cc.setVelocity(new Vector3(S.heading.x * 3, 0, S.heading.z * 3));
            S.state = 'ground'; S.speed = Math.max(3, S.speed * 0.8); S.groundSec = 0; S.highTouched = true;
            S.combo.add('CAT LEAP', 80, 'grind'); flash(ctx, 'CAT LEAP'); SoundKit.play('impact', { pitch: 1.1, volume: 0.35 }); play(S, 'jump_land', false);
            return;
          }
          const sx = S.stick.x, sz = S.stick.z;
          const t: FreeRunTrick = e.btn === 'Y' ? (Math.abs(sx) > 0.5 ? FREERUN_TRICKS.spin : FREERUN_TRICKS.twist)
            : sz < -0.5 ? FREERUN_TRICKS.back : Math.abs(sx) > 0.5 ? FREERUN_TRICKS.side : FREERUN_TRICKS.front;
          S.trick = t; S.trickSpun = 0;
          play(S, 'board_air', true);
          SoundKit.play('whoosh', { pitch: 1.2, volume: 0.5 });
        }
      }
    },

    update(ctx: ModeContext, dt: number) {
      const S = st(ctx); if (!S || !S.hero || !S.cc) return;
      S.clock += dt;
      if (S.phase === 'pick') { S.pickSec += dt; if (S.autoBegin || S.pickSec >= PICK_TIMEOUT_S) void begin(ctx, S); return; }
      if (S.phase !== 'run') return;

      const cc = S.cc, root = S.hero.root;
      // heading follows the stick in camera space; the run keeps its heading with no input
      const cam = ctx.camera;
      const fwd = cam.getForwardRay().direction; fwd.y = 0; if (fwd.lengthSquared() < 0.01) fwd.set(0, 0, 1); fwd.normalize();
      const right = new Vector3(fwd.z, 0, -fwd.x);
      const wishLen = Math.min(1, Math.hypot(S.stick.x, S.stick.z));
      if (wishLen > 0.15 && S.state !== 'down') {
        const w = fwd.scale(S.stick.z).addInPlace(right.scale(S.stick.x)).normalize();
        if (S.state === 'ground' || S.state === 'slide') S.heading.copyFrom(w);
        else S.heading = Vector3.Lerp(S.heading, w, 0.04).normalize();          // faint air control
      }
      if (S.state === 'ground') S.speed = stepSpeed(S.speed, wishLen * RUN_MAX, dt);
      root.rotation.y = Math.atan2(S.heading.x, S.heading.z);

      probe(ctx, S);

      // ── the physics step ──
      const down = new Vector3(0, -1, 0), gravity = new Vector3(0, -9.81, 0);
      const support = cc.checkSupport(dt, down);
      const supported = support.supportedState === CharacterSupportedState.SUPPORTED;
      let desired: Vector3;
      if (S.state === 'wallrun') {
        S.wallSec -= dt;
        const along = S.heading.clone(); along.y = 0;
        desired = new Vector3(along.x * Math.max(3.5, S.speed), 2.6 * (S.wallSec / WALLRUN_SEC) - 1.2, along.z * Math.max(3.5, S.speed));
        cc.setVelocity(desired);
        if (S.wallSec <= 0 || !S.env.wallAhead && S.wallSec < WALLRUN_SEC - 0.25) { S.state = 'air'; S.airSec = 0; S.launch = 'drop'; play(S, 'jump_up', false); }
      } else if (S.state === 'air') {
        S.airSec += dt;
        const v = cc.getVelocity();
        desired = new Vector3(S.heading.x * S.speed, v.y, S.heading.z * S.speed);
        cc.setVelocity(desired);
        if (S.trick) {
          const t = S.trick, rate = (t.turns * 2 * Math.PI) / t.airSec;
          S.trickSpun += Math.abs(rate) * dt;
          if (t.axis === 'x') root.rotation.x += rate * dt; else if (t.axis === 'z') root.rotation.z += rate * dt; else root.rotation.y += rate * dt;
        }
      } else if (S.state === 'down') {
        S.downSec -= dt; cc.setVelocity(new Vector3(0, cc.getVelocity().y, 0));
        if (S.downSec <= 0) { S.state = 'ground'; S.speed = 0; play(S, 'idle_stand', true); }
      } else {
        if (S.state === 'slide') { S.slideSec -= dt; if (S.slideSec <= 0) S.state = 'ground'; }
        desired = new Vector3(S.heading.x * S.speed, 0, S.heading.z * S.speed);
        const moved = cc.calculateMovement(dt, S.heading, support.averageSurfaceNormal, cc.getVelocity(), support.averageSurfaceVelocity, desired, new Vector3(0, 1, 0));
        cc.setVelocity(moved);
        if (S.state === 'ground') {
          if (!supported && cc.getVelocity().y < -0.5) { S.state = 'air'; S.airStartY = root.position.y; S.airSec = 0; S.launch = 'drop'; S.trick = null; S.rollAt = null; play(S, 'jump_up', false); }
          else { S.groundSec += dt; play(S, S.speed > 3.2 ? 'run' : S.speed > 0.4 ? 'walk' : 'idle_stand', true); }
          // touching down without a linked move banks the line
          if (S.groundSec >= BANK_AFTER_SEC && S.combo.pot > 0) { const b = S.combo.bank(); flash(ctx, `BANKED +${b}`, 800); SoundKit.play('score', { volume: 0.5 }); hud(ctx, S); }
        }
      }
      cc.integrate(dt, support, gravity);
      const pos = cc.getPosition();
      root.position.set(pos.x, pos.y - CAPSULE_H / 2 - 0.02, pos.z);

      // landings
      if ((S.state === 'air') && supported && S.airSec > 0.08) land(ctx, S);

      // falls, bars, gates
      if (root.position.y < FALL_Y || (root.position.y < -0.4 && overGap(S.pieces, root.position.x, root.position.z))) respawn(ctx, S);
      for (const [i, p] of S.pieces.entries()) {
        if (p.kind === 'bar' && !S.barsCleared.has(i) && root.position.z > p.z && root.position.z < p.z + 1.2 && Math.abs(root.position.x - p.x) < p.w / 2) {
          S.barsCleared.add(i);
          if (S.state !== 'slide' && root.position.y < p.y + 0.4) { S.speed *= BAR_CLIP_SPEED; ctx.feel?.impact?.(0.4); SoundKit.play('impact', { pitch: 0.7, volume: 0.4 }); flash(ctx, 'CLIPPED THE BAR — slide under it', 800); }
        }
        if (p.kind === 'checkpoint' && (p.index ?? 0) > S.checkpoint && root.position.z > p.z) { S.checkpoint = p.index ?? 0; SoundKit.play('uiTick', { pitch: 1.3 }); flash(ctx, `CHECKPOINT ${S.checkpoint}`, 600); }
      }
      if (!S.started && root.position.z > 1.5) { S.started = true; flash(ctx, 'GO', 500); }
      if (S.started && !S.finished) S.runSec += dt;
      if (routeAt(root.position.x, root.position.y) === 'high') S.highTouched = true;
      if (!S.finished && root.position.z >= courseLength(S.pieces)) finish(ctx, S);

      // camera: leads the momentum and pulls back with speed (FOV widens)
      const c = ctx.scene.activeCamera; if (c) c.fov = 0.8 + S.speed * 0.018;
      if (Math.floor(S.clock * 6) !== Math.floor((S.clock - dt) * 6)) hud(ctx, S);   // six HUD frames a second is plenty for numbers
    },

    dispose() {
      setTimeout(() => {
        for (const S of live) if (S.scene.isDisposed) live.delete(S);
        if (live.size === 0) SoundKit.stopAmbient();
      }, 0);
    },
  };
})();
