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
import { buildHubWorld, courtsRect, returnSpawnFor, v1Area, v1Spots } from '@/lib/adventure/venice/hubWorld';
import { mountCourtsView, type CourtsView } from '@/lib/adventure/venice/courtsView';
import { hubPos, hubUi } from '@/lib/adventure/venice/hubUi';
import { spotFromSearch } from '@/lib/adventure/venice/hubReturn';
import type { Spot } from '@/lib/adventure/venice/layout';
import { COURT_HALF } from '@/lib/adventure/venice/courtsView';
import { devOrAgentHooks } from '@/lib/agentRunHooks';
import { feel } from '@/lib/feel-panel/feel';
import { SoundKit } from '../audio/SoundKit';
import { mountHubLife, VENICE_LIFE, type HubLife } from '@/lib/adventure/venice/hubLife';
import { HubSoundscape, VENICE_SOUND } from '@/lib/adventure/venice/hubSound';
import { hubSolids, palmSolid, probeRoute, v1Hit, VENICE_SOLIDS, Walkup, WALKUP_V2 } from '@/lib/adventure/venice/hubSolids';
import { VENICE_LOOK_V2 } from '@/lib/adventure/venice/courtsDressing';
import type { GroundPiece } from '../adventure/world/pieces';

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
  /** A probe's scripted walk (window.__VENICE__.walkTo, dev / agent runs only): the point the player walks to, or null. */
  auto: { x: number; z: number } | null;
  /** The scripted walk's next legs after `auto` (walkTo's route round the fences, phase 8). */
  autoPath: Array<{ x: number; z: number }>;
  /** Frames played: the deferred scenery is asked for on the second (you can move first). */
  frames: number;
  /** Phase 6 (venue.veniceLife): gulls, and watchers on desktop and up; mounted once the deferred scenery has landed. */
  life: HubLife | null;
  /** Phase 7 (venue.veniceSound): the beach bed is started in load; the steps, far games and the run's cheers tick here. */
  sound: HubSoundscape | null;
  /** Phase 8 (venue.walkupV2): the card's dwell and hold; null = V1's box. */
  walkup: Walkup | null;
  /** Phase 8 (venue.veniceSolids): the world's pieces, so the palms join them once the dressing has placed them; null = off. */
  solids: GroundPiece[] | null;
  disposed: boolean;
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
    // phase 8: the hoops, the boardwalk row and (with phase 5's furniture) the fences, benches and poles are solid
    const solidsOn = feel('venue.veniceSolids', VENICE_SOLIDS) >= 0.5;
    if (solidsOn) world.pieces.push(...hubSolids(v1Spots(), feel('venue.veniceLookV2', VENICE_LOOK_V2) >= 0.5));
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
      preset: 'runner', rigKey: '', spotSec: SPOT_EVERY, spots: v1Spots(), auto: null, autoPath: [], frames: 0,
      life: null, sound: null, disposed: false,
      walkup: feel('venue.walkupV2', WALKUP_V2) >= 0.5 ? new Walkup(v1Spots()) : null, solids: solidsOn ? world.pieces : null,
    };
    // phase 7: the beach bed now (so the harness's crowd bed for the mood stays off); the rest of the soundscape ticks in update
    if (feel('venue.veniceSound', VENICE_SOUND) >= 0.5) {
      SoundKit.startAmbient('ocean');
      S.sound = new HubSoundscape((name, o) => SoundKit.play(name, o));
    }
    host.setInputSource(host.playerId, (out) => {
      mapper.fill(out, { camYaw: camYawOf(ctx, S), state: host.player.state });
      walkOnly(out);
      // a probe's scripted walk: the stick held toward the point in world space (camYaw 0: move.x = +x, move.y = +z)
      if (S.auto) {
        const dx = S.auto.x - host.player.pos.x, dz = S.auto.z - host.player.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.8) S.auto = S.autoPath.shift() ?? null;
        else { out.camYaw = 0; out.move.x = dx / d; out.move.y = dz / d; }
      }
    });
    // PROBES ONLY (dev, or an agent run on a loopback host: lib/agentRunHooks): walk to a court's ring, read where you are
    if (typeof window !== 'undefined' && devOrAgentHooks()) {
      (window as unknown as { __VENICE__?: unknown }).__VENICE__ = {
        spots: () => S.spots.map((x) => x.id),
        // to a court's ring the way a player goes once the fences are solid (phase 8): along the open corridors, never through a court
        walkTo: (id: string) => {
          const t = S.spots.find((x) => x.id === id);
          if (!t) { S.auto = null; S.autoPath = []; return false; }
          const path = probeRoute(S.spots, { x: host.player.pos.x, z: host.player.pos.z }, t);
          S.auto = path.shift() ?? null; S.autoPath = path; return true;
        },
        walkToPoint: (x: number, z: number) => { S.auto = { x, z }; S.autoPath = []; },
        stop: () => { S.auto = null; S.autoPath = []; },
        state: () => ({ x: host.player.pos.x, z: host.player.pos.z, y: host.player.pos.y, walking: !!S.auto, spot: hubUi.getSnapshot().spot?.id ?? null }),
        // the stuck check (phase 8): is the player inside a solid (a block taller than a step above their feet)?
        inSolid: () => !!S.solids?.some((p) => p.kind === 'block' && !p.off && host.player.pos.x > p.minX && host.player.pos.x < p.maxX && host.player.pos.z > p.minZ && host.player.pos.z < p.maxZ && p.top > host.player.pos.y + 0.45),
        // the round-trip probe's leak counts (phase 10): what this scene holds, and the sound kit's bed
        counts: () => ({ meshes: scene.meshes.length, materials: scene.materials.length, textures: scene.textures.length, observersBefore: scene.onBeforeRenderObservable.observers.length, bed: SoundKit.ambientKind(), life: S.life ? S.life.gulls : 0 }),
      };
    }
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
    if (++S.frames === 2) {
      // phase 3: the court paint and the far scenery, once you can move; then phase 6's life, then the recorded court sounds
      void S.view.afterPlayable().then(() => {
        if (S.disposed || ctx.scene.isDisposed) return;
        if (S.solids) {   // phase 8: the palms the dressing kept (inside the park) are trunks you walk round
          const a = v1Area();
          let i = 0;
          for (const n of ctx.scene.transformNodes) {
            if (!/^vb_palm_\d+$/.test(n.name) || !n.isEnabled()) continue;
            const p = n.getAbsolutePosition();
            if (p.x > a.minX && p.x < a.maxX && p.z > a.minZ && p.z < a.maxZ) S.solids.push(palmSolid(i++, p.x, p.z));
          }
        }
        if (feel('venue.veniceLife', VENICE_LIFE) >= 0.5) {
          const life = mountHubLife(ctx.scene, S.view.root, (ctx.scene.metadata as { felTier?: string } | null)?.felTier ?? 'desktop');
          S.life = life;
          void life.watchers.then((n) => console.info(`[VENICE] life: ${life.gulls} gulls, ${n} watchers`));
        }
        if (S.sound) void SoundKit.useSampleBank('hoops');
      });
    }
    h.frame(dt);
    const me = h.player;
    placeBody(S.body, me);
    S.move.sync(dt);
    S.life?.update(dt);
    if (S.sound) {
      ctx.camDirector.forwardFlatToRef(TMP_FWD);
      S.sound.update(dt, { x: me.pos.x, z: me.pos.z, speed: Math.hypot(me.vel.x, me.vel.z), grounded: me.grounded }, Math.atan2(TMP_FWD.x, TMP_FWD.z));
    }

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
      // the ring stands on the court's sideline (courtsView): walking into it, or onto the court itself, offers the game
      // (phase 8, venue.walkupV2: on the court or in the ring, after a short dwell, held a metre past the edge; 0 = V1's box)
      const hit: Spot | null = S.walkup ? S.walkup.step(SPOT_EVERY, me.pos.x, me.pos.z) : v1Hit(S.spots, me.pos.x, me.pos.z);
      hubUi.setSpot(hit);
      hubPos.set(me.pos.x, me.pos.z, me.facingYaw);   // phase 9: the page's mini-map
    }
  },

  dispose() {
    // the harness disposes the scene; the per-scene state goes with its WeakMap entry. Live states are closed here.
    hubUi.reset(); hubPos.reset();
    if (typeof window !== 'undefined') delete (window as unknown as { __VENICE__?: unknown }).__VENICE__;
    for (const S of live) {
      S.disposed = true;
      S.life?.dispose(); S.life = null;
      if (S.sound) { S.sound = null; SoundKit.stopAmbient(); }
      S.move.dispose(); S.view.dispose();
    }
    live.clear();
  },
};
