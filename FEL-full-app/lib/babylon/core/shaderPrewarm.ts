// shaderPrewarm — compile a phone's shaders during the load, behind the boot splash (lane/owner-1016, 2026-10-16).
//
// THE PROBLEM (PR #281's phone sweep). `warmAll` was development-only, so production never pre-warmed a material: the first
// frame a shader is needed is the frame it compiles, and on a phone that is a hitch in the middle of play — 3v3 compiled 14 PBR
// shaders mid-play, plus the outline, shadow and particle variants that come with them. The harness does not render during the
// load at all (the render loop starts after it), so every program compiled in `ready` or `playing`.
//
// THE FIX. `scene.isReady()` is Babylon's own "has everything the scene could draw been prepared": for every mesh with sub-meshes
// (enabled or not: a karate horde's spawn pool, a hoop's juice pieces) it asks its material for the variant that mesh would draw
// (skinned, instanced, lit, shadowed, fogged), then the shadow generators, the outline renderer, the particle systems and the
// render targets — and each call that is not yet ready STARTS that compile, all of them in parallel. So polling it compiles the
// lot, with nothing drawn and nothing of ours to keep in step with the materials.
//
// THEN A FEW FRAMES, drawn behind the splash. `isReady` knows the materials, shadow depth, outlines and particles; it does not
// know the post-process programs (the shadow map's blur, the image-processing pass, the look stack's passes), which compile the
// first time a frame goes through them. So the harness hands in `renderFrame` and a few frames are drawn here, spaced so the
// parallel compile can run between them, and then it waits for the ENGINE (`effectsReady`: every program anything has asked for)
// as well as the scene.
//
// THE CLOCK. The load watchdog (ModeHarness LOAD_WATCHDOG_MS, 45 s) is disarmed when the mode's load() returns, BEFORE this runs,
// so a slow compile cannot make the watchdog report "Load timed out", and a compile that never finishes cannot hold the splash:
// this has its own cap and the game goes on to READY either way (a shader left uncompiled is just compiled on first use, as it
// was before).
//
// PHONE ONLY (`prewarmWanted`): desktop and high keep their first-use compiles (their GPUs and drivers compile in a frame or
// two, and the owner asked for the phone). Development keeps warmAll after READY.
import type { Scene } from '@babylonjs/core';

/** Does this tier pre-warm during the load? The phone's, only. */
export function prewarmWanted(tier: string): boolean {
  return tier === 'mobile';
}

/** The most a phone's load waits on the pre-warm before it goes on to READY (the cap, not the usual time: see the measured times in docs/VISUAL-PASS-PLAN.md). */
export const PREWARM_CAP_MS = 8_000;
/** How often the scene is asked again while compiles are still running. */
export const PREWARM_POLL_MS = 40;
/** Frames drawn behind the splash once the scene is ready: the first compiles the post-process programs, the rest let them land. */
export const PREWARM_FRAMES = 3;

export interface PrewarmResult {
  /** Every mesh, shadow, particle and render target the scene could draw was ready. */
  ready: boolean;
  /** The cap ran out first (the splash was released with some programs still compiling). */
  timedOut: boolean;
  /**
   * The cap cut the pre-warm short: it timed out, OR the scene was ready but the cap stopped the warm frames (so the
   * post-process programs those frames compile were left for the first frames after READY). `timedOut` alone missed the
   * second case: on the ship-ready rig (docs/SHIP-READINESS.md §1) the cap cut 6 of 9 phone loads short and 1 said `timedOut`.
   */
  capHit: boolean;
  /** Warm frames drawn. */
  frames: number;
  /** Milliseconds spent, by the injected clock. */
  ms: number;
  /** Of which, until the scene first reported ready (before the warm frames); -1 if it never did. */
  readyMs: number;
  /** How many times the scene was asked. */
  polls: number;
}

export interface PrewarmDeps {
  capMs?: number;
  pollMs?: number;
  now?: () => number;
  /** Draw one frame (the harness: beginFrame, scene.render, endFrame). Absent: no frames are drawn. */
  renderFrame?: () => void;
  /** Have the engine's every requested program (the post-process passes the scene does not know about) finished compiling? Absent: not asked. */
  effectsReady?: () => boolean;
  frames?: number;
  wait?: (ms: number) => Promise<void>;
}

/** Ask the scene until it is ready or the cap runs out, then draw the warm frames. Never throws: a scene that errors is reported as not ready. */
export async function prewarmScene(scene: Pick<Scene, 'isReady' | 'isDisposed'>, deps: PrewarmDeps = {}): Promise<PrewarmResult> {
  const capMs = deps.capMs ?? PREWARM_CAP_MS, pollMs = deps.pollMs ?? PREWARM_POLL_MS;
  const now = deps.now ?? (() => performance.now());
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const t0 = now();
  let polls = 0, frames = 0, readyMs = -1, framesCut = false;
  const done = (ready: boolean, timedOut: boolean): PrewarmResult => ({ ready, timedOut, capHit: timedOut || framesCut, frames, ms: now() - t0, readyMs, polls });
  // until the scene says it is ready (this is what starts the compiles); false = out of time or torn down
  const untilReady = async (): Promise<boolean | 'dead'> => {
    for (;;) {
      if (scene.isDisposed) return 'dead';
      polls++;
      let ready = false;
      try { ready = scene.isReady(true) && (deps.effectsReady?.() ?? true); } catch { /* a material that throws is left to fail where it always did */ }
      if (ready) return true;
      if (now() - t0 >= capMs) return false;
      await wait(pollMs);
    }
  };
  let r = await untilReady();
  if (r === 'dead') return done(false, false);
  if (r) readyMs = now() - t0;
  if (r && deps.renderFrame) {
    for (let i = 0; i < (deps.frames ?? PREWARM_FRAMES); i++) {
      if (now() - t0 >= capMs) { framesCut = true; break; }       // the cap stops the frames too (and says so: capHit)
      if (scene.isDisposed) return done(false, false);
      try { deps.renderFrame(); frames++; } catch { break; }   // a frame that throws is the render loop's to report, later
      await wait(pollMs);
    }
    r = await untilReady();                                      // the frames can have woken more (a variant only a drawn frame asks for)
    if (r === 'dead') return done(false, false);
  }
  return done(r === true, r === false);
}
