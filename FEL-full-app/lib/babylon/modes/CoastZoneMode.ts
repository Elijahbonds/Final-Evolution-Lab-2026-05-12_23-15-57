// CoastZoneMode — the Coast & Islands, the first open zone, phase A: a walkable shell (docs/COAST-ISLANDS-PLAN.md; owner
// 2026-11-17: "The first zone is the Coast & Islands").
//
// An ordinary ModeDefinition on the Adventure's host, the way VeniceHubMode hosts the hub (no new harness): ModeHarness gives the
// scene, the tier, the camera director, the input bus and the touch deck; this file gives ONE AdventureHost
// (lib/babylon/adventure/host) with the movement only — walk, run, jump; no partner, no creatures, no combat yet (later phases) —
// and draws:
//
//   load     the zone's world (lib/adventure/coast/zoneWorld: the terrain, the dock and the bridge, the water's edge) and view
//            (zoneView: the sea, the 64 m terrain pieces, the dressing), the player through CharacterPipeline.spawnPlayer (the
//            Creator's look, the body merge #603 comes with the spawn) drawn at the hoops builder's playing height
//            (hoops/ratedPlay, #593), the input mapper (host/inputMap), the movement view.
//   update   host.frame(dt); the water's edge (a body over deep water goes back to where it could stand); the streamer (which
//            64 m pieces are drawn how, around the player); the body; the camera from the host's hints (AdventureMode's rig);
//            the spot under the player → lib/adventure/coast/zoneUi, which the page's card reads (the boat back to Venice).
//
// No shipped movement or camera number is changed: the host, the movement sim and the camera rig run exactly as Venice runs them.
// HIDDEN from the pickers: registered in MODES (so the probe bundles and /dev/mode can mount it) and NOT in
// ENABLED_BABYLON_MODES; its page is /play/coast (unlisted, noindex), reached from Venice's pier (lib/adventure/coast/door.ts).

import { TransformNode, Vector3 } from '@babylonjs/core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { CharacterPipeline } from '../core/characterPipeline';
import type { SpawnedCharacter } from '../core/CharacterLibrary';
import { applyProportions } from '../core/playerIdentity';
import { installSafePlay } from '../anim/clipRegistry';
import { DUNK_CONFIG } from './modeConfigs';
import { emptyAdventureSave, type MoveInput } from '../adventure/contracts';
import { AdventureHost } from '../adventure/host/AdventureHost';
import { createInputMapper, loadBindings, type InputMapper } from '../adventure/host/inputMap';
import { bindMovementView, type MovementView } from '../adventure/movement/view';
import { placeBody } from '../adventure/world/view';
import { loadRatedTuning, ratedLookScale } from '../hoops/ratedPlay';
import { feel } from '@/lib/feel-panel/feel';
import { devOrAgentHooks } from '@/lib/agentRunHooks';
import { buildCoastWorld, COAST_DEEP_WATER_TURN_BACK, WaterEdge } from '@/lib/adventure/coast/zoneWorld';
import { COAST_PREWARM_LATE, COAST_STREAM_ON, COAST_STREAM_SLICED, mountZoneView, type ZoneView, type ZoneViewStats } from '@/lib/adventure/coast/zoneView';
import {
  COAST_STREAM_FULL, COAST_STREAM_KEEP, COAST_STREAM_LOD, COAST_ZONE_GROW, ISLANDS, ZoneStreamer, pieceAt, setZoneGrow, zonePieces,
} from '@/lib/adventure/coast/zoneLayout';
import { zoneUi } from '@/lib/adventure/coast/zoneUi';
import { besidePlayer, COAST_PARTNER_CATCHUP_M, COAST_PARTNER_ON, COAST_PARTNER_STUCK_SEC, PartnerKeeper, zonePartner, type CatchupWhy } from '@/lib/adventure/coast/zonePartner';
import { COAST_CREATURES_ON, COAST_LOG_MEET_M, COAST_LOG_SEEN_M, CreatureHerd } from '@/lib/adventure/coast/zoneCreatures';
import { CreatureBodies, LogKeeper, mountPartnerBody, type PartnerBody } from '@/lib/adventure/coast/zoneLife';
import { adventureSavePolicy } from '../adventure/save/policy';
import { ALL_SPOTS, COAST_SPORTS_ON, COAST_TOWN_LOAD_AFTER_SEC, COAST_TOWN_ON, COAST_TOWNSFOLK, TOWNSFOLK, returnSpawnFor, sportSpotById, spotAtAll } from '@/lib/adventure/coast/zoneTown';
import { mountZoneTownView, type ZoneTownView } from '@/lib/adventure/coast/zoneTownView';
import { spotFromSearch } from '@/lib/adventure/coast/spotReturn';
import { COAST_QUESTS_ON, questById, readQuests, withPlayed, withQuestTaken, withQuestsChecked } from '@/lib/adventure/coast/zoneQuests';
import type { ZoneSpot } from '@/lib/adventure/coast/zoneLayout';
import { signedOutVisitor } from '../core/visitor';   // the harness sets it from runMode's `guest` on every mount

