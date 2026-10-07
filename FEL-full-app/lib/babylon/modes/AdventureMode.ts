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
// PHASE B (2026-10-07): the mode has TWO FACES. The yard (above) at /dev/adventure, as A4 built it; and THE STORY at
// /play/adventure (or any mount with `?face=story`, the perf probe's): the hub and Chapter 1's world (adventure/story,
// adventure/world/{hub,ch1,story}), the real party from the real device save (never the yard's `yard:` copy), the
// chapter runner's scenes (the sim pauses, the camera follows the cutscene's track, the dialogue box is the page's,
// fed through story/uiBridge), and the flight gate (story/flags). `adventureFace()` decides at load.
//
// HIDDEN: registered in MODES so /dev/adventure (a hidden link on the live site, owner decision 2026-10-06: reachable by its
// URL, linked from nowhere, noindex) and /dev/mode/adventure (dev only) can mount it; NOT in ENABLED_BABYLON_MODES, so no
// picker, menu or player route serves it (Phase B adds /play/adventure, unlisted until the owner says).
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
import { ADVENTURE_ACTIONS, createInputMapper, DEFAULT_BINDINGS, DIGIT_DPAD, loadBindings, type InputMapper } from '../adventure/host/inputMap';
import { BodyBudget } from '../adventure/host/BodyBudget';
import { bindMovementView, type MovementView } from '../adventure/movement/view';
import { GrindSparksView } from '../adventure/rails/view';
import { SpeedFlightView } from '../adventure/flight/view';
import { bindCombatView, type CombatView } from '../adventure/combat/view';
import { bindMagicView, type MagicView } from '../adventure/magic/view';
import { partnerBodyVisible } from '../adventure/partner/view';
import { loadAdventureSave, storeAdventureSave, adventureSavePolicy, type SaveStorage } from '../adventure/save';
import { mirrorOnBody, MIRROR_CLAIMS } from '../adventure/stats/mirror';
import { createScriptDriver } from '../adventure/host/sandboxScript';
import { StorySession } from '../adventure/story/session';
import { StoryVoice, type StorySpeaker } from '../adventure/story/voice';
import { routeStoryInput, settleStoryInput, storyInputState, type StoryInputState } from '../adventure/story/input';
import { createPlaythroughDriver, type PlaythroughDriver } from '../adventure/story/playthrough';
import { loadStorySave, partnerFromPick, storeStorySave } from '../adventure/story/party';
import { storyUi } from '../adventure/story/uiBridge';
import { chapterById } from '../adventure/story/data';
import { flightUnlockedIn } from '../adventure/story/flags';
import { buildStoryView, type StoryView } from '../adventure/world/story/view';
import { cancelNatural, speakNatural } from '../audio/voice/speakNatural';

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
  /** The follow overlay last handed to the director (re-tuned only when the rig changes). */
  rigKey: string;
  budgetIn: { tier: 'mobile' | 'desktop'; eye: { x: number; y: number; z: number }; pinned: (a: AdventureActor) => boolean };
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

