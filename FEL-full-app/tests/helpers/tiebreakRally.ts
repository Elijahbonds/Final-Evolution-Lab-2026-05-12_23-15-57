// A scripted Tiebreak rally for the question "does the cast's height and build change the game?" (Nexus Studio track 3, owner
// 2026-10-14 "Own height and build"; docs/NEXUS-STUDIO.md §10.5). The REAL Tiebreak mode (TiebreakMode → makeTiebreakMode →
// TiebreakBlitz / TiebreakFlight) on a NullEngine, its venue loaded through the real Studio path (`?venue=` → mountStudioFor →
// primeIdentity(castIdentity)), its hero dressed through the real identity pipe (resolveIdentity → applyIdentity, the same two calls
// CharacterLibrary.spawn makes for an untinted player), driven by a script that plays the way a person does — it reads the scene
// (the hit-window ring and the ball's side), never the rules' state. Every frame's numbers are returned, so two rallies under two
// casts can be compared EXACTLY (the way tests/helpers/kartDrive.ts compares two kart drives).
//
// What is a stand-in, and why: the body. A GLB cannot load in vitest, so `standInBody` is a TransformNode root with a real Babylon
// skeleton (the bones Tiebreak and the identity pipe read: Hips, Spine, Head, the arms and hands) and no meshes. The scale the
// identity pipe puts on it is the real one (applyProportions on the root). The test file mocks CharacterLibrary with
// `standInLibrary()`; it also stubs sound, haptics, effects and the venue, which draw or play but never score.
import { Bone, FreeCamera, Matrix, NullEngine, Scene, Skeleton, TransformNode, Vector3, type Mesh } from '@babylonjs/core';
import type { ModeContext, ModeDefinition } from '../../lib/babylon/core/ModeHarness';
import type { SpawnedCharacter } from '../../lib/babylon/core/CharacterLibrary';
import type { FelInput } from '../../lib/babylon/core/InputBus';

/** The bones a stand-in body carries, with their bind height (m) and side offset (m) in the root's frame. */
const BONES: ReadonlyArray<[name: string, parent: string | null, x: number, y: number]> = [
  ['Hips', null, 0, 0.95], ['Spine', 'Hips', 0, 0.15], ['Head', 'Spine', 0, 0.55],
  ['LeftArm', 'Spine', 0.18, 0.38], ['LeftForeArm', 'LeftArm', 0.28, 0], ['LeftHand', 'LeftForeArm', 0.25, 0],
  ['RightArm', 'Spine', -0.18, 0.38], ['RightForeArm', 'RightArm', -0.28, 0], ['RightHand', 'RightForeArm', -0.25, 0],
];

let bodies = 0;

/** A body with a real skeleton and no meshes, placed and turned as CharacterLibrary.spawn places it. */
export function standInBody(scene: Scene, o: { position?: Vector3; yawRad?: number; tint?: string }): SpawnedCharacter {
  const n = ++bodies;
  const root = new TransformNode(`standin_${n}`, scene);
  if (o.position) root.position.copyFrom(o.position);
  root.rotation.set(0, o.yawRad ?? 0, 0);
  const skeleton = new Skeleton(`standin_skel_${n}`, `standin_skel_${n}`, scene);
  const nodes = new Map<string, TransformNode>();
  const bones = new Map<string, Bone>();
  for (const [name, parent, x, y] of BONES) {
    const node = new TransformNode(`${name}_${n}`, scene);
    node.parent = parent ? nodes.get(parent)! : root;
    node.position.set(x, y, 0);
    const bone = new Bone(name, skeleton, parent ? bones.get(parent)! : null, Matrix.Translation(x, y, 0));
    bone.linkTransformNode(node);
    nodes.set(name, node); bones.set(name, bone);
  }
  const groups = new Map();
  const animator = { who: o.tint ? 'rival' : 'player', groups, register: () => undefined, play: () => undefined };
  return {
    id: `standin_${n}`, root, meshes: [] as Mesh[], skeleton,
    animator: animator as unknown as SpawnedCharacter['animator'],
    dispose() { for (const nd of nodes.values()) nd.dispose(); skeleton.dispose(); root.dispose(); },
  };
}

/** The mock for CharacterLibrary: a stand-in body, dressed by the real identity pipe exactly when CharacterLibrary would dress it. */
export async function standInLibrary() {
  const { resolveIdentity, applyIdentity } = await import('../../lib/babylon/core/playerIdentity');
  return {
    CharacterLibrary: {
      async spawn(scene: Scene, _url: string, opts: { position?: Vector3; yawRad?: number; tint?: string; skinTone?: string; identity?: boolean } = {}) {
        const body = standInBody(scene, opts);
        // CharacterLibrary.spawn's own rule (GLB and procedural paths): an untinted spawn with no skin tone of its own wears the
        // session identity, when that identity is a chosen look
        if (opts.tint == null && opts.skinTone == null && opts.identity !== false) {
          const id = await resolveIdentity();
          if (id.custom) applyIdentity(body, id);
        }
        return body;
      },
    },
  };
}

/** What the scripted player does on a ball: swing to the ball's side in the window, early, to the wrong side, or leave it. */
export type RallyMove = 'clean' | 'early' | 'wrong' | 'leave';
/** The default script: mostly clean, with every kind of miss in it, so the rally scores both ways and reaches the end. */
export const RALLY_SCRIPT: readonly RallyMove[] = ['clean', 'clean', 'clean', 'early', 'clean', 'clean', 'wrong', 'clean', 'leave', 'clean', 'clean', 'clean', 'clean', 'early', 'clean'];