export const COAST_MODE_ID = 'coast_zone';
/** The stick's basis latches while held (AdventureMode's rule): below this it lets go. */
const STICK_LATCH = 0.15;
/** How often the spot under the player is looked up (s). */
const SPOT_EVERY = 0.1;

interface St {
  host: AdventureHost;
  mapper: InputMapper;
  view: ZoneView;
  me: SpawnedCharacter;
  body: TransformNode;
  move: MovementView;
  edge: WaterEdge;
  streamer: ZoneStreamer;
  stickL: { x: number; y: number };
  stickR: { x: number; y: number };
  latchedYaw: number | null;
  preset: string;
  rigKey: string;
  spotSec: number;
  /** Phase B: the partner (its body, its own water's edge, the last catch-up), the creatures, the log. */
  partner: PartnerBody | null;
  partnerEdge: WaterEdge | null;
  keeper: PartnerKeeper;
  herd: CreatureHerd | null;
  creatures: CreatureBodies | null;
  log: LogKeeper;
  creaturesShown: number;
  /** Phase D: the town, the spots this visit offers, the quests. */
  town: ZoneTownView | null;
  spots: readonly ZoneSpot[];
  questsOn: boolean;
  /** Phase F-lite: the zone's own frame cost, in parts (probes read the worst frames: where a hitch comes from). */
  cost: FrameCosts;
}

/** The worst frames of the zone's update, by its parts (ms), with the time they ran (performance.now) and what streamed. */
export interface FrameCost { at: number; total: number; host: number; life: number; town: number; stream: number; view: number; changed: number }
class FrameCosts {
  readonly worst: FrameCost[] = [];
  note(c: FrameCost): void {
    if (this.worst.length < 10) { this.worst.push(c); this.worst.sort((a, b) => b.total - a.total); return; }
    if (c.total <= this.worst[this.worst.length - 1].total) return;
    this.worst[this.worst.length - 1] = c; this.worst.sort((a, b) => b.total - a.total);
  }
}

const states = new WeakMap<object, St>();
const live = new Set<St>();
const TMP_FWD = new Vector3(), TMP_SUBJECT = new Vector3(), TMP_VEL = new Vector3();