/** Which face to mount: the story at /play/adventure (or `?face=story`), else the yard. */
export function adventureFace(): 'yard' | 'story' {
  try {
    if (typeof window === 'undefined') return 'yard';
    if (param('face') === 'story') return 'story';
    if (param('face') === 'yard') return 'yard';
    // the story's route (compared by segment: the route is linked from nowhere, host/hiddenRoute.test.ts)
    const seg = window.location.pathname.split('/');
    return seg[1] === 'play' && seg[2] === 'adventure' ? 'story' : 'yard';
  } catch { return 'yard'; }
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
    if (adventureFace() === 'story') return loadStory(ctx);
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
      rigKey: '',
      budgetIn: {
        tier: (scene.metadata as { felTier?: 'mobile' | 'desktop' } | undefined)?.felTier ?? 'desktop',
        eye: host.player.pos,
        pinned: (a) => a.id === host.playerId || a.id === host.partnerId || a.id === host.player.lock?.actorId || a.kind === 'boss',
      },
    };
    states.set(scene, S);
    // ?demo=1 (dev): the headless integration script plays the yard live — every verb, in the real scene, hands off
    // (the script steers in world directions, so its camera yaw is held at 0)
    const demo = param('demo') === '1' ? createScriptDriver(sb, mapper) : null;
    host.setInputSource(host.playerId, (out) => {
      if (demo) { demo.step(); mapper.fill(out, { camYaw: 0, state: host.player.state }); return; }
      mapper.fill(out, { camYaw: camYawOf(ctx, S), state: host.player.state, invertFlightY: sb.save.settings.invertFlightY });
    });
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
      demo: () => (demo ? { beat: demo.beat(), reached: { ...demo.reached } } : null),
      poseOf: (id: string) => { const b = bodies.get(id); return b ? { x: b.pose.rotation.x, z: b.pose.rotation.z } : null; },
    };
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
      (window as unknown as { __FEL_ADVENTURE__?: unknown }).__FEL_ADVENTURE__ = scene.metadata.adventure;   // dev probes only
    }
    syncFrame(ctx, S, 0);
  },

  onInput(ctx: ModeContext, e: FelInput) {
    const T = stories.get(ctx.scene);
    if (T) { storyInput(T, e); return; }
    const S = states.get(ctx.scene);
    if (!S) return;
    if (e.t === 'stick') { const s = e.side === 'L' ? S.stickL : S.stickR; s.x = e.x; s.y = e.y; }
    S.mapper.onInput(e);
  },

  update(ctx: ModeContext, dt: number) {
    const T = stories.get(ctx.scene);
    if (T) { storyUpdate(ctx, T, dt); return; }
    const S = states.get(ctx.scene);
    if (!S) return;
    S.sb.host.frame(dt);
    syncFrame(ctx, S, dt);
  },

  onBody(ctx: ModeContext, ev: BodyEvent, view: BodyView) {
    void view;
    const T = stories.get(ctx.scene);
    if (T) return mirrorOnBody(ev, { bus: T.session.host.bus, actorId: T.session.host.playerId, enabled: () => T.mirror });
    const S = states.get(ctx.scene);
    if (!S) return false;
    return mirrorOnBody(ev, { bus: S.sb.host.bus, actorId: S.sb.host.playerId, enabled: () => S.mirror });
  },

  dispose() {
    // the harness disposes the scene; the per-scene state goes with its WeakMap entry. Live states are closed here.
    for (const S of live) closeState(S);
    live.clear();
    for (const T of liveStories) closeStory(T);
    liveStories.clear();
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
  if (rig.hint !== S.rigKey) { S.rigKey = rig.hint; ctx.camDirector.tuneFollow({ distance: rig.distance, height: rig.height, lag: rig.lag, lookAhead: rig.lookAhead }); }
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
  S.budgetIn.eye = me.pos;
  S.budget.update(h.world.actors.values(), dt, S.budgetIn);

  S.saveSec += dt;
  if (S.saveSec >= SAVE_EVERY_SEC) { S.saveSec = 0; try { storeYard(S); } catch { /* best-effort */ } }
}

// ── THE STORY FACE (Phase B, 2026-10-07) ────────────────────────────────────────────────────────────────────────

/** Seconds between the story's progress saves (beats and checkpoints save too). [TUNE] */
const STORY_SAVE_EVERY_SEC = 30;
/** The dialogue box refreshes at this rate (the reveal is smooth enough; React need not re-render every frame). [TUNE] */
const STORY_UI_HZ = 30;

interface StoryState {
  session: StorySession;
  mapper: InputMapper;
  inputSt: StoryInputState;
  view: StoryView;
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
  uiSec: number;
  saveSec: number;
  frame: number;
  lastHud: string;
  mirror: boolean;
  preset: string;
  rigKey: string;
  snap: boolean;
  flight: boolean;
  demo: PlaythroughDriver | null;
  offKeys: (() => void) | null;
  chapterTitle: string | null;
  placeholder: boolean;
  budgetIn: St['budgetIn'];
}

