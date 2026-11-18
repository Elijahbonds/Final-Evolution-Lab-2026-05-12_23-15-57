// VeniceHubMode — the Venice hub, V1: the walkable hoops park (docs/VENICE-HUB-PLAN.md §5, V1; owner go 2026-11-17).
//
// An ordinary ModeDefinition on the Adventure's host, the way AdventureMode hosts it (no new harness): ModeHarness gives the
// scene, the tier, the camera director, the input bus and the touch deck; this file gives ONE AdventureHost
// (lib/babylon/adventure/host) with the movement only — walk, run, jump; no partner, no combat, no magic in Venice — and draws:
//
//   load     the courts district's world (lib/adventure/venice/hubWorld) and view (courtsView: the shipped Venice court kit,
//            one painted court shared by the four courts), the player through CharacterPipeline.spawnPlayer (the identity
//            layer dresses them in the Creator's look) drawn at the hoops builder's playing height (hoops/ratedPlay, #593),
//            the input mapper (host/inputMap), the movement view.
//   update   host.frame(dt), the body, the camera from the host's hints (AdventureMode's rig), and the walk-up spot under
//            the player → lib/adventure/venice/hubUi, which the page's card reads. The card opens the court's mode on its own
//            page (hubReturn.launchHref): no mode file is touched to be launched.
//
// Arriving with `?spot=<court>` (the end screen's "back to Venice") puts the player beside that court (hubWorld.returnSpawnFor).
// HIDDEN from the pickers: registered in MODES (so the probe bundles and /dev/mode can mount it) and NOT in
// ENABLED_BABYLON_MODES; its page is /play/venice (unlisted, noindex), reached from the Play screen's Venice door.

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
import { buildHubWorld, courtsRect, returnSpawnFor, v1WalkupSpots } from '@/lib/adventure/venice/hubWorld';
import { mountCourtsView, type CourtsView } from '@/lib/adventure/venice/courtsView';
import { hubUi } from '@/lib/adventure/venice/hubUi';
import { spotFromSearch } from '@/lib/adventure/venice/hubReturn';
import { spotAt, type Spot } from '@/lib/adventure/venice/layout';

export const VENICE_MODE_ID = 'venice_hub';
/** The stick's basis latches while held (AdventureMode's rule): below this it lets go. */
const STICK_LATCH = 0.15;
/** How often the walk-up spot is looked up (s). [TUNE] */
const SPOT_EVERY = 0.1;

interface St {
  host: AdventureHost;
  mapper: InputMapper;
  view: CourtsView;
  me: SpawnedCharacter;
  body: TransformNode;
  move: MovementView;
  stickL: { x: number; y: number };
  stickR: { x: number; y: number };
  latchedYaw: number | null;
  preset: string;
  rigKey: string;
  spotSec: number;
  spots: Spot[];
}

const states = new WeakMap<object, St>();
const live = new Set<St>();
const TMP_FWD = new Vector3(), TMP_SUBJECT = new Vector3(), TMP_VEL = new Vector3();

/** Venice has no fights: a press that would start one does nothing here (the movement sim sees walk, run, jump, dash). */
export function walkOnly(inp: MoveInput): MoveInput {
  inp.attackLight = false; inp.attackHeavy = false; inp.lock = false; inp.guardHeld = false;
  inp.magic = false; inp.magicHeld = false; inp.magicSlot = null; inp.focusHeld = false;
  inp.partner = false; inp.fuse = false; inp.ascendHeld = false; inp.descendHeld = false;
  return inp;
}

function camYawOf(ctx: ModeContext, S: St): number {
  ctx.camDirector.forwardFlatToRef(TMP_FWD);
  const live = Math.atan2(TMP_FWD.x, TMP_FWD.z);
  const held = Math.hypot(S.stickL.x, S.stickL.y) >= STICK_LATCH;
  const steering = Math.hypot(S.stickR.x, S.stickR.y) >= STICK_LATCH;
  if (!held) { S.latchedYaw = null; return live; }
  if (S.latchedYaw === null || steering) S.latchedYaw = live;
  return S.latchedYaw;
}

