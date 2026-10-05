// Tiebreak Blitz as a 3D rally on the tennis venue. The rules live in TiebreakBlitz (window, adaptive
// server, the AI's net rate). This file is the court: two bodies, a ball, a ring that marks the hit
// window. There is no photo backdrop and no 2D court overlay.
import { Color3, MeshBuilder, PBRMaterial, type Mesh, type TransformNode, Vector3 } from '@babylonjs/core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { DEFAULT_HERO_URL } from '../core/athleteRoster';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { BeatOwner } from '../anim/beatOwner';
import { SoundKit } from '../audio/SoundKit';
import { readPlaceLook } from '../nexus/placeLooks';
import {
  commitSwing, freshBlitz, mulberry32, postedScore, skipGap, tickBlitz, TARGET,
  type BlitzFeel, type BlitzState, type Side, NORMAL_FEEL, aiNetsIt, gradeReactBase,
} from '../core/TiebreakBlitz';

export interface TiebreakModeOpts {
  reactBase: number;
  feel?: BlitzFeel;
  /** Live miss check. The host passes the 0.16 + 0.05 × rally rate the arena ceiling is built from. */
  aiNets: (rally: number, rng: () => number) => boolean;
}

const NEAR_Z = 10;
const FAR_Z = -10;

export function makeTiebreakMode(opts: TiebreakModeOpts): ModeDefinition {
  const feel = opts.feel ?? NORMAL_FEEL;
  const reactBase = opts.reactBase;
  const rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
  const state: BlitzState = freshBlitz();
  let venue: VenueHandle | null = null;
  let player: SpawnedCharacter | null = null;
  let rival: SpawnedCharacter | null = null;
  let playerBody: BeatOwner | null = null;
  let rivalBody: BeatOwner | null = null;
  let ball: Mesh | null = null;
  let ring: Mesh | null = null;
  let ended = false;
  let banner = '';
  let bannerT = 0;

  function placeBall(s: BlitzState): void {
    if (!ball || !ring) return;
    const p = s.awaiting && s.ballLen > 0 ? Math.min(1, s.ballT / s.ballLen) : 0;
    const x = (s.incoming === 'left' ? -2.5 : 2.5) * (0.35 + 0.65 * p);
    const z = FAR_Z + (NEAR_Z - 1.2 - FAR_Z) * p;
    const y = 1.15 + Math.sin(p * Math.PI) * 1.7;
    ball.position.set(x, y, z);
    ring.position.set(x, y, z);
    const open = s.awaiting && s.ballT >= s.windowOpenAt && s.ballT < s.ballLen;
    ring.isVisible = open;
    ball.isVisible = s.awaiting;
  }

  function slide(root: TransformNode | undefined, side: Side, z: number, dt: number): void {
    if (!root) return;
    const x = side === 'left' ? -1.7 : 1.7;
    root.position.x += (x - root.position.x) * Math.min(1, dt * 6);
    root.position.z = z;
  }

  function say(text: string): void {
    banner = text;
    bannerT = 1.1;
  }

  function hud(ctx: ModeContext): void {
    ctx.setHud({
      myPts: state.myPts, aiPts: state.aiPts, target: TARGET, rally: state.rally,
      banner, bestRally: state.bestRally,
    });
  }

  function finish(ctx: ModeContext): void {
    if (ended) return;
    ended = true;
    const won = state.myPts > state.aiPts;
    hud(ctx);
    ctx.end(won ? 'win' : 'complete', postedScore(state.myPts, state.bestRally), {
      myPts: state.myPts, aiPts: state.aiPts, bestRally: state.bestRally,
    });
  }

  function applySwing(ctx: ModeContext, dir: Side): void {
    if (ended) return;
    // A press during the result beat serves the next ball. The hold is readable, not a lockout.
    if (skipGap(state)) return;
    const before = state.rally;
    const early = state.ballT < state.windowOpenAt;
    const result = commitSwing(state, dir, rng, reactBase, feel, opts.aiNets);
    if (result === 'ignore') return;
    if (result === 'return') {
      say(`RETURNED ×${state.rally}`);
      SoundKit.play('whoosh', { pitch: 1 + Math.min(0.4, state.rally * 0.05), volume: 0.35 });
      playerBody?.beat(SPORT_CLIP.tennisForehand, { fadeSec: 0.06 });
    } else if (result === 'point-me') {
      say(before + 1 >= 4 ? 'WINNER DOWN THE LINE' : 'AI NETS IT');
      SoundKit.play('score', { pitch: 1.05, volume: 0.55 });
      ctx.juice.flash('#d9ffe8', 80);
      playerBody?.beat(SPORT_CLIP.tennisForehand, { fadeSec: 0.06 });
    } else {
      // commitSwing stores lastMissed as the incoming side. A swing that is not that side was a misread.
      say(dir !== state.lastMissed ? 'WRONG SIDE — POINT AI' : early ? 'TOO EARLY — POINT AI' : 'LATE — POINT AI');
      SoundKit.play('miss', { volume: 0.4 });
      ctx.juice.flash('#ffd0d8', 70);
    }
    placeBall(state);
    hud(ctx);
    if (state.over) finish(ctx);
  }

  return {
    modeId: 'tiebreak',
    mood: 'goldenHour',
    camPreset: 'court',

    async load(ctx: ModeContext): Promise<void> {
      venue = mountVenue(ctx, 'tennis', { keepGameplayCamera: true, look: readPlaceLook('tiebreak') });
      venue?.hidePlaceholders();
      player = await CharacterLibrary.spawn(ctx.scene, DEFAULT_HERO_URL, {
        position: new Vector3(0, 0, NEAR_Z), yawRad: Math.PI, startClip: SPORT_CLIP.idle,
      });
      neverBindPose(player.animator, SPORT_CLIP.idle);
      installSafePlay(player.animator, 'tiebreak-you');
      playerBody = new BeatOwner(player.animator);
      playerBody.loop(SPORT_CLIP.tennisIdle);
      rival = await CharacterLibrary.spawn(ctx.scene, DEFAULT_HERO_URL, {
        position: new Vector3(0.4, 0, FAR_Z), yawRad: 0, tint: '#c45c26', startClip: SPORT_CLIP.idle,
      });
      neverBindPose(rival.animator, SPORT_CLIP.idle);
      installSafePlay(rival.animator, 'tiebreak-rival');
      rivalBody = new BeatOwner(rival.animator);
      rivalBody.loop(SPORT_CLIP.tennisIdle);
      ctx.groundLock?.track(player.root, player.skeleton);
      ctx.groundLock?.track(rival.root, rival.skeleton);

      ball = MeshBuilder.CreateSphere('tb_ball', { diameter: 0.14, segments: 12 }, ctx.scene);
      const ballMat = new PBRMaterial('tb_ball_m', ctx.scene);
      ballMat.albedoColor = Color3.FromHexString('#D4FF00');
      ballMat.emissiveColor = Color3.FromHexString('#D4FF00').scale(0.35);
      ballMat.roughness = 0.45;
      ball.material = ballMat;
      ball.isPickable = false;

      ring = MeshBuilder.CreateTorus('tb_window', { diameter: 0.55, thickness: 0.035, tessellation: 20 }, ctx.scene);
      const ringMat = new PBRMaterial('tb_window_m', ctx.scene);
      ringMat.albedoColor = Color3.FromHexString('#00FF9D');
      ringMat.emissiveColor = Color3.FromHexString('#00FF9D');
      ringMat.roughness = 0.4;
      ring.material = ringMat;
      ring.isVisible = false;
      ring.isPickable = false;

      ctx.heroRef.current = player.root;
      ctx.objectiveRef.current = rival.root.position;
      ctx.camDirector.setPreset('court');
      ctx.camDirector.snapTo(player.root.position, rival.root.position);
      hud(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput): void {
      if (ended) return;
      if (e.t === 'dpad' && e.pressed && (e.dir === 'left' || e.dir === 'right')) applySwing(ctx, e.dir);
      else if (e.t === 'button' && e.pressed && e.btn === 'X') applySwing(ctx, 'left');
      else if (e.t === 'button' && e.pressed && e.btn === 'B') applySwing(ctx, 'right');
    },

    update(ctx: ModeContext, dt: number): void {
      if (ended) return;
      if (bannerT > 0) bannerT -= dt;
      if (bannerT <= 0 && banner) { banner = ''; hud(ctx); }
      const mark = `${state.myPts}-${state.aiPts}-${state.rally}-${state.awaiting ? 1 : 0}`;
      const step = tickBlitz(state, dt, { rng, reactBase, feel, aiNets: opts.aiNets });
      if (step === 'ace') {
        say('ACE PAST YOU');
        SoundKit.play('miss', { volume: 0.45 });
        rivalBody?.beat(SPORT_CLIP.tennisForehand, { fadeSec: 0.08 });
        hud(ctx);
        if (state.over) { placeBall(state); finish(ctx); return; }
      } else if (step === 'return') {
        rivalBody?.beat(SPORT_CLIP.tennisForehand, { fadeSec: 0.08 });
      }
      slide(player?.root, state.incoming, NEAR_Z, dt);
      slide(rival?.root, state.incoming === 'left' ? 'right' : 'left', FAR_Z, dt);
      placeBall(state);
      if (player) ctx.heroRef.current = player.root;
      if (ball && state.awaiting) ctx.objectiveRef.current = ball.position;
      else if (rival) ctx.objectiveRef.current = rival.root.position;
      const now = `${state.myPts}-${state.aiPts}-${state.rally}-${state.awaiting ? 1 : 0}`;
      if (now !== mark) hud(ctx);
    },

    dispose(): void {
      ball?.dispose();
      ring?.dispose();
      player?.dispose();
      rival?.dispose();
      venue?.dispose();
      ball = null; ring = null; player = null; rival = null; venue = null;
      playerBody = null; rivalBody = null;
    },
  };
}

// Registry/dev default. The live route still calls makeTiebreakMode with the
// signed-in player's PRQ grade; this keeps /dev/mode/tiebreak and drift guards
// on the same central roster without freezing the product route to one grade.
// The wrapper makes a fresh match state for every harness load.
let registryLiveTiebreak: ModeDefinition | null = null;

export const TiebreakMode: ModeDefinition = {
  modeId: 'tiebreak',
  mood: 'goldenHour',
  camPreset: 'court',
  load(ctx) {
    registryLiveTiebreak = makeTiebreakMode({ reactBase: gradeReactBase('READY'), aiNets: aiNetsIt });
    return registryLiveTiebreak.load(ctx);
  },
  onInput(ctx, e) {
    registryLiveTiebreak?.onInput?.(ctx, e);
  },
  update(ctx, dt) {
    registryLiveTiebreak?.update(ctx, dt);
  },
  dispose() {
    registryLiveTiebreak?.dispose?.();
    registryLiveTiebreak = null;
  },
};
