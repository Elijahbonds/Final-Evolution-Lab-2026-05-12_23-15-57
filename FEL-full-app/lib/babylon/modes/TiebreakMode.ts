// Tiebreak Blitz as a 3D rally on the tennis venue. The rules live in TiebreakBlitz (window, adaptive
// server, the AI's net rate). This file is the court: two bodies, a ball, a ring that marks the hit
// window. There is no photo backdrop and no 2D court overlay.
//
// IMPROVE (2026-10-06): the owner-picked pass. The ring closes on the ball and faces the camera (#1 #2), the rival serves
// and swings on every return (#3 #4), both bodies shuffle and swing to the side the ball is on (#5 #6 #7), your return
// flies out before his comes back (#8), the ball bounces and casts a blob (#14 #15), the crowd builds with the rally
// (#16), warm-up balls come before 0-0 (#17), and the ball, ring and blob are unlit, frozen and disposed with their
// materials (#18–#20). The flight is drawn by TiebreakFlight (pure); the rules never read it.
import { Color3, Mesh, MeshBuilder, StandardMaterial, type AnimationGroup, type Scene, type TransformNode, Vector3 } from '@babylonjs/core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { DEFAULT_HERO_URL } from '../core/athleteRoster';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { BeatOwner } from '../anim/beatOwner';
import { mirrorGroupsInPlace } from '../anim/groupMirror';
import { sideOfRigHand, sideOfVector, type AthleteSide } from '../anim/athleteSide';
import { SoundKit } from '../audio/SoundKit';
import { HAPTIC, padRumble } from '../premium/Haptics';
import { readPlaceLook } from '../nexus/placeLooks';
import {
  commitSwing, freshBlitz, goingOut, matchCall, mulberry32, postedScore, ringClose01, skipGap, swingTiming, tickBlitz,
  RETURN_OUT_SEC, TARGET, type BlitzFeel, type BlitzState, type Side, NORMAL_FEEL, aiNetsIt, gradeReactBase,
} from '../core/TiebreakBlitz';
import { BOUNCE_AT, FAR_Z, NEAR_Z, incomingPoint, outgoingPoint, shadowScale, type Pt } from '../core/TiebreakFlight';

export interface TiebreakModeOpts {
  reactBase: number;
  feel?: BlitzFeel;
  /** Live miss check. The host passes the 0.16 + 0.05 × rally rate the arena ceiling is built from. */
  aiNets: (rally: number, rng: () => number) => boolean;
  /** #17: warm-up balls before 0-0. Omitted: WARMUP_FIRST on a device that has never finished a match, else WARMUP_AGAIN. */
  warmup?: number;
}

/** IMPROVE (2026-10-06) #17 — TUNED (new): unscored balls before 0-0 — three the first time on a device, one after that. */
export const WARMUP_FIRST = 3;
export const WARMUP_AGAIN = 1;
const WARMED_KEY = 'fel.tiebreak.warmedUp';
function readWarmed(): boolean { try { return localStorage.getItem(WARMED_KEY) === '1'; } catch { return false; } }
function writeWarmed(): void { try { localStorage.setItem(WARMED_KEY, '1'); } catch { /* private mode: the warm-up is a convenience */ } }

/** #1 — TUNED (new): the ring starts this many times its closed size when the ball is struck and closes to 1× (it hugs
 *  the 0.14 m ball) at the moment the window opens. */
const RING_WIDE = 4;
const RING_D = 0.24;
/** #4: the serve clip meets the ball 0.6 s in (netTree NET_CONTACT_SEC.tennis_serve), so the rival starts it that long
 *  before the hold ends — his contact is the ball leaving. */
const SERVE_LEAD = 0.6;
/** #5: past this lateral gap (m) a body shuffles toward its spot instead of standing in the ready bounce. */
const SHUFFLE_GAP = 0.3;
/** #16 — TUNED (new): a rally this long earns the crowd's cheer when you win it (the "WINNER DOWN THE LINE" length). */
const CHEER_RALLY = 4;
const PLAYER_YAW = Math.PI;
const RIVAL_YAW = 0;

/** #19: one unlit, frozen marker material — the ball, ring and blob only ever showed their emissive colour, so lighting
 *  them was cost with no look. StandardMaterial with lighting off is the unlit marker the ratchet allows. */
function unlitMarker(scene: Scene, name: string, hex: string, alpha = 1): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.backFaceCulling = false;
  m.disableLighting = true;
  m.emissiveColor = Color3.FromHexString(hex);
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.alpha = alpha;
  m.freeze();
  return m;
}

