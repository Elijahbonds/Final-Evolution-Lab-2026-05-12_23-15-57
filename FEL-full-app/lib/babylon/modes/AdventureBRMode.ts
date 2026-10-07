// AdventureBRMode — The Adventure's Battle Royale, offline with bots (ADVENTURE PLAN Phase C). An ordinary ModeDefinition
// hosted the way AdventureMode is (ModeHarness: the scene, the quality tier, the camera director, the input bus,
// PerfGovernor pacing, the result sink): this file gives the harness ONE BRMatch (lib/babylon/adventure/br) — twelve
// fighters, you and eleven bots, on the first 320 m map — and draws what it simulates.
//
//   load     the map (br/view), the fighters (CharacterLibrary.spawn: the identity layer dresses you, a tinted spawn is
//            a rival's roster body), the summoned partners as they come (placeholder creatures, or a built character),
//            the views the lanes handed over (A1 movement / rails / speed, A2 combat / magic), the storm and the loot.
//   onInput  every FelInput into A4's mapper (host/inputMap, rebindable); the keys 1–4 are the keyboard's d-pad.
//   update   match.frame(dt): the fixed 60 Hz steps; then the bodies (BodyBudget's distance tiers: full / reduced /
//            impostor / culled, the skinned cap), the camera from the match's hints, the HUD at 10 Hz, the ring.
//   the end  when your run is over (out, or the last one standing) the result goes to the harness's sink (ctx.end):
//            the end screen. NO REWARDS YET: the session route has no BR row (its score rules and caps are econ-harden's
//            and need an owner decision on BR payouts, plan open decision 7), so nothing is posted.
//
// FAIRNESS: the BR's normalised fighter (br/tuning: one level, one set of attributes, one bond); from your save only
// your style (school) and your partner's kind and element come along. The Mirror does not charge the BR (an edge a
// camera would give one player over another in a fair fight); it stays the story's.
//
// HIDDEN: registered in MODES so /play/adventure-br (UNLISTED, owner rule: reachable by URL, noindex, linked from no
// menu) and /dev/mode/adventure_br (dev, the perf probe) can mount it; NOT in ENABLED_BABYLON_MODES.
// Nothing on screen during play but the HUD (owner rule): the zone and the map live in the HUD, nothing else is drawn.

import { Mesh, MeshBuilder, TransformNode, Vector3, type AbstractMesh, type Material, type Scene } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { DEFAULT_HERO_URL } from '../core/athleteRoster';
import { installSafePlay } from '../anim/clipRegistry';
import type { CharacterAnimator } from '../anim/CharacterAnimator';
import { SoundKit } from '../audio/SoundKit';
import { equipWeapon, weaponById } from '../combat/arsenal';
import type { ActorId, AdventureActor } from '../adventure/contracts';
import { createInputMapper, DIGIT_DPAD, loadBindings, type InputMapper } from '../adventure/host/inputMap';
import { BodyBudget, type Fidelity } from '../adventure/host/BodyBudget';
import { bindMovementView, type MovementView } from '../adventure/movement/view';
import { GrindSparksView } from '../adventure/rails/view';
import { SpeedFlightView } from '../adventure/flight/view';
import { bindCombatView, type CombatView } from '../adventure/combat/view';
import { bindMagicView, type MagicView } from '../adventure/magic/view';
import { buildCreatureBody, placeBody, type PlaceholderBody } from '../adventure/world/view';
import { loadAdventureSave } from '../adventure/save';
import { BRMatch, BR_PLAYER_ID, type BRFighter, type BRResult } from '../adventure/br/match';
import { buildBRMapView, buildLootView, buildZoneView, type BRMapView, type LootView, type ZoneView } from '../adventure/br/view';
import { stepZone } from '../adventure/br/zone';
import { BR_SKINNED_CAP } from '../adventure/br/tuning';
import { lootById } from '../adventure/br/loot';

