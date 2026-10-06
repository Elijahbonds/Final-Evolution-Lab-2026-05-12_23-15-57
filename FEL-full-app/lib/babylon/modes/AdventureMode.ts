// AdventureMode — The Adventure's test yard as an ordinary ModeDefinition (ADVENTURE PLAN A4, "How a mode hosts it": no
// new harness). ModeHarness gives the scene, the quality tier, the camera director, the input bus, PerfGovernor pacing,
// the result sink, body() for the Mirror and the player ring; this file gives the harness ONE AdventureHost
// (lib/babylon/adventure/host) and draws what it simulates:
//
//   load     the yard (world/sandbox + world/view), the player through CharacterLibrary.spawn (the identity layer dresses
//            them), the partner (a creature placeholder, or a built character), the save (A3's device save, read-only;
//            the yard's own progress is kept under its own key), the systems, the view binders (A1 movement / rails /
//            speed, A2 combat / magic).
//   onInput  every FelInput into host/inputMap (rebindable); the keys 1–4 are the keyboard's d-pad (no mode binds them).
//   update   host.frame(dt): the fixed 60 Hz steps; then the views once per frame, the camera from the host's hints,
//            the HUD, the ring (stamina), and BodyBudget's fidelity picks every half-second.
//   onBody   A3's Mirror hook: false while the Mirror is off, so the event is not counted.
//
// DEV ONLY: registered in MODES so /dev/mode/adventure and /dev/adventure can mount it; NOT in ENABLED_BABYLON_MODES, so no
// public route or picker serves it (Phase B adds /play/adventure, unlisted until the owner says).
//
// Nothing on screen during play but the HUD (owner rule): no banners, callouts or hints from this mode.

import { TransformNode, Vector3, type Scene } from '@babylonjs/core';
import type { ModeContext, ModeDefinition, BodyView } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import type { BodyEvent } from '@/lib/pose/BodyReader';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { DEFAULT_HERO_URL } from '../core/athleteRoster';
import { installSafePlay } from '../anim/clipRegistry';
import type { CharacterAnimator } from '../anim/CharacterAnimator';
import { SoundKit } from '../audio/SoundKit';
import type { ActorId, AdventureActor, AdventureSave } from '../adventure/contracts';
import { createSandbox, type Sandbox } from '../adventure/world/sandboxSetup';
import { archetypeOf, buildCreatureBody, buildMonsterBody, buildYardView, placeBody, type PlaceholderBody, type YardView } from '../adventure/world/view';
import { createInputMapper, DIGIT_DPAD, loadBindings, type InputMapper } from '../adventure/host/inputMap';
import { BodyBudget } from '../adventure/host/BodyBudget';
import { bindMovementView, type MovementView } from '../adventure/movement/view';
import { GrindSparksView } from '../adventure/rails/view';
import { SpeedFlightView } from '../adventure/flight/view';
import { bindCombatView, type CombatView } from '../adventure/combat/view';
import { bindMagicView, type MagicView } from '../adventure/magic/view';
import { partnerBodyVisible } from '../adventure/partner/view';
import { loadAdventureSave, storeAdventureSave, adventureSavePolicy, type SaveStorage } from '../adventure/save';
import { mirrorOnBody, MIRROR_CLAIMS } from '../adventure/stats/mirror';

/** The yard keeps its own progress under this prefix, so a try-out never writes the player's real save. */
export const YARD_SAVE_PREFIX = 'yard:';
/** Seconds between the yard's progress saves (and one on the way out). [TUNE] */
const SAVE_EVERY_SEC = 30;
/** The HUD refreshes at this rate, not every frame. [TUNE] */
const HUD_HZ = 10;
/** The camera's FOV eases toward its boost at this rate (1/s). [TUNE] */
const FOV_EASE = 4;
/** The stick's basis latches while held (CameraDirector.stickWorldLatched's rule): below this it lets go. */
const STICK_LATCH = 0.15;

/** A placeholder body has no rig: the movement view still tilts its pose node (spin, lean, bank), and plays nothing. */
const NO_ANIM: Pick<CharacterAnimator, 'play' | 'setSpeed'> = { play: () => null, setSpeed: () => {} };