export function makeTiebreakMode(opts: TiebreakModeOpts): ModeDefinition {
  const feel = opts.feel ?? NORMAL_FEEL;
  const reactBase = opts.reactBase;
  const rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
  const state: BlitzState = freshBlitz(opts.warmup ?? (readWarmed() ? WARMUP_AGAIN : WARMUP_FIRST));
  const warmTotal = state.warmup;
  let venue: VenueHandle | null = null;
  let player: SpawnedCharacter | null = null;
  let rival: SpawnedCharacter | null = null;
  let playerBody: BeatOwner | null = null;
  let rivalBody: BeatOwner | null = null;
  let ball: Mesh | null = null;
  let ring: Mesh | null = null;
  let shadow: Mesh | null = null;
  let ended = false;
  let banner = '';
  let bannerT = 0;
  // #6: each body's mirrored swing ('tennis_swing.M'), and the side its own forehand is drawn on
  let playerFore: AthleteSide = 'right';
  let rivalFore: AthleteSide = 'right';
  let playerMirror: string | null = null;
  let rivalMirror: string | null = null;
  // #8: your return flies from where you met the ball to where his shot starts
  const hitFrom: Pt = { x: 0, y: 0, z: 0 };
  const hitTo: Pt = { x: 0, y: 0, z: 0 };
  const at: Pt = { x: 0, y: 0, z: 0 };
  // #4 #15: per-ball beats (the serve started, the bounce heard)
  let serveStarted = false;
  let lastPoints = 0;
  let lastP = 0;
  // #12: where the last swing landed in the window (0..1), or -1 when there is nothing to show
  let hitAt = -1;
  // #18: the HUD's last numbers — compared, not stringified, every frame
  let hudMy = -1, hudAi = -1, hudRally = -1, hudAwait = false, hudWarm = -1;

  function placeBall(s: BlitzState): void {
    if (!ball || !ring || !shadow) return;
    if (goingOut(s)) {
      outgoingPoint(hitFrom, hitTo, 1 + s.ballT / RETURN_OUT_SEC, at);
    } else {
      const p = s.awaiting && s.ballLen > 0 ? Math.min(1, s.ballT / s.ballLen) : 0;
      incomingPoint(s.incoming, p, at);
    }
    ball.position.set(at.x, at.y, at.z);
    ball.isVisible = s.awaiting;
    // #1 #2: the ring rides the ball, faces the camera (billboard) and closes from RING_WIDE to 1× by the window's open
    const incoming = s.awaiting && s.ballT >= 0;
    ring.isVisible = incoming;
    if (incoming) {
      const close = ringClose01(s);
      ring.position.set(at.x, at.y, at.z);
      ring.scaling.setAll(RING_WIDE + (1 - RING_WIDE) * close);
      const open = s.ballT >= s.windowOpenAt && s.ballT < s.ballLen;
      ring.visibility = open ? 1 : 0.3 + 0.4 * close;
    }
    // #14: a blob on the court under the ball
    shadow.isVisible = s.awaiting;
    if (s.awaiting) {
      shadow.position.set(at.x, 0.02, at.z);
      shadow.scaling.setAll(shadowScale(at.y));
    }
  }

  /** #5: a body slides to its spot, shuffling while the gap is large and settling into the ready bounce when it is there. */
  function slide(root: TransformNode | undefined, body: BeatOwner | null, yaw: number, side: Side, z: number, dt: number): void {
    if (!root) return;
    const x = side === 'left' ? -1.7 : 1.7;
    const gap = x - root.position.x;
    root.position.x += gap * Math.min(1, dt * 6);
    root.position.z = z;
    if (!body) return;
    if (Math.abs(gap) <= SHUFFLE_GAP) body.loop(SPORT_CLIP.tennisIdle);
    else body.loop(gap * Math.cos(yaw) > 0 ? SPORT_CLIP.tennisShuffleRight : SPORT_CLIP.tennisShuffleLeft, { fadeSec: 0.12 });
  }

  /** #6: a mirrored copy of the forehand, so a ball on the body's other side is met with the other arm. Null when the rig
   *  has no swing to copy (the body then plays the forehand both ways, as before). */
  function buildMirrorSwing(c: SpawnedCharacter): string | null {
    try {
      const groups = (c.animator as unknown as { groups?: Map<string, AnimationGroup> }).groups;
      if (!groups) return null;
      const src = [...groups.values()].find((g) => g.name.replace(/_c\d+$/, '') === SPORT_CLIP.tennisForehand);
      if (!src) return null;
      const name = `${SPORT_CLIP.tennisForehand}.M`;
      if (groups.has(name)) return name;
      const copy = src.clone(name, (t) => t, true, true);
      if (mirrorGroupsInPlace([copy], c.skeleton).length !== 1) { copy.dispose(); return null; }
      c.animator.register(copy);
      return name;
    } catch (e) {
      console.warn('[FEL-TIEBREAK] mirrored swing not built — the forehand plays both ways', e);
      return null;
    }
  }

  /** #6 #7: the swing to `side` of a body — its forehand on its forehand side, the mirrored swing on the other. */
  function swingClip(yaw: number, side: Side, fore: AthleteSide, mirror: string | null): string {
    const athlete = sideOfVector(yaw, { x: side === 'left' ? -1 : 1, z: 0 });
    return athlete === fore || !mirror ? SPORT_CLIP.tennisForehand : mirror;
  }
  const playerSwing = (side: Side): void => { playerBody?.beat(swingClip(PLAYER_YAW, side, playerFore, playerMirror), { fadeSec: 0.06 }); };
  /** #3: the rival meets your return on the side he hits from — the side opposite the ball he sends at you. */
  const rivalSwing = (towards: Side): void => {
    const from: Side = towards === 'left' ? 'right' : 'left';
    rivalBody?.beat(swingClip(RIVAL_YAW, from, rivalFore, rivalMirror), { fadeSec: 0.08 });
  };

  function say(text: string): void {
    banner = text;
    bannerT = 1.1;
  }

  function hud(ctx: ModeContext): void {
    hudMy = state.myPts; hudAi = state.aiPts; hudRally = state.rally; hudAwait = state.awaiting; hudWarm = state.warmup;
    ctx.setHud({
      myPts: state.myPts, aiPts: state.aiPts, target: TARGET, rally: state.rally,
      banner, bestRally: state.bestRally,
      // IMPROVE (2026-10-06) #10 #12 #17: the match call (WIN BY 2, SET POINT…), where the last swing landed in the window,
      // and the warm-up count (warmup = balls left, of warmTotal)
      call: state.warmup > 0 ? '' : matchCall(state.myPts, state.aiPts), hitAt,
      warmup: state.warmup, warmTotal,
    });
  }

  function finish(ctx: ModeContext): void {
    if (ended) return;
    ended = true;
    writeWarmed();
    const won = state.myPts > state.aiPts;
    hud(ctx);
    ctx.end(won ? 'win' : 'complete', postedScore(state.myPts, state.bestRally), {
      myPts: state.myPts, aiPts: state.aiPts, bestRally: state.bestRally,
    });
  }

  function applySwing(ctx: ModeContext, dir: Side): void {
    if (ended) return;
    // A press during the result beat serves the next ball. The hold is readable, not a lockout.
    if (skipGap(state, feel)) return;
    if (!state.awaiting || goingOut(state)) return;
    const before = state.rally;
    const warm = state.warmup > 0;
    const incoming = state.incoming;
    const timing = swingTiming(state);
    // #8: your racket is where your return starts from
    hitFrom.x = ball?.position.x ?? 0; hitFrom.y = ball?.position.y ?? 1; hitFrom.z = ball?.position.z ?? NEAR_Z;
    const result = commitSwing(state, dir, rng, reactBase, feel, opts.aiNets);
    if (result === 'ignore') return;
    hitAt = result === 'point-ai' ? -1 : timing.at01;
    if (warm) {
      // #17: a warm-up ball says how the swing landed and scores nothing
      playerSwing(dir);
      say(result === 'return' ? `WARM-UP — CLEAN${warmLeft()}` : `WARM-UP — ${missLine(dir, incoming, timing)}${warmLeft()}`);
      SoundKit.play(result === 'return' ? 'whoosh' : 'miss', { volume: 0.3 });
    } else if (result === 'return') {
      say(`RETURNED ×${state.rally}`);
      SoundKit.play('whoosh', { pitch: 1 + Math.min(0.4, state.rally * 0.05), volume: 0.35 });
      playerSwing(dir);
      incomingPoint(state.incoming, 0, hitTo);
      rivalSwing(state.incoming);
      // #13: a tap on the hands for every clean return; #16: the crowd bed rises with the rally (MomentumBus → crowdLevel)
      HAPTIC.tap(); padRumble(0.22, 60);
      ctx.momentum.report({ kind: 'chain' });
    } else if (result === 'point-me') {
      const long = before + 1 >= CHEER_RALLY;
      say(long ? 'WINNER DOWN THE LINE' : 'AI NETS IT');
      SoundKit.play('score', { pitch: 1.05, volume: 0.55 });
      ctx.juice.flash('#d9ffe8', 80);
      playerSwing(dir);
      // #13: hit-stop, shake and a buzz on a point won; #16: a long rally won brings the crowd up
      ctx.feel.impact(long ? 0.4 : 0.25);
      if (long) { SoundKit.play('crowdCheer', { volume: 0.5 }); ctx.momentum.report({ kind: 'clean_run' }); }
    } else {
      // #7: the swing you chose is on screen — a misread swings to the wrong side, an early swing goes before the ball
      playerSwing(dir);
      say(`${missLine(dir, incoming, timing)} — POINT AI`);
      SoundKit.play('miss', { volume: 0.4 });
      ctx.juice.flash('#ffd0d8', 70);
    }
    placeBall(state);
    hud(ctx);
    if (state.over) finish(ctx);
  }

  /** #12: the miss, with the timing — "TOO EARLY · 70 ms". `incoming` is the ball's side read before the swing, so a swing
   *  that is not that side was a misread. */
  function missLine(dir: Side, incoming: Side, t: ReturnType<typeof swingTiming>): string {
    if (dir !== incoming) return 'WRONG SIDE';
    if (t.phase === 'early') return `TOO EARLY · ${t.ms} ms`;
    return t.ms > 0 ? `LATE · ${t.ms} ms` : 'LATE';
  }
  /** #17: what comes after this warm-up ball. */
  const warmLeft = (): string => (state.warmup > 0 ? ` · ${state.warmup} LEFT` : ' · NOW 0-0');

  return {
    modeId: 'tiebreak',
    mood: 'goldenHour',
    camPreset: 'court',

    async load(ctx: ModeContext): Promise<void> {
      venue = mountVenue(ctx, 'tennis', { keepGameplayCamera: true, look: readPlaceLook('tiebreak') });
      venue?.hidePlaceholders();
      player = await CharacterLibrary.spawn(ctx.scene, DEFAULT_HERO_URL, {
        position: new Vector3(0, 0, NEAR_Z), yawRad: PLAYER_YAW, startClip: SPORT_CLIP.idle,
      });
      neverBindPose(player.animator, SPORT_CLIP.idle);
      installSafePlay(player.animator, 'tiebreak-you');
      playerBody = new BeatOwner(player.animator);
      playerBody.loop(SPORT_CLIP.tennisIdle);
      rival = await CharacterLibrary.spawn(ctx.scene, DEFAULT_HERO_URL, {
        position: new Vector3(0.4, 0, FAR_Z), yawRad: RIVAL_YAW, tint: '#c45c26', startClip: SPORT_CLIP.idle,
      });
      neverBindPose(rival.animator, SPORT_CLIP.idle);
      installSafePlay(rival.animator, 'tiebreak-rival');
      rivalBody = new BeatOwner(rival.animator);
      rivalBody.loop(SPORT_CLIP.tennisIdle);
      ctx.groundLock?.track(player.root, player.skeleton);
      ctx.groundLock?.track(rival.root, rival.skeleton);
      // #6: the forehand swings the rig's right hand (anim/authored/tennis.ts); which side of the athlete that draws on is
      // read off the rig (athleteSide), and the mirrored copy takes the other side
      playerFore = sideOfRigHand(player.skeleton, player.root, 'RightHand');
      rivalFore = sideOfRigHand(rival.skeleton, rival.root, 'RightHand');
      playerMirror = buildMirrorSwing(player);
      rivalMirror = buildMirrorSwing(rival);

      ball = MeshBuilder.CreateSphere('tb_ball', { diameter: 0.14, segments: 12 }, ctx.scene);
      ball.material = unlitMarker(ctx.scene, 'tb_ball_m', '#D4FF00');
      ball.isPickable = false;

      // #2: built flat (XZ) by MeshBuilder; stood up into XY and billboarded so it always faces the camera as a ring
      ring = MeshBuilder.CreateTorus('tb_window', { diameter: RING_D, thickness: 0.03, tessellation: 24 }, ctx.scene);
      ring.rotation.x = Math.PI / 2;
      ring.bakeCurrentTransformIntoVertices();
      ring.billboardMode = Mesh.BILLBOARDMODE_ALL;
      ring.material = unlitMarker(ctx.scene, 'tb_window_m', '#00FF9D');
      ring.isVisible = false;
      ring.isPickable = false;

      // #14: the ball's blob — a flat dark disc on the court, unlit and translucent
      shadow = MeshBuilder.CreateDisc('tb_ball_shadow', { radius: 0.13, tessellation: 16 }, ctx.scene);
      shadow.rotation.x = Math.PI / 2;
      shadow.bakeCurrentTransformIntoVertices();
      shadow.material = unlitMarker(ctx.scene, 'tb_ball_shadow_m', '#000000', 0.35);
      shadow.isVisible = false;
      shadow.isPickable = false;

      ctx.heroRef.current = player.root;
      ctx.objectiveRef.current = rival.root.position;
      ctx.camDirector.setPreset('court');
      ctx.camDirector.snapTo(player.root.position, rival.root.position);
      if (state.warmup > 0) say(`WARM-UP · ${state.warmup} BALL${state.warmup > 1 ? 'S' : ''}`);
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
      if (bannerT <= 0 && banner) { banner = ''; hitAt = -1; hud(ctx); }
      const warm = state.warmup > 0;
      const step = tickBlitz(state, dt, { rng, reactBase, feel, aiNets: opts.aiNets });
      if (step === 'ace') {
        // the ball went past you — the rival does not swing at a ball he already hit (#3)
        hitAt = -1;
        say(warm ? `WARM-UP — SWING WHEN THE RING CLOSES${warmLeft()}` : 'ACE PAST YOU');
        SoundKit.play('miss', { volume: warm ? 0.3 : 0.45 });
        hud(ctx);
        if (state.over) { placeBall(state); finish(ctx); return; }
      } else if (step === 'return') {
        // a scripted (plan) return: the live path is applySwing
        if (ball) { hitFrom.x = ball.position.x; hitFrom.y = ball.position.y; hitFrom.z = ball.position.z; }
        incomingPoint(state.incoming, 0, hitTo);
        rivalSwing(state.incoming);
      }
      // #4: the rival serves each new point — the clip starts SERVE_LEAD before the hold ends so his contact is the launch.
      // A point ends in onInput as well as here, so a new point is read off the count, not off this frame's tick.
      const points = state.myPts + state.aiPts + (warmTotal - state.warmup);
      if (points !== lastPoints) { lastPoints = points; serveStarted = false; }
      if (!serveStarted && (state.awaiting || state.gap <= SERVE_LEAD)) {
        serveStarted = true;   // (awaiting already: a skipped hold served at once — the serve still plays, late, on that ball)
        rivalBody?.beat(SPORT_CLIP.tennisServe, { fadeSec: state.awaiting ? 0.06 : 0.1 });
      }
      // #15: the bounce is heard — the timing anchor just before the window
      const p = state.awaiting && state.ballT >= 0 && state.ballLen > 0 ? state.ballT / state.ballLen : 0;
      if (lastP < BOUNCE_AT && p >= BOUNCE_AT) SoundKit.play('thud', { volume: 0.18, pitch: 1.6 });
      lastP = p;
      slide(player?.root, playerBody, PLAYER_YAW, state.incoming, NEAR_Z, dt);
      slide(rival?.root, rivalBody, RIVAL_YAW, state.incoming === 'left' ? 'right' : 'left', FAR_Z, dt);
      placeBall(state);
      if (player) ctx.heroRef.current = player.root;
      if (ball && state.awaiting) ctx.objectiveRef.current = ball.position;
      else if (rival) ctx.objectiveRef.current = rival.root.position;
      // #18: four numbers and a flag, not two template strings a frame
      if (state.myPts !== hudMy || state.aiPts !== hudAi || state.rally !== hudRally || state.awaiting !== hudAwait
        || state.warmup !== hudWarm) hud(ctx);
    },

    dispose(): void {
      // #20: the ball, ring and blob take their materials with them (the default dispose leaves them in the scene)
      ball?.dispose(false, true);
      ring?.dispose(false, true);
      shadow?.dispose(false, true);
      player?.dispose();
      rival?.dispose();
      venue?.dispose();
      ball = null; ring = null; shadow = null; player = null; rival = null; venue = null;
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
