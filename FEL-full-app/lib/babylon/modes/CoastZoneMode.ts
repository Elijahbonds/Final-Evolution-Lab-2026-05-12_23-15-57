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
import { buildCoastWorld, COAST_DEEP_WATER_TURN_BACK, WaterEdge } from '@/lib/adventure/coast/zoneWorld';
import { COAST_STREAM_ON, mountZoneView, type ZoneView, type ZoneViewStats } from '@/lib/adventure/coast/zoneView';
import {
  COAST_STREAM_FULL, COAST_STREAM_KEEP, COAST_STREAM_LOD, ISLANDS, ZoneStreamer, pieceAt, spotAtZone, zonePieces,
} from '@/lib/adventure/coast/zoneLayout';
import { zoneUi } from '@/lib/adventure/coast/zoneUi';

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
}

const states = new WeakMap<object, St>();
const live = new Set<St>();
const TMP_FWD = new Vector3(), TMP_SUBJECT = new Vector3(), TMP_VEL = new Vector3();

/** What the phone rig (scripts/probes/coast-islands) reads: where the player is and what the streamer is drawing. */
export interface CoastProbe { x: number; y: number; z: number; piece: string; full: number; lod: number; far: number; turnedBack: number; view: ZoneViewStats }
let probeState: St | null = null;
export function coastProbe(): CoastProbe | null {
  const S = probeState;
  if (!S) return null;
  const p = S.host.player.pos, [i, j] = pieceAt(p.x, p.z);
  return { x: p.x, y: p.y, z: p.z, piece: `${i},${j}`, full: S.streamer.count('full'), lod: S.streamer.count('lod'), far: S.streamer.count('far'), turnedBack: S.edge.turnedBack, view: S.view.stats() };
}

/** No fights yet in the zone: a press that would start one does nothing (the movement sim sees walk, run, jump, dash). The Venice
 *  hub's rule (VeniceHubMode walkOnly), kept here so the zone does not reach into the hub's file. */
export function zoneMoveOnly(inp: MoveInput): MoveInput {
  inp.attackLight = false; inp.attackHeavy = false; inp.lock = false; inp.guardHeld = false;
  inp.magic = false; inp.magicHeld = false; inp.magicSlot = null; inp.focusHeld = false;
  inp.partner = false; inp.fuse = false; inp.ascendHeld = false; inp.descendHeld = false;
  return inp;
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
    const world = buildCoastWorld();
    const host = new AdventureHost({ world: world.source, save: emptyAdventureSave(0), playerSpawn: world.spawn, band: ctx.prqBand ?? null });

    // the place first, around where you arrive (the plan's "you and your 3 × 3 first" loading rule)
    const streamOn = feel('coast.streamOn', COAST_STREAM_ON) >= 0.5;
    const view = mountZoneView(scene, { streamOn });
    const streamer = new ZoneStreamer({
      full: Math.round(feel('coast.streamFull', COAST_STREAM_FULL)),
      lod: Math.round(feel('coast.streamLod', COAST_STREAM_LOD)),
      keep: Math.round(feel('coast.streamKeep', COAST_STREAM_KEEP)),
    });
    const [pi, pj] = pieceAt(world.spawn.pos.x, world.spawn.pos.z);
    streamer.step(pi, pj);
    view.stream(streamer.tiers, zonePieces().map((p) => p.key));

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

    const mapper = createInputMapper({ bindings: loadBindings() });
    const S: St = {
      host, mapper, view, me, body, move, edge: new WaterEdge(world.spawn.pos), streamer,
      stickL: { x: 0, y: 0 }, stickR: { x: 0, y: 0 }, latchedYaw: null, preset: 'runner', rigKey: '', spotSec: SPOT_EVERY,
    };
    host.setInputSource(host.playerId, (out) => { mapper.fill(out, { camYaw: camYawOf(ctx, S), state: host.player.state }); zoneMoveOnly(out); });
    ctx.heroRef.current = body;   // the harness frames and checks the player by it (FrameGuard assertSpawned)
    states.set(scene, S); live.add(S); probeState = S;
    placeBody(body, host.player);
    // the camera starts behind the player on the dock, looking out at Palm Key and the bridge
    const isl = ISLANDS[0];
    ctx.camDirector.snapTo(new Vector3(host.player.pos.x, host.player.pos.y, host.player.pos.z), new Vector3(isl.at[0], 2, isl.at[1]));
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
    h.frame(dt);
    const me = h.player;
    S.edge.hold(me, feel('coast.deepWaterTurnBack', COAST_DEEP_WATER_TURN_BACK) >= 0.5);
    placeBody(S.body, me);
    S.move.sync(dt);

    // streaming: only when the player crosses into another 64 m piece does anything change
    const [pi, pj] = pieceAt(me.pos.x, me.pos.z);
    const changed = S.streamer.step(pi, pj);
    if (changed.length) S.view.stream(S.streamer.tiers, changed);

    // the camera: the host's held hint as a director rig (AdventureMode's)
    const rig = h.camera.rig();
    if (rig.preset !== S.preset) { S.preset = rig.preset; ctx.camDirector.setPreset(rig.preset); }
    if (rig.hint !== S.rigKey) { S.rigKey = rig.hint; ctx.camDirector.tuneFollow({ distance: rig.distance, height: rig.height, lag: rig.lag, lookAhead: rig.lookAhead }); }
    ctx.camDirector.look(S.stickR.x, S.stickR.y, dt);
    TMP_SUBJECT.set(me.pos.x, me.pos.y, me.pos.z);
    TMP_VEL.set(me.vel.x, me.vel.y, me.vel.z);
    ctx.camDirector.update(TMP_SUBJECT, TMP_VEL, null);
    S.view.frame(ctx.camera.position.x, ctx.camera.position.z, dt);

    S.spotSec += dt;
    if (S.spotSec >= SPOT_EVERY) { S.spotSec = 0; zoneUi.setSpot(spotAtZone(me.pos.x, me.pos.z)); }
  },

  dispose() {
    // the harness disposes the scene; the per-scene state goes with its WeakMap entry. Live states are closed here.
    zoneUi.reset();
    for (const S of live) { S.move.dispose(); S.view.dispose(); }
    live.clear();
    probeState = null;
  },
};