interface Body { kind: 'skinned' | 'placeholder'; root: TransformNode; pose: TransformNode; char?: SpawnedCharacter; ph?: PlaceholderBody; view: MovementView }

interface St {
  sb: Sandbox;
  mapper: InputMapper;
  yard: YardView;
  bodies: Map<ActorId, Body>;
  budget: BodyBudget;
  combatView: CombatView;
  magicView: MagicView;
  sparks: GrindSparksView;
  speed: SpeedFlightView;
  stickL: { x: number; y: number };
  stickR: { x: number; y: number };
  latchedYaw: number | null;
  baseFov: number;
  fovBoost: number;
  hudSec: number;
  saveSec: number;
  frame: number;
  offKeys: (() => void) | null;
  storage: SaveStorage | null;
  lastHud: string;
  mirror: boolean;
  preset: string;
}

const states = new WeakMap<Scene, St>();
const TMP_SUBJECT = new Vector3(), TMP_VEL = new Vector3(), TMP_OBJ = new Vector3(), TMP_FWD = new Vector3();

/** The yard's storage: the device store, with every key under YARD_SAVE_PREFIX (try/catch inside A3's store). */
function yardStorage(): SaveStorage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const ls = window.localStorage;
    return { getItem: (k) => ls.getItem(YARD_SAVE_PREFIX + k), setItem: (k, v) => ls.setItem(YARD_SAVE_PREFIX + k, v) };
  } catch { return null; }
}

/** The yard's save: its own, else a read-only copy of the player's device save, else empty (A3's loader in each case). */
function loadYardSave(storage: SaveStorage | null): AdventureSave {
  const now = Date.now();
  const own = loadAdventureSave({ now, storage });
  if (own.status === 'loaded' || own.status === 'migrated') return own.save;
  const theirs = loadAdventureSave({ now });
  return theirs.save;
}

function param(name: string): string | null {
  try { return typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get(name) : null; } catch { return null; }
}

function storeYard(S: St): void {
  if (!S.storage) return;
  const save = S.sb.host.progressSave();
  // the yard's loan partner is the yard's: a player without one keeps none
  if (S.sb.partnerLent) save.partner = null;
  storeAdventureSave(save, { now: Date.now(), policy: adventureSavePolicy({ signedIn: false }), storage: S.storage });
}

function hudOf(S: St): Record<string, string | number | boolean | null> {
  const h = S.sb.host, p = h.player, st = p.stats;
  const lock = p.lock?.hard ? h.world.actors.get(p.lock.actorId) : null;
  const slot = h.magic.selectedSlot(h.playerId);
  const spellId = h.loadout.equipped[slot] ?? null;
  const spell = spellId ? h.magic.spells.get(spellId) : undefined;
  return {
    hp: Math.round(st.hp.cur), hpMax: Math.round(st.hp.max),
    energy: Math.round(st.energy.cur), energyMax: Math.round(st.energy.max),
    special: Math.round(st.special * 100),
    lock: lock ? `${lock.kind === 'boss' ? 'BOSS' : 'TARGET'}${p.lock?.part ? ` · ${p.lock.part.toUpperCase()}` : ''} ${Math.round(lock.stats.hp.cur)}` : null,
    fusion: Math.round(p.fusion.meter * 100), fused: p.fusion.active ? Math.ceil(p.fusion.remainingSec) : 0, tier: p.fusion.tier,
    slot: slot + 1, spell: spell ? spell.name : null, partner: h.partner?.command() ?? null, state: p.state,
    yard: S.sb.runtime.phase,
  };
}