export interface RallyTrace {
  /** Per frame: myPts, aiPts, rally, bestRally, warmup, the ball's x / y / z, the ring's visibility, the camera's position and target. */
  frames: number[][];
  /** Every HUD post, in order (the score, the banners, the timing lines). */
  hud: string[];
  /** Every clip a body was asked to play, as `who:clip` (the mock BeatOwner records it). */
  clips: string[];
  /** ctx.end's arguments: the result, the posted score and the stats; null if the match did not end. */
  end: unknown[] | null;
  /** The inputs the script sent, as `frame:dir`. */
  inputs: string[];
  /** The player's body as drawn: its root scale, the recorded play scale, and the head's world height after the last frame. */
  body: { scaling: [number, number, number]; playScale: unknown; headY: number };
}

export interface RallyRig {
  /** The mode under test (import it AFTER the mocks: `(await import('@/lib/babylon/modes/TiebreakMode')).TiebreakMode`). */
  mode: ModeDefinition;
  /** The BeatOwner mock's log, cleared at the start of each rally. */
  clipLog: string[];
}

/**
 * Play one scripted match. Deterministic for a fixed Date.now (the mode seeds its RNG from it; the caller pins it): the only thing
 * two calls may differ in is the cast the page's `?venue=` carries, which the caller sets before calling.
 */
export async function playRally(rig: RallyRig, o: { script?: readonly RallyMove[]; maxSec?: number } = {}): Promise<RallyTrace> {
  const script = o.script ?? RALLY_SCRIPT;
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  scene.metadata = { felModeId: 'tiebreak', felTier: 'low' };   // ModeHarness stamps these before the mode loads
  const camera = new FreeCamera('play_cam', new Vector3(0, 4, 16), scene);
  const { CameraDirector } = await import('../../lib/babylon/core/CameraDirector');
  const { GroundLock } = await import('../../lib/babylon/anim/importSanitizer');
  const camDirector = new CameraDirector(scene, camera, 'court');
  const groundLock = new GroundLock(scene);
  const hud: string[] = [];
  let modeHud: Record<string, number> = {};
  let end: unknown[] | null = null;
  rig.clipLog.length = 0;
  const ctx = {
    scene, camera, camDirector, groundLock,
    setHud: (h: Record<string, unknown>) => {
      hud.push(JSON.stringify(h));
      // a Studio script's banner posts only its own `studio*` keys (scriptHost.ts): the frame record reads the MODE's latest HUD
      if (Object.keys(h).some((k) => !k.startsWith('studio'))) modeHud = h as Record<string, number>;
    },
    end: (...a: unknown[]) => { end = a; },
    heroRef: { current: null }, objectiveRef: { current: null },
    lights: { tier: 'low', rest: { exposure: 1, vignette: 0 } },
    feel: { impact: () => undefined, speedVignette01: () => undefined },
    momentum: { report: () => undefined },
    juice: { flash: () => undefined, hitStop: () => undefined, shake: () => undefined },
  } as unknown as ModeContext;

  await rig.mode.load(ctx);
  const ring = scene.getMeshByName('tb_window_neon')!;
  const ball = scene.getMeshByName('tb_ball')!;
  const frames: number[][] = [];
  const inputs: string[] = [];
  let ballNo = -1;
  let acted = false;
  let wasLive = false;
  let openFor = 0;
  const press = (f: number, dir: 'left' | 'right') => {
    inputs.push(`${f}:${dir}`);
    rig.mode.onInput?.(ctx, { t: 'dpad', dir, pressed: true } as FelInput);
  };
  const dt = 1 / 60;
  const max = Math.round((o.maxSec ?? 600) / dt);
  for (let f = 0; f < max && !end; f++) {
    rig.mode.update(ctx, dt);
    scene.render();
    // the script reads what a player sees: the ring (shown while a ball comes at you; full while the window is open, dim while it
    // closes) and which side of the court the ball is on
    const live = ring.isVisible;
    if (live && !wasLive) { ballNo++; acted = false; openFor = 0; }
    wasLive = live;
    if (live && !acted) {
      const move = script[ballNo % script.length];
      const open = ring.visibility === 1;
      const side: 'left' | 'right' = ball.position.x < 0 ? 'left' : 'right';
      if (open) openFor++;
      if (move === 'early' && !open && ring.visibility > 0.6) { press(f, side); acted = true; }
      else if (move === 'clean' && openFor === 3) { press(f, side); acted = true; }
      else if (move === 'wrong' && openFor === 3) { press(f, side === 'left' ? 'right' : 'left'); acted = true; }
    }
    const cam = camera.position, tgt = camera.getTarget();
    const last = modeHud;
    frames.push([last.myPts ?? -1, last.aiPts ?? -1, last.rally ?? -1, last.bestRally ?? -1, last.warmup ?? -1,
      ball.position.x, ball.position.y, ball.position.z, ring.isVisible ? ring.visibility : -1, cam.x, cam.y, cam.z, tgt.x, tgt.y, tgt.z]);
  }
  const hero = ctx.heroRef.current as TransformNode;
  const head = scene.getTransformNodeByName(`Head_${hero.name.replace('standin_', '')}`)!;
  head.computeWorldMatrix(true);
  const trace: RallyTrace = {
    frames, hud, clips: [...rig.clipLog], end, inputs,
    body: { scaling: [hero.scaling.x, hero.scaling.y, hero.scaling.z], playScale: (hero.metadata as { felPlayScale?: unknown } | null)?.felPlayScale ?? null, headY: head.getAbsolutePosition().y },
  };
  rig.mode.dispose?.();
  groundLock.dispose();
  scene.dispose(); engine.dispose();
  return trace;
}