export const VeniceHubMode: ModeDefinition = {
  modeId: VENICE_MODE_ID,
  mood: 'goldenHour',
  backdrop: 'venice',
  camPreset: 'runner',

  async load(ctx: ModeContext) {
    const scene = ctx.scene;
    hubUi.reset();
    const world = buildHubWorld();
    const back = typeof window !== 'undefined' ? spotFromSearch(window.location.search) : null;
    const spawn = (back && returnSpawnFor(back)) || world.spawn;
    const host = new AdventureHost({ world: world.source, save: emptyAdventureSave(0), playerSpawn: spawn, band: ctx.prqBand ?? null });

    // the courts first (the court and you first: the plan's loading rule); the dressing lands after
    const view = mountCourtsView(scene);

    // the player: the Creator's look through the identity layer, at the hoops builder's playing height (drawing only)
    const body = new TransformNode('venice_player', scene);
    const pose = new TransformNode('venice_player_pose', scene);
    pose.parent = body;
    const me = await CharacterPipeline.spawnPlayer(scene, DUNK_CONFIG.heroUrl, { position: Vector3.Zero(), yawRad: 0, startClip: 'idle_stand', modeId: VENICE_MODE_ID });
    installSafePlay(me.animator, VENICE_MODE_ID);
    me.root.parent = pose; me.root.position.set(0, 0, 0); me.root.rotation.set(0, 0, 0);
    void loadRatedTuning(scene.metadata).then((r) => {
      const k = ratedLookScale(r);
      if (k !== 1 && !scene.isDisposed) applyProportions(me, { heightScale: k, buildScale: 1 });
    }).catch(() => { /* today's height */ });
    const move = bindMovementView({ animator: me.animator, poseNode: pose, actor: () => host.world.actors.get(host.playerId), telemetry: () => host.movement.inspect(host.playerId), clock: () => host.tSec });

    const mapper = createInputMapper({ bindings: loadBindings() });
    const S: St = {
      host, mapper, view, me, body, move, stickL: { x: 0, y: 0 }, stickR: { x: 0, y: 0 }, latchedYaw: null,
      preset: 'runner', rigKey: '', spotSec: SPOT_EVERY, spots: v1WalkupSpots(),
    };
    host.setInputSource(host.playerId, (out) => { mapper.fill(out, { camYaw: camYawOf(ctx, S), state: host.player.state }); walkOnly(out); });
    ctx.heroRef.current = body;   // the harness frames and checks the player by it (FrameGuard assertSpawned)
    states.set(scene, S); live.add(S);
    placeBody(body, host.player);
    // the camera starts behind the player, looking at the courts (a cold start) or at the court they came back to
    const c = courtsRect(), court = back ? S.spots.find((x) => x.id === back) : undefined;
    const look = court ? new Vector3(court.at[0], 0, court.at[1]) : new Vector3((c.minX + c.maxX) / 2, 0, (c.minZ + c.maxZ) / 2);
    ctx.camDirector.snapTo(new Vector3(host.player.pos.x, host.player.pos.y, host.player.pos.z), look);
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
    placeBody(S.body, me);
    S.move.sync(dt);

    // the camera: the host's held hint as a director rig (AdventureMode's)
    const rig = h.camera.rig();
    if (rig.preset !== S.preset) { S.preset = rig.preset; ctx.camDirector.setPreset(rig.preset); }
    if (rig.hint !== S.rigKey) { S.rigKey = rig.hint; ctx.camDirector.tuneFollow({ distance: rig.distance, height: rig.height, lag: rig.lag, lookAhead: rig.lookAhead }); }
    ctx.camDirector.look(S.stickR.x, S.stickR.y, dt);
    TMP_SUBJECT.set(me.pos.x, me.pos.y, me.pos.z);
    TMP_VEL.set(me.vel.x, me.vel.y, me.vel.z);
    ctx.camDirector.update(TMP_SUBJECT, TMP_VEL, null);

    // the walk-up spot under the player (the page's card)
    S.spotSec += dt;
    if (S.spotSec >= SPOT_EVERY) {
      S.spotSec = 0;
      const found = spotAt(me.pos.x, me.pos.z);
      const hit = found && S.spots.some((s) => s.id === found.id) ? found : null;
      hubUi.setSpot(hit);
    }
  },

  dispose() {
    // the harness disposes the scene; the per-scene state goes with its WeakMap entry. Live states are closed here.
    hubUi.reset();
    for (const S of live) { S.move.dispose(); S.view.dispose(); }
    live.clear();
  },
};