export const AdventureMode: ModeDefinition = {
  modeId: 'adventure',
  mood: 'daylight',
  backdrop: 'park',
  camPreset: 'runner',
  // the Mirror (A3): real punches, kicks, guards and slips charge the special; off by default, never required
  body: { claims: [...MIRROR_CLAIMS] },

  async load(ctx: ModeContext) {
    const scene = ctx.scene;
    const storage = yardStorage();
    const save = loadYardSave(storage);
    const seedQ = Number(param('seed'));
    const sb = createSandbox({
      seed: Number.isFinite(seedQ) && seedQ > 0 ? seedQ : 0x5eed,
      save,
      partner: param('partner') === 'character' ? 'character' : 'creature',
      fuseReady: param('fuse') === 'ready',
      start: param('at') === 'camp' ? 'camp' : 'spawn',
      band: ctx.prqBand ?? null,
    });
    const host = sb.host;
    const yard = buildYardView(scene, sb.spec);

    // ── the party's bodies ──
    const bodies = new Map<ActorId, Body>();
    const skinned = async (a: AdventureActor, tint?: string): Promise<Body> => {
      const root = new TransformNode(`adv_${a.id}`, scene);
      const pose = new TransformNode(`adv_${a.id}_pose`, scene);
      pose.parent = root;
      const char = await CharacterLibrary.spawn(scene, DEFAULT_HERO_URL, { position: Vector3.Zero(), yawRad: 0, startClip: 'idle_stand', modeId: 'adventure', ...(tint ? { tint } : {}) });
      installSafePlay(char.animator, 'adventure');
      char.root.parent = pose;
      char.root.position.set(0, 0, 0);
      char.root.rotation.set(0, 0, 0);
      const view = bindMovementView({ animator: char.animator, poseNode: pose, actor: () => host.world.actors.get(a.id), telemetry: () => host.movement.inspect(a.id), clock: () => host.tSec });
      return { kind: 'skinned', root, pose, char, view };
    };
    const placeholder = (a: AdventureActor, ph: PlaceholderBody): Body => ({
      kind: 'placeholder', root: ph.root, pose: ph.pose, ph,
      view: bindMovementView({ animator: NO_ANIM, poseNode: ph.pose, actor: () => host.world.actors.get(a.id), telemetry: () => host.movement.inspect(a.id), clock: () => host.tSec }),
    });
    bodies.set(host.playerId, await skinned(host.player));
    const q = host.partnerActor, qDef = host.partnerDefNow();
    if (q && qDef) {
      if (qDef.kind === 'character') bodies.set(q.id, await skinned(q, '#fde68a'));
      else bodies.set(q.id, placeholder(q, buildCreatureBody(scene, q, qDef.element, qDef.creature?.stage ?? 0)));
    }
    if (scene.isDisposed) return;

    // ── the views the lanes handed over ──
    const me = bodies.get(host.playerId)!;
    const combatView = bindCombatView({
      scene, bus: host.bus, combat: host.combat, actors: host.world.actors, localPlayerId: host.playerId,
      // the hit-stop is the host's clock (a time:scale freeze) AND the harness's visual one
      juice: {
        hitStop: (ms = 70) => { host.bus.emit('time:scale', { byId: 'hitstop', world: 0, self: 0, sec: ms / 1000 }); ctx.juice.hitStop(ms); },
        shake: (amp, ms) => ctx.juice.shake(amp, ms),
      },
    });
    const magicView = bindMagicView({ scene, bus: host.bus, magic: host.magic, actors: host.world.actors, localPlayerId: host.playerId, juice: ctx.juice });
    const sparks = new GrindSparksView(scene, me.root, 'player');
    const speed = new SpeedFlightView(scene, ctx.camera, 'player');

    // ── input: the mapper fills the player's MoveInput at each step's input stage ──
    const mapper = createInputMapper({ bindings: loadBindings() });
    const S: St = {
      sb, mapper, yard, bodies, budget: new BodyBudget(), combatView, magicView, sparks, speed,
      stickL: { x: 0, y: 0 }, stickR: { x: 0, y: 0 }, latchedYaw: null, baseFov: ctx.camera.fov, fovBoost: 0,
      hudSec: 0, saveSec: 0, frame: 0, offKeys: null, storage, lastHud: '', mirror: save.settings.mirror === true, preset: 'runner',
    };
    states.set(scene, S);
    host.setInputSource(host.playerId, (out) => mapper.fill(out, { camYaw: camYawOf(ctx, S), state: host.player.state, invertFlightY: sb.save.settings.invertFlightY }));
    // the keyboard's d-pad: 1 partner · 2 fuse / mount · 3 / 4 spell slot (no other mode binds the digit keys)
    if (typeof window !== 'undefined') {
      const onKey = (ev: KeyboardEvent) => {
        const dir = DIGIT_DPAD[ev.key];
        if (!dir || ev.repeat) return;
        ctx.input.emit({ t: 'dpad', dir, pressed: ev.type === 'keydown' });
      };
      window.addEventListener('keydown', onKey);
      window.addEventListener('keyup', onKey);
      S.offKeys = () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
    }

    // ── the camera ──
    ctx.heroRef.current = me.root;
    ctx.objectiveRef.current = null;
    placeBody(me.root, host.player);
    ctx.camDirector.setPreset('runner');
    ctx.camDirector.snapTo(me.root.position, me.root.position.add(new Vector3(0, 0, 8)));
    SoundKit.startAmbient('wind');

    // THE PROBE SEAM (dev): the sim's state for a probe or a Playwright check
    (scene.metadata ??= {}).adventure = {
      state: () => {
        const p = host.player;
        return { t: +host.tSec.toFixed(2), state: p.state, pos: { x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2) }, hp: p.stats.hp.cur, bodies: host.world.actors.size, phase: sb.runtime.phase, errors: host.errors.length };
      },
      host,
      poseOf: (id: string) => { const b = bodies.get(id); return b ? { x: b.pose.rotation.x, z: b.pose.rotation.z } : null; },
    };
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
      (window as unknown as { __FEL_ADVENTURE__?: unknown }).__FEL_ADVENTURE__ = scene.metadata.adventure;   // dev probes only
    }
    syncFrame(ctx, S, 0);
  },

  onInput(ctx: ModeContext, e: FelInput) {
    const S = states.get(ctx.scene);
    if (!S) return;
    if (e.t === 'stick') { const s = e.side === 'L' ? S.stickL : S.stickR; s.x = e.x; s.y = e.y; }
    S.mapper.onInput(e);
  },

  update(ctx: ModeContext, dt: number) {
    const S = states.get(ctx.scene);
    if (!S) return;
    S.sb.host.frame(dt);
    syncFrame(ctx, S, dt);
  },

  onBody(ctx: ModeContext, ev: BodyEvent, view: BodyView) {
    void view;
    const S = states.get(ctx.scene);
    if (!S) return false;
    return mirrorOnBody(ev, { bus: S.sb.host.bus, actorId: S.sb.host.playerId, enabled: () => S.mirror });
  },

  dispose() {
    // the harness disposes the scene; the per-scene state goes with its WeakMap entry. Live states are closed here.
    for (const S of live) closeState(S);
    live.clear();
  },
};