/** The HUD refreshes at this rate. [TUNE] */
const HUD_HZ = 10;
const FOV_EASE = 4;
const STICK_LATCH = 0.15;
/** Seconds between your run ending and the end screen (the last hit lands, the body falls). [TUNE] */
const END_BEAT_SEC = 2.5;
/** Team colours for the rivals' kits (generic). */
const TEAM_TINT = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#ec4899', '#a3a3a3', '#84cc16', '#f43f5e', '#0ea5e9', '#facc15', '#10b981'];

const NO_ANIM: Pick<CharacterAnimator, 'play' | 'setSpeed'> = { play: () => null, setSpeed: () => {} };

interface Body {
  id: ActorId;
  root: TransformNode;
  pose: TransformNode;
  char?: SpawnedCharacter;
  ph?: PlaceholderBody;
  /** The impostor: a plain capsule in the team's colour, shown past the reduced radius instead of the skinned body. */
  imp: Mesh | null;
  view: MovementView;
  weapon: string;
  prop: Mesh | null;
  fid: Fidelity;
}

interface St {
  match: BRMatch;
  mapper: InputMapper;
  mapView: BRMapView;
  zoneView: ZoneView;
  lootView: LootView;
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
  frame: number;
  offKeys: (() => void) | null;
  lastHud: string;
  preset: string;
  rigKey: string;
  endAt: number | null;
  ended: boolean;
  tier: 'mobile' | 'desktop';
  impMats: Map<number, Material>;
  spawning: Set<ActorId>;
  budgetIn: { tier: 'mobile' | 'desktop'; eye: { x: number; y: number; z: number }; pinned: (a: AdventureActor) => boolean; cap: number };
}

const states = new WeakMap<Scene, St>();
const live = new Set<St>();
const TMP_SUBJECT = new Vector3(), TMP_VEL = new Vector3(), TMP_OBJ = new Vector3(), TMP_FWD = new Vector3();

function param(name: string): string | null {
  try { return typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get(name) : null; } catch { return null; }
}

/** The score the result card shows: placement first, then knockouts. (No reward is paid from it yet.) */
export function brScore(r: BRResult): number {
  return Math.max(0, (r.teams - r.place + 1) * 100 + r.kos * 50);
}