/** What the phone rig (scripts/probes/coast-islands) reads: where the player is and what the streamer is drawing. */
export interface CoastProbe {
  x: number; y: number; z: number; piece: string; full: number; lod: number; far: number; turnedBack: number; view: ZoneViewStats;
  partner: { x: number; z: number; gap: number } | null; catchups: Record<CatchupWhy, number>; creaturesShown: number; logged: number; logStores: number;
  /** Phase F-lite: the zone update's ten worst frames, by part; the town's loads (when they landed). */
  worstFrames: FrameCost[];
  townEvents: Array<{ what: string; at: number }>;
}
let probeState: St | null = null;
export function coastProbe(): CoastProbe | null {
  const S = probeState;
  if (!S) return null;
  const p = S.host.player.pos, [i, j] = pieceAt(p.x, p.z);
  const q = S.host.partnerActor;
  return {
    x: p.x, y: p.y, z: p.z, piece: `${i},${j}`, full: S.streamer.count('full'), lod: S.streamer.count('lod'), far: S.streamer.count('far'), turnedBack: S.edge.turnedBack, view: S.view.stats(),
    partner: q ? { x: q.pos.x, z: q.pos.z, gap: Math.hypot(q.pos.x - p.x, q.pos.z - p.z) } : null, catchups: { ...S.keeper.counts }, creaturesShown: S.creaturesShown,
    logged: S.log.entries().filter((e) => e.level > 0).length, logStores: S.log.stores,
    worstFrames: S.cost.worst.map((c) => ({ ...c })),
    townEvents: S.town ? S.town.events.map((e) => ({ ...e })) : [],
  };
}

/** No fights yet in the zone: a press that would start one does nothing (the movement sim sees walk, run, jump, dash). The Venice
 *  hub's rule (VeniceHubMode walkOnly), kept here so the zone does not reach into the hub's file. */
export function zoneMoveOnly(inp: MoveInput): MoveInput {
  inp.attackLight = false; inp.attackHeavy = false; inp.lock = false; inp.guardHeld = false;
  inp.magic = false; inp.magicHeld = false; inp.magicSlot = null; inp.focusHeld = false;
  inp.partner = false; inp.fuse = false; inp.ascendHeld = false; inp.descendHeld = false;
  return inp;
}

/**
 * THE PROBE'S DRIVER (scripts/probes/coast-islands/zone-rig.mts): run the player toward a point, the way the headless test walks
 * the host (the move held forward, the yaw on the target), so a scripted walk does not depend on where the camera looks. Only
 * under next dev or an agent run (lib/agentRunHooks); null lets go. It moves nothing a player could not move with the stick.
 */
let driveTo: { x: number; z: number } | null = null;
export function coastProbeDrive(t: { x: number; z: number } | null): void { driveTo = t && devOrAgentHooks() ? { x: t.x, z: t.z } : null; }

/** The quests to the page, and the "!" over the townsfolk whose quest is on offer. */
function publishQuests(S: St, note: { id: string; title: string; at: number } | null): void {
  const qs = S.questsOn ? readQuests(S.log.doc) : [];
  zoneUi.setQuests(qs, note ?? zoneUi.getSnapshot().questNote);
  const offers = new Set<string>();
  if (S.questsOn) for (const p of TOWNSFOLK) if (p.questId && qs.find((q) => q.id === p.questId)?.state === 0) offers.add(p.id);
  S.town?.setOffers(offers);
}

/** A taken quest whose thing is now done becomes done (saved), with a note. */
function checkQuests(S: St): void {
  let finished: string[] = [];
  S.log.update((sv) => { const r = withQuestsChecked(sv); if (!r) return null; finished = r.finished.map((q) => q.id); return r.save; });
  if (finished.length) { const q = questById(finished[finished.length - 1])!; publishQuests(S, { id: q.id, title: q.title, at: Date.now() }); }
}

function camYawOf(ctx: ModeContext, S: St): number {
  ctx.camDirector.forwardFlatToRef(TMP_FWD);
  const yaw = Math.atan2(TMP_FWD.x, TMP_FWD.z);
  const held = Math.hypot(S.stickL.x, S.stickL.y) >= STICK_LATCH;
  const steering = Math.hypot(S.stickR.x, S.stickR.y) >= STICK_LATCH;
  if (!held) { S.latchedYaw = null; return yaw; }
  if (S.latchedYaw === null || steering) S.latchedYaw = yaw;
  return S.latchedYaw;
}