const live = new Set<St>();

function closeState(S: St): void {
  try { storeYard(S); } catch { /* the device store is best-effort */ }
  if (typeof window !== 'undefined') delete (window as unknown as { __FEL_ADVENTURE__?: unknown }).__FEL_ADVENTURE__;
  S.offKeys?.(); S.offKeys = null;
  S.combatView.dispose(); S.magicView.dispose(); S.sparks.dispose(); S.speed.dispose(); S.yard.dispose();
  for (const b of S.bodies.values()) { b.view.dispose(); if (b.ph) b.ph.dispose(); else { b.char?.dispose(); b.pose.dispose(); b.root.dispose(); } }
  S.bodies.clear();
  S.sb.runtime.dispose();
  S.sb.host.dispose();
}

/** The camera's yaw for the stick, LATCHED while the stick is held (the basis does not swing with a follow camera). */
function camYawOf(ctx: ModeContext, S: St): number {
  ctx.camDirector.forwardFlatToRef(TMP_FWD);
  const live = Math.atan2(TMP_FWD.x, TMP_FWD.z);
  const held = Math.hypot(S.stickL.x, S.stickL.y) >= STICK_LATCH;
  const steering = Math.hypot(S.stickR.x, S.stickR.y) >= STICK_LATCH;
  if (!held) { S.latchedYaw = null; return live; }
  if (S.latchedYaw === null || steering) S.latchedYaw = live;
  return S.latchedYaw;
}