export const AdventureBRMode: ModeDefinition = {
  modeId: 'adventure_br',
  mood: 'daylight',
  backdrop: 'park',
  camPreset: 'runner',

  async load(ctx: ModeContext) {
    const scene = ctx.scene;
    // the save is READ for your style and your partner (never written: nothing carries out of a match)
    const save = (() => { try { return loadAdventureSave({ now: Date.now() }).save; } catch { return null; } })();
    const seedQ = Number(param('seed'));
    const match = new BRMatch({
      seed: Number.isFinite(seedQ) && seedQ > 0 ? seedQ : (Date.now() & 0x7fffffff) || 1,
      mode: param('duo') === '1' ? 'duo' : 'solo',
      duoSeat: param('seat') === 'partner' ? 'partner' : 'bot',
      humans: 1,
      player: { school: save?.player.school ?? null, partner: save?.partner ?? null },
    });
    const tier = (scene.metadata as { felTier?: 'mobile' | 'desktop' } | undefined)?.felTier ?? 'desktop';
    const mapView = buildBRMapView(scene, match.map);
    const zoneView = buildZoneView(scene);
    const lootView = buildLootView(scene);

    // ── the fighters' bodies (all at once: the drop needs everyone in the sky) ──
    const bodies = new Map<ActorId, Body>();
    const impMats = new Map<number, Material>();
    const S0 = { impMats, scene };
    const spawnFighter = async (f: BRFighter): Promise<void> => {
      const a = match.world.actors.get(f.id)!;
      if (f.partnerSeat && f.partner.kind === 'creature') {
        const ph = buildCreatureBody(scene, a, f.partner.element, f.partner.creature?.stage ?? 1);
        bodies.set(f.id, makeBody(S0, match, a, ph.root, ph.pose, undefined, ph, f.team));
        return;
      }
      const root = new TransformNode(`br_${a.id}`, scene);
      const pose = new TransformNode(`br_${a.id}_pose`, scene);
      pose.parent = root;
      const tint = f.human ? undefined : f.partnerSeat ? '#fde68a' : TEAM_TINT[(f.team - 1) % TEAM_TINT.length];
      const char = await CharacterLibrary.spawn(scene, DEFAULT_HERO_URL, {
        position: Vector3.Zero(), yawRad: 0, startClip: 'idle_stand', modeId: 'adventure_br',
        ...(tint ? { tint } : {}), role: f.human ? 'player' : 'opponent',
      });
      installSafePlay(char.animator, 'adventure_br');
      char.root.parent = pose;
      char.root.position.set(0, 0, 0);
      char.root.rotation.set(0, 0, 0);
      bodies.set(f.id, makeBody(S0, match, a, root, pose, char, undefined, f.team));
    };
    // you first (the identity layer decides your body before any rival takes the hero URL), then the field
    await spawnFighter(match.fighters[0]);
    await Promise.all(match.fighters.slice(1).map((f) => spawnFighter(f)));
    if (scene.isDisposed) return;

    const me = bodies.get(BR_PLAYER_ID)!;
    const combatView = bindCombatView({
      scene, bus: match.bus, combat: match.combat, actors: match.world.actors, localPlayerId: BR_PLAYER_ID,
      juice: {
        hitStop: (ms = 70) => { match.bus.emit('time:scale', { byId: 'hitstop', world: 0, self: 0, sec: ms / 1000 }); ctx.juice.hitStop(ms); },
        shake: (amp, ms) => ctx.juice.shake(amp, ms),
      },
    });
    const magicView = bindMagicView({ scene, bus: match.bus, magic: match.magic, actors: match.world.actors, localPlayerId: BR_PLAYER_ID, juice: ctx.juice });
    const sparks = new GrindSparksView(scene, me.root, 'player');
    const speed = new SpeedFlightView(scene, ctx.camera, 'player');

    const mapper = createInputMapper({ bindings: loadBindings() });
    const S: St = {
      match, mapper, mapView, zoneView, lootView, bodies, budget: new BodyBudget(), combatView, magicView, sparks, speed,
      stickL: { x: 0, y: 0 }, stickR: { x: 0, y: 0 }, latchedYaw: null, baseFov: ctx.camera.fov, fovBoost: 0, hudSec: 0,
      frame: 0, offKeys: null, lastHud: '', preset: 'runner', rigKey: '', endAt: null, ended: false, tier, impMats,
      spawning: new Set(),
      budgetIn: {
        tier, eye: match.player!.pos, cap: BR_SKINNED_CAP[tier],
        pinned: (a) => a.id === BR_PLAYER_ID || a.id === `${BR_PLAYER_ID}:summon` || a.id === match.player?.lock?.actorId,
      },
    };
    states.set(scene, S);
    match.setInputSource(BR_PLAYER_ID, (out) => {
      const p = match.player;
      mapper.fill(out, { camYaw: camYawOf(ctx, S), state: p?.state ?? 'ground', invertFlightY: save?.settings.invertFlightY });
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

    ctx.heroRef.current = me.root;
    ctx.objectiveRef.current = null;
    placeBody(me.root, match.player!);
    ctx.camDirector.setPreset('runner');
    ctx.camDirector.snapTo(me.root.position, me.root.position.add(new Vector3(0, -6, 10)));
    SoundKit.startAmbient('wind');

    // THE PROBE SEAM (dev): the match's state for a probe or a Playwright check
    (scene.metadata ??= {}).adventureBr = {
      state: () => {
        const p = match.player;
        return {
          t: +match.tSec.toFixed(2), phase: match.phase, alive: match.alive, state: p?.state ?? null,
          pos: p ? { x: +p.pos.x.toFixed(1), y: +p.pos.y.toFixed(1), z: +p.pos.z.toFixed(1) } : null,
          zone: { stage: match.zone.stage, phase: match.zone.phase, r: +match.zone.cur.r.toFixed(1) },
          bodies: match.world.actors.size, skinnedVisible: skinnedVisible(S), errors: match.errors.length, ended: S.ended,
        };
      },
      match,
    };
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
      // dev probes only: fast-forward the zone, put the player beside a rival, end the run
      (window as unknown as { __FEL_ADVENTURE_BR__?: unknown }).__FEL_ADVENTURE_BR__ = {
        ...scene.metadata.adventureBr,
        skipZone: (sec: number) => stepZone(match.zone, sec),
        nearRival: () => {
          const p = match.player, r = [...match.world.actors.values()].find((a) => a.kind === 'bot' && a.stats.hp.cur > 0);
          if (!p || !r) return null;
          p.pos.x = r.pos.x + 3; p.pos.z = r.pos.z; p.pos.y = r.pos.y; match.movement.reset(p.id);
          return r.id;
        },
        knockOut: () => { const p = match.player; if (p) p.stats.hp.cur = 0; },
      };
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
    if (!S.ended) S.match.frame(dt);
    syncFrame(ctx, S, dt);
  },

  dispose() {
    for (const S of live) closeState(S);
    live.clear();
  },
};

function makeBody(S: { impMats: Map<number, Material>; scene: Scene }, match: BRMatch, a: AdventureActor, root: TransformNode,
  pose: TransformNode, char: SpawnedCharacter | undefined, ph: PlaceholderBody | undefined, team: number): Body {
  const view = bindMovementView({
    animator: char ? char.animator : NO_ANIM, poseNode: pose, actor: () => match.world.actors.get(a.id),
    telemetry: () => match.movement.inspect(a.id), clock: () => match.tSec,
  });
  let imp: Mesh | null = null;
  if (char) {
    let m = S.impMats.get(team);
    if (!m) {
      m = VenueKit.paint(S.scene, `br_imp_${team}`, TEAM_TINT[(team - 1) % TEAM_TINT.length]);
      S.impMats.set(team, m);
    }
    imp = MeshBuilder.CreateCapsule(`br_imp_${a.id}`, { radius: 0.35, height: 1.8, tessellation: 6, subdivisions: 1 }, S.scene);
    imp.parent = pose; imp.position.y = 0.9; imp.material = m; imp.isPickable = false;
    imp.setEnabled(false);
  }
  return { id: a.id, root, pose, char, ph, imp, view, weapon: 'weapon.fists', prop: null, fid: 'full' };
}

function skinnedVisible(S: St): number {
  let n = 0;
  for (const b of S.bodies.values()) if (b.char && b.root.isEnabled() && (b.fid === 'full' || b.fid === 'reduced')) n++;
  return n;
}

function closeState(S: St): void {
  if (typeof window !== 'undefined') delete (window as unknown as { __FEL_ADVENTURE_BR__?: unknown }).__FEL_ADVENTURE_BR__;
  S.offKeys?.(); S.offKeys = null;
  S.combatView.dispose(); S.magicView.dispose(); S.sparks.dispose(); S.speed.dispose();
  S.mapView.dispose(); S.zoneView.dispose(); S.lootView.dispose();
  for (const b of S.bodies.values()) disposeBody(b);
  S.bodies.clear();
  for (const m of S.impMats.values()) m.dispose();
  S.match.dispose();
}

function disposeBody(b: Body): void {
  b.view.dispose();
  b.prop?.dispose();
  b.imp?.dispose();
  if (b.ph) b.ph.dispose();
  else { b.char?.dispose(); b.pose.dispose(); b.root.dispose(); }
}

function camYawOf(ctx: ModeContext, S: St): number {
  ctx.camDirector.forwardFlatToRef(TMP_FWD);
  const liveYaw = Math.atan2(TMP_FWD.x, TMP_FWD.z);
  const held = Math.hypot(S.stickL.x, S.stickL.y) >= STICK_LATCH;
  const steering = Math.hypot(S.stickR.x, S.stickR.y) >= STICK_LATCH;
  if (!held) { S.latchedYaw = null; return liveYaw; }
  if (S.latchedYaw === null || steering) S.latchedYaw = liveYaw;
  return S.latchedYaw;
}

/** A summoned partner comes into the world: its body (a placeholder creature; a built character's skinned body). */
async function spawnSummonBody(ctx: ModeContext, S: St, a: AdventureActor): Promise<void> {
  const owner = S.match.fighterOf(a.id);
  if (!owner) return;
  S.spawning.add(a.id);
  try {
    if (owner.partner.kind === 'creature') {
      const ph = buildCreatureBody(ctx.scene, a, owner.partner.element, owner.partner.creature?.stage ?? 1);
      S.bodies.set(a.id, makeBody({ impMats: S.impMats, scene: ctx.scene }, S.match, a, ph.root, ph.pose, undefined, ph, owner.team));
      return;
    }
    const root = new TransformNode(`br_${a.id}`, ctx.scene);
    const pose = new TransformNode(`br_${a.id}_pose`, ctx.scene);
    pose.parent = root;
    const char = await CharacterLibrary.spawn(ctx.scene, DEFAULT_HERO_URL, { position: Vector3.Zero(), yawRad: 0, startClip: 'idle_stand', modeId: 'adventure_br', tint: '#fde68a', role: 'opponent' });
    if (ctx.scene.isDisposed || !S.match.world.actors.has(a.id)) { char.dispose(); pose.dispose(); root.dispose(); return; }
    installSafePlay(char.animator, 'adventure_br');
    char.root.parent = pose;
    S.bodies.set(a.id, makeBody({ impMats: S.impMats, scene: ctx.scene }, S.match, a, root, pose, char, undefined, owner.team));
  } finally { S.spawning.delete(a.id); }
}

function syncFrame(ctx: ModeContext, S: St, dt: number): void {
  live.add(S);
  const m = S.match;
  S.frame++;
  // summoned partners come and go with the bond
  for (const a of m.world.actors.values()) {
    if (a.kind !== 'partner' || S.bodies.has(a.id) || S.spawning.has(a.id)) continue;
    void spawnSummonBody(ctx, S, a);
  }
  for (const [id, b] of S.bodies) {
    const a = m.world.actors.get(id);
    if (!a) { disposeBody(b); S.bodies.delete(id); S.budget.forget(id); continue; }
    placeBody(b.root, a);
    const fid = S.budget.of(id);
    b.fid = fid;
    const visible = fid !== 'culled';
    if (b.root.isEnabled() !== visible) b.root.setEnabled(visible);
    if (!visible) continue;
    // the impostor past the reduced radius: the skinned body off, the team's capsule on
    if (b.char && b.imp) {
      const imp = fid === 'impostor';
      if (b.imp.isEnabled() !== imp) b.imp.setEnabled(imp);
      for (const mesh of b.char.meshes as AbstractMesh[]) if (mesh.isEnabled() === imp) mesh.setEnabled(!imp);
    }
    if (BodyBudget.animates(fid, S.frame)) b.view.sync(dt);
    // a downed body lies down
    const down = !(a.stats.hp.cur > 0);
    b.pose.rotation.x = down ? -Math.PI / 2 : b.pose.rotation.x;
    // the weapon in hand follows the kit (the arsenal's own prop and grip)
    const f = m.fighter(id);
    if (f && b.char && f.kit.weapon !== b.weapon) {
      b.weapon = f.kit.weapon;
      b.prop?.dispose(); b.prop = null;
      const w = lootById(f.kit.weapon)?.weapon;
      if (w && w !== 'fists') b.prop = equipWeapon(ctx.scene, b.char.skeleton, weaponById(w), `br_${id}_weapon`);
    }
  }
  const me = m.player;
  if (me) {
    S.sparks.sync(me, m.movement.inspect(BR_PLAYER_ID));
    S.speed.sync(me, m.movement.inspect(BR_PLAYER_ID), m.tSec);
  }
  S.combatView.sync();
  S.magicView.sync();
  S.zoneView.sync(m.zone);
  S.lootView.sync(m.loot);

  // the camera: the match's held hint as a director rig
  if (me) {
    const rig = m.camera.rig();
    if (rig.preset !== S.preset) { S.preset = rig.preset; ctx.camDirector.setPreset(rig.preset); }
    if (rig.hint !== S.rigKey) { S.rigKey = rig.hint; ctx.camDirector.tuneFollow({ distance: rig.distance, height: rig.height, lag: rig.lag, lookAhead: rig.lookAhead }); }
    ctx.camDirector.look(S.stickR.x, S.stickR.y, dt);
    const target = rig.objectiveId ? m.world.actors.get(rig.objectiveId) : undefined;
    TMP_SUBJECT.set(me.pos.x, me.pos.y, me.pos.z);
    // the follow reads its bearing off the velocity: a straight-down drop has no bearing (the director's back vector
    // would be zero and the camera would sit on the hero), so the vertical counts only when the body also moves across
    const across = Math.hypot(me.vel.x, me.vel.z);
    TMP_VEL.set(me.vel.x, across > 1 ? me.vel.y : 0, me.vel.z);
    ctx.camDirector.update(TMP_SUBJECT, TMP_VEL, target ? TMP_OBJ.set(target.pos.x, target.pos.y + target.height * 0.5, target.pos.z) : null);
    S.fovBoost += (rig.fovBoostDeg - S.fovBoost) * (1 - Math.exp(-FOV_EASE * Math.max(0, dt)));
    ctx.camera.fov = S.baseFov + (S.fovBoost * Math.PI) / 180;
    ctx.stamina?.(me.stats.stamina.max > 0 ? me.stats.stamina.cur / me.stats.stamina.max : 1);
    S.budgetIn.eye = me.pos;
  }

  // the HUD: minimal (alive, the zone's timer, your bars, the map), at HUD_HZ and only when it changed
  S.hudSec += dt;
  if (S.hudSec >= 1 / HUD_HZ || S.frame === 1) {
    S.hudSec = 0;
    const z = m.zone, n = z.circles[Math.min(z.index + 1, z.circles.length - 1)];
    const hud = {
      ...m.hud(),
      slot: S.mapper.slot() + 1,
      spell: spellName(m, S.mapper.slot()),
      mapHalf: m.map.bounds.maxX + 2,
      zx: Math.round(z.cur.x), zz: Math.round(z.cur.z), zr: Math.round(z.cur.r),
      nx: Math.round(n.x), nz: Math.round(n.z), nr: Math.round(n.r),
      px: me ? Math.round(me.pos.x) : 0, pz: me ? Math.round(me.pos.z) : 0, pyaw: me ? +me.facingYaw.toFixed(2) : 0,
    };
    const key = JSON.stringify(hud);
    if (key !== S.lastHud) { S.lastHud = key; ctx.setHud(hud); }
  }

  S.budget.update(m.world.actors.values(), dt, S.budgetIn);

  // your run is over: the end screen through the result sink after a beat
  const f = m.fighter(BR_PLAYER_ID);
  if (!S.ended && f && f.place !== null) {
    if (S.endAt === null) S.endAt = m.tSec + END_BEAT_SEC;
    if (m.tSec >= S.endAt || m.phase === 'over') {
      const r = m.result();
      if (r) {
        S.ended = true;
        ctx.end(r.won ? 'win' : 'eliminated', brScore(r), { place: r.place, teams: r.teams, kos: r.kos, damage: r.damage, survivedSec: r.survivedSec }, r);
      }
    }
  }
}

function spellName(m: BRMatch, slot: number): string | null {
  const id = m.fighter(BR_PLAYER_ID)?.kit.spells.equipped[slot] ?? null;
  return id ? m.magic.spells.get(id)?.name ?? null : null;
}