export const CoastZoneMode: ModeDefinition = {
  modeId: COAST_MODE_ID,
  mood: 'daylight',
  backdrop: 'ocean',
  camPreset: 'runner',

  async load(ctx: ModeContext) {
    const scene = ctx.scene;
    zoneUi.reset();
    // phase D: the town and the sports spots; a game opened from a spot comes back to it (`?spot=`, spotReturn.ts)
    const townOn = feel('coast.townOn', COAST_TOWN_ON) >= 0.5;
    const sportsOn = feel('coast.sportsOn', COAST_SPORTS_ON) >= 0.5;
    const questsOn = townOn && feel('coast.questsOn', COAST_QUESTS_ON) >= 0.5;
    // phase F-lite: the four pieces past Reef Rock (open sea, the sandbank, Gull Key), before anything reads the layout
    setZoneGrow(feel('coast.zoneGrow', COAST_ZONE_GROW) >= 0.5);
    const back = sportsOn && typeof window !== 'undefined' ? spotFromSearch(window.location.search) : null;
    const world = buildCoastWorld({ town: townOn, spawn: back ? returnSpawnFor(back) : null });
    // the Adventure save (the log lives in it; the party's partner comes from it), read once; a guest's stays on the device
    const log = new LogKeeper({ now: () => Date.now(), policy: adventureSavePolicy({ signedIn: !signedOutVisitor() }) });
    // one partner (owner 2026-11-17): the save's own, or the Adventure's default creature on loan (never written back)
    const partnerOn = feel('coast.partnerOn', COAST_PARTNER_ON) >= 0.5;
    const pick = partnerOn ? zonePartner(log.doc) : { partner: null, loaned: false };
    const party = { ...emptyAdventureSave(0), partner: pick.partner };
    const partnerSpawn = { pos: besidePlayer(world.spawn.pos, world.spawn.yaw, { x: 0, y: 0, z: 0 }), yaw: world.spawn.yaw };
    const host = new AdventureHost({ world: world.source, save: party, playerSpawn: world.spawn, partnerSpawn, band: ctx.prqBand ?? null });

    // the place first, around where you arrive (the plan's "you and your 3 × 3 first" loading rule)
    const streamOn = feel('coast.streamOn', COAST_STREAM_ON) >= 0.5;
    // give the page a turn between the heavy steps (a tap on the way back is answered while the zone loads)
    const breathe = () => new Promise<void>((r) => setTimeout(r, 0));
    await breathe();
    const prewarm = feel('coast.prewarmLate', COAST_PREWARM_LATE) >= 0.5;
    const view = mountZoneView(scene, { streamOn, sliced: feel('coast.streamSliced', COAST_STREAM_SLICED) >= 0.5, prewarm });
    await breathe();
    const streamer = new ZoneStreamer({
      full: Math.round(feel('coast.streamFull', COAST_STREAM_FULL)),
      lod: Math.round(feel('coast.streamLod', COAST_STREAM_LOD)),
      keep: Math.round(feel('coast.streamKeep', COAST_STREAM_KEEP)),
    });
    const [pi, pj] = pieceAt(world.spawn.pos.x, world.spawn.pos.z);
    streamer.step(pi, pj);
    view.stream(streamer.tiers, zonePieces().map((p) => p.key));
    await breathe();

    // the player: the Creator's look through the identity layer, at the hoops builder's playing height (drawing only)
    const body = new TransformNode('coast_player', scene);
    const pose = new TransformNode('coast_player_pose', scene);
    pose.parent = body;
    const me = await CharacterPipeline.spawnPlayer(scene, DUNK_CONFIG.heroUrl, { position: Vector3.Zero(), yawRad: 0, startClip: 'idle_stand', modeId: COAST_MODE_ID });
    installSafePlay(me.animator, COAST_MODE_ID);
    me.root.parent = pose; me.root.position.set(0, 0, 0); me.root.rotation.set(0, 0, 0);
    void loadRatedTuning(scene.metadata).then((r) => {
      const k = ratedLookScale(r);
      if (k !== 1 && !scene.isDisposed) applyProportions(me, { heightScale: k, buildScale: 1 });
    }).catch(() => { /* today's height */ });
    const move = bindMovementView({ animator: me.animator, poseNode: pose, actor: () => host.world.actors.get(host.playerId), telemetry: () => host.movement.inspect(host.playerId), clock: () => host.tSec });

    await breathe();
    const partner = pick.partner ? await mountPartnerBody(scene, host, pick.partner, COAST_MODE_ID) : null;
    const herd = feel('coast.creaturesOn', COAST_CREATURES_ON) >= 0.5 ? new CreatureHerd() : null;
    const creatures = herd ? new CreatureBodies(scene, herd) : null;

    const mapper = createInputMapper({ bindings: loadBindings() });
    const S: St = {
      host, mapper, view, me, body, move, edge: new WaterEdge(world.spawn.pos), streamer,
      stickL: { x: 0, y: 0 }, stickR: { x: 0, y: 0 }, latchedYaw: null, preset: 'runner', rigKey: '', spotSec: SPOT_EVERY,
      partner, partnerEdge: host.partnerActor ? new WaterEdge(host.partnerActor.pos) : null, keeper: new PartnerKeeper(),
      herd, creatures, log, creaturesShown: 0, town: null, spots: ALL_SPOTS, questsOn: false, cost: new FrameCosts(),
    };
    zoneUi.setLog(log.entries(), null);
    // back from a spot's game: it counts as played there (the beach net's quest)
    if (back) log.update((sv) => withPlayed(sv, back, (id) => !!sportSpotById(id)));
    S.town = townOn ? mountZoneTownView(scene, { townsfolk: Math.round(feel('coast.townsfolk', COAST_TOWNSFOLK)), sports: sportsOn, heavyAfterSec: feel('coast.townLoadAfterSec', COAST_TOWN_LOAD_AFTER_SEC), prewarm }) : null;
    S.spots = ALL_SPOTS.filter((x) => (x.kind === 'sport' ? sportsOn : x.kind === 'person' ? townOn && TOWNSFOLK.indexOf(x as (typeof TOWNSFOLK)[number]) < Math.round(feel('coast.townsfolk', COAST_TOWNSFOLK)) : true));
    S.questsOn = questsOn;
    if (questsOn) {
      zoneUi.onTakeQuest((id) => { if (S.log.update((sv) => withQuestTaken(sv, id))) publishQuests(S, null); });
      checkQuests(S);
    }
    publishQuests(S, null);
    host.setInputSource(host.playerId, (out) => {
      mapper.fill(out, { camYaw: camYawOf(ctx, S), state: host.player.state });
      if (driveTo) { const p = host.player.pos; out.camYaw = Math.atan2(driveTo.x - p.x, driveTo.z - p.z); out.move.x = 0; out.move.y = 1; }
      zoneMoveOnly(out);
    });
    ctx.heroRef.current = body;   // the harness frames and checks the player by it (FrameGuard assertSpawned)
    states.set(scene, S); live.add(S); probeState = S;
    placeBody(body, host.player);
    // the camera starts behind the player: on the dock looking out at Palm Key and the bridge, or, back from a game, at its spot
    const isl = ISLANDS[0], came = back ? sportSpotById(back) : undefined;
    const look = came ? new Vector3(came.at[0], host.player.pos.y + 1, came.at[1]) : new Vector3(isl.at[0], 2, isl.at[1]);
    ctx.camDirector.snapTo(new Vector3(host.player.pos.x, host.player.pos.y, host.player.pos.z), look);
    view.frame(ctx.camera.position.x, ctx.camera.position.z, 0);
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
    const h = S.host;
    const t0 = performance.now();
    h.frame(dt);
    const me = h.player;
    const edgeOn = feel('coast.deepWaterTurnBack', COAST_DEEP_WATER_TURN_BACK) >= 0.5;
    const turnedBack = S.edge.hold(me, edgeOn);
    placeBody(S.body, me);
    S.move.sync(dt);

    // the partner: its own water's edge, then the catch-up (left behind, in deep water, or after your turn-back)
    const q = h.partnerActor;
    if (q && S.partner) {
      S.partnerEdge?.hold(q, edgeOn);
      S.keeper.step(me, q, dt, {
        catchupM: feel('coast.partnerCatchupM', COAST_PARTNER_CATCHUP_M), stuckSec: feel('coast.partnerStuckSec', COAST_PARTNER_STUCK_SEC),
        playerTurnedBack: turnedBack, reset: (id) => h.movement.reset(id),
      });
      placeBody(S.partner.root, q);
      S.partner.view.sync(dt);
    }
    const t1 = performance.now();
    if (S.herd && S.creatures) { S.herd.step(dt); S.creaturesShown = S.creatures.frame(dt, S.streamer.tiers); }
    const t2 = performance.now();
    S.town?.update(dt);
    const t3 = performance.now();

    // streaming: only when the player crosses into another 64 m piece does anything change
    const [pi, pj] = pieceAt(me.pos.x, me.pos.z);
    const changed = S.streamer.step(pi, pj);
    if (changed.length) S.view.stream(S.streamer.tiers, changed);
    const t4 = performance.now();

    // the camera: the host's held hint as a director rig (AdventureMode's)
    const rig = h.camera.rig();
    if (rig.preset !== S.preset) { S.preset = rig.preset; ctx.camDirector.setPreset(rig.preset); }
    if (rig.hint !== S.rigKey) { S.rigKey = rig.hint; ctx.camDirector.tuneFollow({ distance: rig.distance, height: rig.height, lag: rig.lag, lookAhead: rig.lookAhead }); }
    ctx.camDirector.look(S.stickR.x, S.stickR.y, dt);
    TMP_SUBJECT.set(me.pos.x, me.pos.y, me.pos.z);
    TMP_VEL.set(me.vel.x, me.vel.y, me.vel.z);
    ctx.camDirector.update(TMP_SUBJECT, TMP_VEL, null);
    const t5 = performance.now();
    S.view.frame(ctx.camera.position.x, ctx.camera.position.z, dt);
    const t6 = performance.now();
    S.cost.note({ at: Math.round(t0), total: +(t6 - t0).toFixed(1), host: +(t1 - t0).toFixed(1), life: +(t2 - t1).toFixed(1), town: +(t3 - t2).toFixed(1), stream: +(t4 - t3).toFixed(1), view: +(t6 - t5).toFixed(1), changed: changed.length });

    S.spotSec += dt;
    if (S.spotSec >= SPOT_EVERY) {
      S.spotSec = 0;
      zoneUi.setSpot(spotAtAll(me.pos.x, me.pos.z, S.spots));
      // the creature log: seen within coast.logSeenM, met within coast.logMeetM (a log only moves up)
      if (S.herd) {
        const seenM = feel('coast.logSeenM', COAST_LOG_SEEN_M), meetM = feel('coast.logMeetM', COAST_LOG_MEET_M);
        for (const c of S.herd.near(me.pos.x, me.pos.z, seenM)) {
          const met = Math.hypot(c.x - me.pos.x, c.z - me.pos.z) <= meetM;
          const note = S.log.note(c.id, met ? 2 : 1);
          if (note) zoneUi.setLog(S.log.entries(), note);
        }
      }
      if (S.questsOn) checkQuests(S);
    }
  },

  dispose() {
    // the harness disposes the scene; the per-scene state goes with its WeakMap entry. Live states are closed here.
    zoneUi.reset();
    for (const S of live) { S.move.dispose(); S.view.dispose(); S.partner?.dispose(); S.creatures?.dispose(); S.town?.dispose(); }
    live.clear();
    probeState = null;
    driveTo = null;
  },
};