/** Once per rendered frame: bodies, views, camera, HUD, ring, budget, the periodic save. */
function syncFrame(ctx: ModeContext, S: St, dt: number): void {
  live.add(S);
  const h = S.sb.host, scene = ctx.scene;
  S.frame++;
  // bodies: monsters and the boss come and go with the yard's runtime
  for (const a of h.world.actors.values()) {
    if (S.bodies.has(a.id)) continue;
    const kind = archetypeOf(a.id, S.sb.spec);
    if (!kind) continue;
    const ph = buildMonsterBody(scene, a, kind);
    S.bodies.set(a.id, {
      kind: 'placeholder', root: ph.root, pose: ph.pose, ph,
      view: bindMovementView({ animator: NO_ANIM, poseNode: ph.pose, actor: () => h.world.actors.get(a.id), telemetry: () => h.movement.inspect(a.id), clock: () => h.tSec }),
    });
  }
  for (const [id, b] of S.bodies) {
    const a = h.world.actors.get(id);
    if (!a) { b.view.dispose(); b.ph?.dispose(); S.bodies.delete(id); S.budget.forget(id); continue; }
    placeBody(b.root, a);
    const visible = (a.kind !== 'partner' || partnerBodyVisible(a)) && S.budget.of(id) !== 'culled';
    if (b.root.isEnabled() !== visible) b.root.setEnabled(visible);
    if (visible && BodyBudget.animates(S.budget.of(id), S.frame)) b.view.sync(dt);
    if (a.kind === 'monster' && !(a.stats.hp.cur > 0)) b.pose.rotation.x = -Math.PI / 2;   // a downed placeholder lies down
  }
  const me = h.player;
  S.sparks.sync(me, h.movement.inspect(h.playerId));
  S.speed.sync(me, h.movement.inspect(h.playerId), h.tSec);
  S.combatView.sync();
  S.magicView.sync();
  S.yard.sync();

  // the camera: the host's held hint as a director rig
  const rig = h.camera.rig();
  if (rig.preset !== S.preset) { S.preset = rig.preset; ctx.camDirector.setPreset(rig.preset); }
  ctx.camDirector.tuneFollow({ distance: rig.distance, height: rig.height, lag: rig.lag, lookAhead: rig.lookAhead });
  ctx.camDirector.look(S.stickR.x, S.stickR.y, dt);
  const target = rig.objectiveId ? h.world.actors.get(rig.objectiveId) : undefined;
  TMP_SUBJECT.set(me.pos.x, me.pos.y, me.pos.z);
  TMP_VEL.set(me.vel.x, me.vel.y, me.vel.z);
  ctx.camDirector.update(TMP_SUBJECT, TMP_VEL, target ? TMP_OBJ.set(target.pos.x, target.pos.y + target.height * 0.5, target.pos.z) : null);
  S.fovBoost += (rig.fovBoostDeg - S.fovBoost) * (1 - Math.exp(-FOV_EASE * Math.max(0, dt)));
  ctx.camera.fov = S.baseFov + (S.fovBoost * Math.PI) / 180;

  // the ring is the stamina pool; the HUD at HUD_HZ, and only when it changed
  ctx.stamina?.(me.stats.stamina.max > 0 ? me.stats.stamina.cur / me.stats.stamina.max : 1);
  S.hudSec += dt;
  if (S.hudSec >= 1 / HUD_HZ || S.frame === 1) {
    S.hudSec = 0;
    const hud = hudOf(S);
    const key = JSON.stringify(hud);
    if (key !== S.lastHud) { S.lastHud = key; ctx.setHud(hud); }
  }

  // the body budget, every half-second (the player, the partner, the lock and a boss are always full)
  const tier = (scene.metadata as { felTier?: 'mobile' | 'desktop' } | undefined)?.felTier ?? 'desktop';
  const lockId = me.lock?.actorId ?? null;
  S.budget.update(h.world.actors.values(), dt, {
    tier, eye: me.pos,
    pinned: (a) => a.id === h.playerId || a.id === h.partnerId || a.id === lockId || a.kind === 'boss',
  });

  S.saveSec += dt;
  if (S.saveSec >= SAVE_EVERY_SEC) { S.saveSec = 0; try { storeYard(S); } catch { /* best-effort */ } }
}