const stories = new WeakMap<Scene, StoryState>();
const liveStories = new Set<StoryState>();
const TMP_CAM = new Vector3(), TMP_TGT = new Vector3();

/** The browser's voice for a line: a recorded take when the text has one, else the least robotic TTS (speakNatural). */
const STORY_SPEAKER: StorySpeaker = {
  speak: (text) => { try { if (SoundKit.voiceOn) speakNatural(text, { source: 'adventure' }); } catch { /* no speech */ } },
  cancel: () => { try { cancelNatural(); } catch { /* nothing speaking */ } },
};

function storeStory(T: StoryState, save?: AdventureSave): void {
  try { storeStorySave(save ?? T.session.progressSave(), { now: Date.now(), who: storyUi.who }); } catch { /* best-effort: the device store */ }
}

async function loadStory(ctx: ModeContext): Promise<void> {
  const scene = ctx.scene;
  const loaded = loadStorySave(Date.now()).save;
  // the page's first-run picker writes the partner before START; a direct mount without one gets the default creature
  // (assumption: the probe and /dev/mode mounts), never stored until the session saves
  if (!loaded.partner) loaded.partner = partnerFromPick({ kind: 'creature', speciesId: 'strideraptor' });
  const seedQ = Number(param('seed'));
  let T: StoryState | null = null;
  const session = new StorySession({
    save: loaded,
    seed: Number.isFinite(seedQ) && seedQ > 0 ? seedQ : 0x5eed,
    band: ctx.prqBand ?? null,
    voice: new StoryVoice(STORY_SPEAKER),
    onSave: (s) => { if (T) storeStory(T, s); },
    onWarp: () => { if (T) T.snap = true; },
  });
  const host = session.host;
  const view = buildStoryView(scene, session.map, session.gates);

  // the party's bodies (the yard's way: the player through CharacterLibrary.spawn, a creature as a placeholder)
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
    const v = bindMovementView({ animator: char.animator, poseNode: pose, actor: () => host.world.actors.get(a.id), telemetry: () => host.movement.inspect(a.id), clock: () => host.tSec });
    return { kind: 'skinned', root, pose, char, view: v };
  };
  bodies.set(host.playerId, await skinned(host.player));
  const q = host.partnerActor, qDef = host.partnerDefNow();
  if (q && qDef) {
    if (qDef.kind === 'character') bodies.set(q.id, await skinned(q, '#fde68a'));
    else {
      const ph = buildCreatureBody(scene, q, qDef.element, qDef.creature?.stage ?? 0);
      bodies.set(q.id, { kind: 'placeholder', root: ph.root, pose: ph.pose, ph, view: bindMovementView({ animator: NO_ANIM, poseNode: ph.pose, actor: () => host.world.actors.get(q.id), telemetry: () => host.movement.inspect(q.id), clock: () => host.tSec }) });
    }
  }
  if (scene.isDisposed) { session.dispose(); view.dispose(); return; }
  const me = bodies.get(host.playerId)!;
  const combatView = bindCombatView({
    scene, bus: host.bus, combat: host.combat, actors: host.world.actors, localPlayerId: host.playerId,
    juice: {
      hitStop: (ms = 70) => { host.bus.emit('time:scale', { byId: 'hitstop', world: 0, self: 0, sec: ms / 1000 }); ctx.juice.hitStop(ms); },
      shake: (amp, ms) => ctx.juice.shake(amp, ms),
    },
  });
  const magicView = bindMagicView({ scene, bus: host.bus, magic: host.magic, actors: host.world.actors, localPlayerId: host.playerId, juice: ctx.juice });
  const mapper = createInputMapper({ bindings: loadBindings() });
  const chapter = session.save.story.chapterId ? chapterById(session.save.story.chapterId) : null;
  T = {
    session, mapper, inputSt: storyInputState(), view, bodies, budget: new BodyBudget(), combatView, magicView,
    sparks: new GrindSparksView(scene, me.root, 'player'), speed: new SpeedFlightView(scene, ctx.camera, 'player'),
    stickL: { x: 0, y: 0 }, stickR: { x: 0, y: 0 }, latchedYaw: null, baseFov: ctx.camera.fov, fovBoost: 0,
    hudSec: 0, uiSec: 0, saveSec: 0, frame: 0, lastHud: '', mirror: session.save.settings.mirror === true, preset: 'runner', rigKey: '',
    snap: true, flight: flightUnlockedIn(session.save.story.flags), demo: null, offKeys: null,
    chapterTitle: chapter?.title ?? null, placeholder: !!chapter?.placeholder,
    budgetIn: {
      tier: (scene.metadata as { felTier?: 'mobile' | 'desktop' } | undefined)?.felTier ?? 'desktop',
      eye: host.player.pos,
      pinned: (a) => a.id === host.playerId || a.id === host.partnerId || a.id === host.player.lock?.actorId || a.kind === 'boss',
    },
  };
  const S = T;
  stories.set(scene, S);
  liveStories.add(S);
  // ?demo=1: the headless Chapter 1 script plays the story live (its camera yaw held at 0)
  if (param('demo') === '1') S.demo = createPlaythroughDriver(session, mapper, S.inputSt);
  host.setInputSource(host.playerId, (out) => {
    if (S.demo) { S.demo.step(); mapper.fill(out, { camYaw: 0, state: host.player.state }); return; }
    mapper.fill(out, { camYaw: storyCamYaw(ctx, S), state: host.player.state, invertFlightY: session.save.settings.invertFlightY });
  });
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
  storyUi.bind({
    press: () => session.runner.press(), release: () => session.runner.release(),
    choose: (i) => session.runner.choose(i), skip: () => session.runner.skipScene(),
    setMirror: (on) => { S.mirror = on; session.save.settings.mirror = on; storeStory(S); },
    reloadBindings: () => { const b = loadBindings(); for (const a of ADVENTURE_ACTIONS) mapper.rebind(a, b?.[a] ?? DEFAULT_BINDINGS[a]); },
  });

  ctx.heroRef.current = me.root;
  ctx.objectiveRef.current = null;
  placeBody(me.root, host.player);
  ctx.camDirector.setPreset('runner');
  ctx.camDirector.snapTo(me.root.position, me.root.position.add(new Vector3(0, 0, 8)));
  SoundKit.startAmbient('wind');
  session.start();
  if (!S.chapterTitle && session.runner.chapterId) { const c = chapterById(session.runner.chapterId); S.chapterTitle = c?.title ?? null; S.placeholder = !!c?.placeholder; }

  // THE PROBE SEAM (the story's state for a Playwright check)
  (scene.metadata ??= {}).adventure = {
    face: 'story',
    state: () => {
      const p = host.player;
      return {
        t: +host.tSec.toFixed(2), state: p.state, pos: { x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2) }, hp: p.stats.hp.cur,
        bodies: host.world.actors.size, errors: host.errors.length, beat: session.runner.beat?.id ?? null, paused: session.paused,
        done: session.runner.done, fused: p.fusion.active, flight: flightUnlockedIn(session.save.story.flags), doing: S.demo?.doing() ?? null,
      };
    },
    host, session,
  };
  if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
    (window as unknown as { __FEL_ADVENTURE__?: unknown }).__FEL_ADVENTURE__ = scene.metadata.adventure;   // dev probes only
  }
  storySync(ctx, S, 0);
}

function storyInput(T: StoryState, e: FelInput): void {
  if (e.t === 'stick') { const s = e.side === 'L' ? T.stickL : T.stickR; s.x = e.x; s.y = e.y; }
  if (T.demo) return;   // the demo plays itself
  routeStoryInput(e, T.session.runner, T.mapper, T.inputSt);
}

function storyUpdate(ctx: ModeContext, T: StoryState, dt: number): void {
  settleStoryInput(T.session.runner, T.mapper, T.inputSt);
  if (T.demo && T.session.paused) T.demo.step();   // the script taps through the scenes too
  T.session.frame(dt);
  storySync(ctx, T, dt);
}

function storyCamYaw(ctx: ModeContext, T: StoryState): number {
  ctx.camDirector.forwardFlatToRef(TMP_FWD);
  const yaw = Math.atan2(TMP_FWD.x, TMP_FWD.z);
  const held = Math.hypot(T.stickL.x, T.stickL.y) >= STICK_LATCH;
  const steering = Math.hypot(T.stickR.x, T.stickR.y) >= STICK_LATCH;
  if (!held) { T.latchedYaw = null; return yaw; }
  if (T.latchedYaw === null || steering) T.latchedYaw = yaw;
  return T.latchedYaw;
}

function storySync(ctx: ModeContext, T: StoryState, dt: number): void {
  const s = T.session, h = s.host, scene = ctx.scene;
  T.frame++;
  // bodies: the encounters' monsters come and go with the story runtime
  for (const a of h.world.actors.values()) {
    if (T.bodies.has(a.id)) continue;
    const kind = s.runtime.archetypeOf(a.id);
    if (!kind) continue;
    const ph = buildMonsterBody(scene, a, kind);
    T.bodies.set(a.id, {
      kind: 'placeholder', root: ph.root, pose: ph.pose, ph,
      view: bindMovementView({ animator: NO_ANIM, poseNode: ph.pose, actor: () => h.world.actors.get(a.id), telemetry: () => h.movement.inspect(a.id), clock: () => h.tSec }),
    });
  }
  for (const [id, b] of T.bodies) {
    const a = h.world.actors.get(id);
    if (!a) { b.view.dispose(); b.ph?.dispose(); T.bodies.delete(id); T.budget.forget(id); continue; }
    placeBody(b.root, a);
    const visible = (a.kind !== 'partner' || partnerBodyVisible(a)) && T.budget.of(id) !== 'culled';
    if (b.root.isEnabled() !== visible) b.root.setEnabled(visible);
    if (visible && BodyBudget.animates(T.budget.of(id), T.frame)) b.view.sync(dt);
    if ((a.kind === 'monster' || a.kind === 'boss') && !(a.stats.hp.cur > 0)) b.pose.rotation.x = -Math.PI / 2;
  }
  const me = h.player;
  T.sparks.sync(me, h.movement.inspect(h.playerId));
  T.speed.sync(me, h.movement.inspect(h.playerId), h.tSec);
  T.combatView.sync();
  T.magicView.sync();
  const flight = flightUnlockedIn(s.save.story.flags);
  if (flight !== T.flight || T.frame === 1) { T.flight = flight; T.view.syncGates({ flight, reached: (id) => s.reached(id) }); }

  // the camera: a cutscene's track while a scene plays; otherwise the host's hint as a director rig (the yard's way)
  const cut = s.runner.cutscene.camera();
  if (s.paused && cut) {
    TMP_CAM.set(cut.position.x, cut.position.y, cut.position.z);
    TMP_TGT.set(cut.target.x, cut.target.y, cut.target.z);
    ctx.camera.position.copyFrom(TMP_CAM);
    ctx.camera.setTarget(TMP_TGT);
    ctx.camera.fov = (cut.fov * Math.PI) / 180;
    T.snap = true;
  } else {
    const rig = h.camera.rig();
    if (rig.preset !== T.preset) { T.preset = rig.preset; ctx.camDirector.setPreset(rig.preset); }
    if (rig.hint !== T.rigKey) { T.rigKey = rig.hint; ctx.camDirector.tuneFollow({ distance: rig.distance, height: rig.height, lag: rig.lag, lookAhead: rig.lookAhead }); }
    const root = T.bodies.get(h.playerId)?.root;
    if (T.snap && root) { T.snap = false; ctx.camDirector.snapTo(root.position, root.position.add(new Vector3(Math.sin(me.facingYaw) * 8, 0, Math.cos(me.facingYaw) * 8))); }
    ctx.camDirector.look(T.stickR.x, T.stickR.y, dt);
    const target = rig.objectiveId ? h.world.actors.get(rig.objectiveId) : undefined;
    TMP_SUBJECT.set(me.pos.x, me.pos.y, me.pos.z);
    TMP_VEL.set(me.vel.x, me.vel.y, me.vel.z);
    ctx.camDirector.update(TMP_SUBJECT, TMP_VEL, target ? TMP_OBJ.set(target.pos.x, target.pos.y + target.height * 0.5, target.pos.z) : null);
    T.fovBoost += (rig.fovBoostDeg - T.fovBoost) * (1 - Math.exp(-FOV_EASE * Math.max(0, dt)));
    ctx.camera.fov = T.baseFov + (T.fovBoost * Math.PI) / 180;
  }

  // the ring, the HUD (only when it changed), and the dialogue box through the bridge
  ctx.stamina?.(me.stats.stamina.max > 0 ? me.stats.stamina.cur / me.stats.stamina.max : 1);
  T.hudSec += dt;
  if (T.hudSec >= 1 / HUD_HZ || T.frame === 1) {
    T.hudSec = 0;
    const lock = me.lock?.hard ? h.world.actors.get(me.lock.actorId) : null;
    const slot = h.magic.selectedSlot(h.playerId);
    const spellId = h.loadout.equipped[slot] ?? null;
    const spell = spellId ? h.magic.spells.get(spellId) : undefined;
    const hud = {
      hp: Math.round(me.stats.hp.cur), hpMax: Math.round(me.stats.hp.max),
      energy: Math.round(me.stats.energy.cur), energyMax: Math.round(me.stats.energy.max),
      special: Math.round(me.stats.special * 100),
      lock: lock ? `${lock.kind === 'boss' ? 'BOSS' : 'TARGET'}${me.lock?.part ? ` · ${me.lock.part.toUpperCase()}` : ''} ${Math.round(lock.stats.hp.cur)}` : null,
      fusion: Math.round(me.fusion.meter * 100), fused: me.fusion.active ? Math.ceil(me.fusion.remainingSec) : 0, tier: me.fusion.tier,
      slot: slot + 1, spell: spell ? spell.name : null, partner: h.partner?.command() ?? null, state: me.state,
      objective: s.runner.objective(), flight, fusionOpen: s.save.story.flags.fusionUnlocked === true,
    };
    const key = JSON.stringify(hud);
    if (key !== T.lastHud) { T.lastHud = key; ctx.setHud(hud); }
  }
  T.uiSec += dt;
  if (T.uiSec >= 1 / STORY_UI_HZ || T.frame === 1 || !s.paused) {
    T.uiSec = 0;
    const v = s.runner.view();
    storyUi.publish({
      live: true,
      dialogue: s.paused && v.active ? { speaker: v.speaker, text: v.text, shown: v.shown, placeholder: v.placeholder, choices: v.choices, choiceIndex: v.choiceIndex, hold01: v.hold01 } : null,
      objective: s.runner.objective(), chapterTitle: T.chapterTitle, placeholderChapter: T.placeholder, mirror: T.mirror, storyMode: s.storyMode,
    });
  }

  T.budgetIn.eye = me.pos;
  T.budget.update(h.world.actors.values(), dt, T.budgetIn);
  T.saveSec += dt;
  if (T.saveSec >= STORY_SAVE_EVERY_SEC) { T.saveSec = 0; storeStory(T); }
}

function closeStory(T: StoryState): void {
  storeStory(T);
  storyUi.bind(null);
  STORY_SPEAKER.cancel();
  if (typeof window !== 'undefined') delete (window as unknown as { __FEL_ADVENTURE__?: unknown }).__FEL_ADVENTURE__;
  T.offKeys?.(); T.offKeys = null;
  T.combatView.dispose(); T.magicView.dispose(); T.sparks.dispose(); T.speed.dispose(); T.view.dispose();
  for (const b of T.bodies.values()) { b.view.dispose(); if (b.ph) b.ph.dispose(); else { b.char?.dispose(); b.pose.dispose(); b.root.dispose(); } }
  T.bodies.clear();
  T.session.dispose();
}
