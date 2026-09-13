// ModeHarness — every Babylon mode runs through this: scene boot, LightRig,
// InputBus, READY gate + 3-2-1, pause, update loop, SessionResult emit.

import type { HudCue } from './danceTracks';
import { Scene, TargetCamera, Vector3, SceneInstrumentation } from '@babylonjs/core';
import { FloatingOriginCurrentScene } from '@babylonjs/core/Materials/floatingOriginMatrixOverrides';
import { createEngine } from './createEngine';
import type { TransformNode } from '@babylonjs/core';
import { mountLightRig, liftBlackMaterials, type LightRigHandle } from '../scene/LightRig';
import { mountIblShadows, type IblShadowsHandle } from '../scene/IblShadows';
import { detectQualityTier, mountSsao, tierRigSettings, type SsaoHandle } from '../scene/QualityTier';
import type { VenueMood } from '../scene/moods';
import { InputBus, type FelInput } from './InputBus';
import { CameraDirector, type FOLLOW_PRESETS } from './CameraDirector';
import { buildResult, defaultResultSink, type ResultSink, type SessionResult } from './sessionResult';
import { JuiceKit } from '../premium/JuiceKit';
import { RenderWatchdog } from './RenderWatchdog';
import { GroundLock } from '../anim/importSanitizer';
import { Shaker, InputBuffer, impact as feelImpact, timeScale } from './gameFeel';
import { SoundKit } from '../audio/SoundKit';   // M43: unlock audio on first user gesture
import { autoInk } from '../visual/AnimeInk';    // M59: anime ink outlines
import { mountBackdrop, MOOD_TO_FAMILY } from '../visual/Backdrops'; // M61: painted backdrops
import type { BackdropFamily } from '../visual/Backdrops';
import { FrameGuard, assertSpawned } from './FrameGuard';
import { applyCanvasFit } from './canvasFit';       // M95 (Pass 2): cap DPR + backing-pixel budget
import { PerfMonitor } from './PerfMonitor';          // M67: dev frame-budget monitor
import { setReady, clearReady } from './readyMarker';  // M67: smoke-test readiness gate
import { installAgentBridge, agentBridge } from './AgentBridge';  // M69: agent control plane
import { AGENT_MODES } from './agentModes';
import type { AgentControlSource } from './AgentControlSource';  // M69: per-mode intent play
import { reportDiag, setDiagMode } from './diag';

/** M37 mutable slot a mode fills right after spawn (hero root / live objective). */
export interface MutableRef<T> { current: T | null; }
/** M37 premium game-feel bundle exposed to every mode via ctx.feel. */
export interface ModeFeel {
  shaker: Shaker;
  buffer: InputBuffer;
  /** hit-stop + shake + haptic on impact (strength 0..1). */
  impact(strength: number): void;
}

export type ModePhase = 'loading' | 'ready' | 'countdown' | 'playing' | 'paused' | 'ended' | 'error';

/** One judge line in a live scorecard reveal (M47 dunk contest). */
/** score is a string only for an UNREVEALED card ('—' while the staged
 *  reveal is still walking — 3PT's results board). Revealed cards are always
 *  numeric; numeric consumers coerce with Number(). */
export interface HudScoreCard { name: string; score: number | string; line: string }
/** Values a mode may push to the bezel HUD. Widened at M47 so a judged
 * contest can surface booleans (pulse flags), a cleared field (null) and a
 * 3-judge scorecard array — the bezel decorates them; modes stay declarative. */
/** The rhythm cue lane (dance, A+ mission #1) — see core/danceTracks.ts. */
export type { HudCue } from './danceTracks';
export type HudValue = string | number | boolean | null | HudScoreCard[] | HudCue[];

export interface ModeContext {
  scene: Scene;
  /** Court location pick (docs/SPEC-COURT-LOCATIONS.md), passed through to mountVenue by the basketball modes. */
  location?: string;
  camera: TargetCamera;
  camDirector: CameraDirector;
  input: InputBus;
  lights: LightRigHandle;
  /** premium-feel layer (M29): hit-stop, shake, world-space score pops, flash, slow-mo. */
  juice: JuiceKit;
  /** M37 game-feel: input buffer, screen shake, hit-stop bundle. */
  feel: ModeFeel;
  /** M37: set to the hero root right after spawn → FrameGuard + camera framing. */
  heroRef: MutableRef<TransformNode>;
  /** M37: set to the live objective (ball/rim/gate/opponent) → cameras keep it framed. */
  objectiveRef: MutableRef<Vector3>;
  /** M35: per-frame floor clamp — track each spawned character to kill sinking. */
  groundLock: GroundLock;
  /** M69: a mode MAY populate these in load() to grant an agent intent-level
   *  play (only ever active when ?agent=1). Left empty for normal human play. */
  agent: { control?: AgentControlSource; getScore?: () => number };
  /** current phase — modes may read, never write */
  phase(): ModePhase;
  end(outcome: string, score: number, stats: Record<string, number>): void;
  /** TRY-ONBOARD (G1/G7): the host asked for a CONTINUOUS night. A mode that would
   *  otherwise finish its card must offer GO AGAIN in-mode — report through card()
   *  and keep playing — instead of calling end(), which parks the harness in
   *  'ended' and hands the host a modal it can only answer by remounting. */
  continuous: boolean;
  /** A finished card that does NOT end the session. Same SessionResult the sink
   *  would get from end(), but the phase stays 'playing': the scene, the camera,
   *  the input and every loaded asset survive, so the next night is a soft reset
   *  inside the mode rather than a cold reboot of the whole stage. */
  card(outcome: string, score: number, stats: Record<string, number>): void;
  setHud(update: Record<string, HudValue>): void;   // bezel HUD bridge
}

export interface ModeDefinition {
  modeId: string;
  /**
   * The light rig to run.
   *
   * May be declared as a GETTER, which is how a mode whose venue is PICKED gets its own sky. The harness
   * reads this at mount — after the splash has written the pick and before load() runs — so
   * `get mood() { return readBoardVenue('skate').mood; }` resolves to the chosen venue's mood. Before this
   * the board modes declared a literal at module scope, which is why The Warehouse (a night venue) rendered
   * under Venice's sunset: the palette was per-venue and the LIGHT was not.
   */
  mood: VenueMood;
  /** Painted horizon. Defaults to the mood's family; name it (or get it) to override per venue. */
  backdrop?: BackdropFamily;
  camPreset: keyof typeof FOLLOW_PRESETS;
  load(ctx: ModeContext): Promise<void>;        // spawn venue + characters
  onInput(ctx: ModeContext, e: FelInput): void;
  update(ctx: ModeContext, dt: number): void;   // called only while 'playing'
  dispose?(): void;
}

export interface HarnessOpts {
  canvas: HTMLCanvasElement;
  // detail is the countdown number during 'countdown', or an error message string during 'error'
  onPhase?: (p: ModePhase, detail?: number | string) => void;   // drives READY/3-2-1/ERROR UI
  onHud?: (hud: Record<string, HudValue>) => void;
  /** Dev only (ship pass 3 rollout flag): every spawn of the default hero uses this GLB instead. */
  heroOverride?: string;
  resultSink?: ResultSink;
  /** TRY-ONBOARD (G1): run this mode as a CONTINUOUS night — see ModeContext.continuous. */
  continuous?: boolean;
  /** Where ctx.card() lands: a scoreboard the host may show without ending the run. */
  cardSink?: ResultSink;
  /** Optional host-owned bus so a touch overlay can emit() the same events. */
  input?: InputBus;
  /** Court location pick (docs/SPEC-COURT-LOCATIONS.md) — basketball venues swap their environment half. */
  location?: string;
  /** M28 art round-trip: called once after the venue loads so a published art
   * card can reskin the court/board/kit mesh. Runs post-liftBlackMaterials. */
  applySkin?: (scene: Scene) => void;
}

/** Max time a mode's load() may take before the anti-infinite-spinner watchdog
 * fires and surfaces the error screen (no player must ever hang forever). */
const LOAD_WATCHDOG_MS = 20_000;

/** OOM-HYGIENE: the floating-origin resetter lives at MODULE scope on purpose — an arrow written inside runMode captures the
 *  harness closure (heap snapshot: `getScene → context: scene → Scene`), and would retain the scene it exists to release. */
const NO_SCENE = (): undefined => undefined;

export async function runMode(def: ModeDefinition, opts: HarnessOpts): Promise<() => void> {
  const engine = await createEngine(opts.canvas);
  // M95 (Pass 2): a phone reports devicePixelRatio 3, so the backing buffer is
  // 9 pixels per CSS pixel — fill rate is the dominant cost on mobile GPUs and
  // the extra 8 are invisible at arm's length. Cap the ratio at 2 and cap total
  // backing pixels; no-op on a 1x desktop.
  const fit = applyCanvasFit(engine, opts.canvas);
  // Ship pass (2026-09-02): desktop 60 fps / mobile 30 fps. Decided once, here,
  // from the same fill-rate signal the canvas fit used.
  const tier = detectQualityTier(opts.canvas, fit);
  const scene = new Scene(engine);
  (scene.metadata ??= {}).felTier = tier;   // read by CharacterLibrary for per-spawn quality
  scene.metadata.felModeId = def.modeId;   // read by kit.applyKit for the sport's default kit (owner decision 2026-09-05)
  if (opts.heroOverride) scene.metadata.felHeroOverride = opts.heroOverride;   // dev rollout flag (?hero=)
  // M69: publish the agent control bridge (no-op unless ?agent=1). Idempotent —
  // re-registers the same mode list and re-binds window.__NEXUS_AGENT__ each mount.
  installAgentBridge(AGENT_MODES);
  const camera = new TargetCamera('cam', new Vector3(0, 3, -8), scene);
  const mood = def.mood;   // read once — it may be a per-venue getter
  const lights = mountLightRig(scene, mood, tier);
  // Desktop tier only: SSAO grounds feet and darkens the crease between close
  // bodies. Attached to the one gameplay camera; disposed with the mode.
  const ssao: SsaoHandle | null = tierRigSettings(tier, mood).ssao ? mountSsao(scene, camera) : null;
  // M61: painted sky + horizon backdrop (2 meshes, unlit, auto-rotating)
  // def.mood / def.backdrop may be getters (see ModeDefinition.mood): read each ONCE here so the rig, the
  // post pipeline, the backdrop and the ambient bed all agree on one mood for the life of the mount.
  const backdrop = mountBackdrop(scene, def.backdrop ?? MOOD_TO_FAMILY[mood] ?? 'park');
  // M59: anime ink outlines on every skinned character (auto-hooks spawns)
  const unink = autoInk(scene);
  const input = opts.input ?? new InputBus();
  const camDirector = new CameraDirector(scene, camera, def.camPreset);

  // M67: dev-only frame-budget monitor. mount() is a no-op in production, so
  // the overlay and its per-frame bookkeeping cost nothing for real players.
  const DEV = process.env.NODE_ENV === 'development';
  const perf = new PerfMonitor(scene, engine);
  perf.mount(DEV);

  let phase: ModePhase = 'loading';
  let startedAt = 0;
  let ambientStarted = false;   // M43: crowd/dojo bed starts once, on first input
  let unsub: (() => void) | null = null;
  let frameGuard: FrameGuard | null = null;
  let iblShadows: IblShadowsHandle | null = null;
  const setPhase = (p: ModePhase, detail?: number | string) => {
    phase = p;
    // M37: hero-off-screen watchdog runs only during live play.
    if (p === 'playing') frameGuard?.start(); else frameGuard?.stop();
    // M67: a shader compile is a defect only while gameplay is actually running.
    perf.setPlaying(p === 'playing');
    // M67: publish readiness for the smoke test. 'loaded' vs 'playing' matters —
    // a smoke test that greenlights on 'loaded' would pass a mode that never starts.
    if (p === 'loading') setReady(def.modeId, 'loading');
    else if (p === 'ready') setReady(def.modeId, 'loaded');
    else if (p === 'playing') setReady(def.modeId, 'playing');
    else if (p === 'error') setReady(def.modeId, 'failed', typeof detail === 'string' ? detail : undefined);
    opts.onPhase?.(p, detail);
  };

  const juice = new JuiceKit(scene, camera, opts.canvas.parentElement ?? document.body);

  // M35/M37 shared-core services: floor clamp, screen shake, input buffer.
  const groundLock = new GroundLock(scene);
  const shaker = new Shaker(scene, camera);
  const buffer = new InputBuffer();
  const feel: ModeFeel = { shaker, buffer, impact: (s: number) => feelImpact(shaker, s) };
  const heroRef: MutableRef<TransformNode> = { current: null };
  const objectiveRef: MutableRef<Vector3> = { current: null };

  const agentHooks: ModeContext['agent'] = {};   // M69: filled by a mode's load() if it opts in
  const ctx: ModeContext = {
    location: opts.location,
    scene, camera, camDirector, input, lights, juice,
    feel, heroRef, objectiveRef, groundLock, agent: agentHooks,
    phase: () => phase,
    end(outcome, score, stats) {
      if (phase === 'ended') return;
      setPhase('ended');
      const result: SessionResult = buildResult(def.modeId, outcome, score, stats, startedAt);
      (opts.resultSink ?? defaultResultSink)(result);
    },
    continuous: opts.continuous === true,
    card(outcome, score, stats) {
      if (phase === 'ended') return;
      const result: SessionResult = buildResult(def.modeId, outcome, score, stats, startedAt);
      void opts.cardSink?.(result);
    },
    setHud(update) { opts.onHud?.(update); },
  };

  // M37: hero-framing watchdog — recenters the camera if the hero leaves frame.
  frameGuard = new FrameGuard(scene, camera, () => heroRef.current, camDirector, () => objectiveRef.current);
  // `instrument` (2026-09-12): SceneInstrumentation is a bare module specifier, so a probe running
  // IN the page cannot import it — which is why per-mode performance had never been measured and the
  // locomotion Phase 3 gate ("animation pass <= 4 ms") had to be reported unjudgeable. Handing the
  // constructor out here costs nothing: the whole devHandle is development-only, and instrumentation
  // is not constructed unless a probe asks for it.
  const devHandle = {
    scene, modeId: def.modeId, hero: () => heroRef.current,   // hero for the framing probe (phase 6)   // dev probes (ship pass 4)
    instrument: () => new SceneInstrumentation(scene),
  };
  const devWindow = window as unknown as { __FEL_DEV__?: unknown };
  if (process.env.NODE_ENV === 'development') devWindow.__FEL_DEV__ = devHandle;
  setDiagMode(def.modeId);
  // a lost WebGL context is the one failure the player cannot recover from by playing on
  engine.onContextLostObservable.add(() => {
    reportDiag('context', 'WebGL context lost');
    // Measured (fault capture, 2026-09-03): the canvas went black and the HUD
    // kept streaming with no word to the player. Name it; the host's error UI
    // offers the reload.
    setPhase('error', 'Graphics were reset by the device. Reload to keep playing.');
  });
  engine.onContextRestoredObservable.add(() => reportDiag('context', 'WebGL context restored'));

  // ── Load with watchdog + error phase (the anti-infinite-spinner guarantee) ──
  // load() either resolves (READY), throws (error screen), or the 20s watchdog
  // fires (error screen). A player can never see an eternal spinner again.
  let renderWatchdog: RenderWatchdog | null = null;
  const attemptLoad = async (): Promise<boolean> => {
    setPhase('loading');
    renderWatchdog?.disarm();
    let timedOut = false;
    const watchdog = setTimeout(() => {
      timedOut = true;
      setPhase('error', 'Load timed out — check your connection and retry.');
    }, LOAD_WATCHDOG_MS);
    try {
      await def.load(ctx);
      clearTimeout(watchdog);
      if (timedOut) return false;                  // late resolve after watchdog: stay on error
      liftBlackMaterials(scene);                   // rescue anything venue-load added
      try { opts.applySkin?.(scene); } catch (e) { console.error('[FEL-ART] applySkin failed', e); }
      // M37: loud spawn assertion — empty world or missing hero never reaches play.
      assertSpawned(scene, { hero: heroRef.current, minWorldMeshes: 8, modeId: def.modeId });
      // Opt-in IBL contact shadows. Must come AFTER load(): voxelization
      // snapshots the geometry present when it runs, so mounting any earlier
      // would build the grid from an empty scene and do nothing.
      iblShadows = mountIblShadows(scene, camera);
      setPhase('ready');
      // M67: pre-warm every material now, on the loading→ready boundary, so a
      // first-visibility shader compile never hitches mid-play. Dev-only work.
      if (DEV) void perf.warmAll();
      // Runtime black-screen guard: after READY, watch the framebuffer; rescue
      // lighting if it goes black, and surface the error phase if unrecoverable.
      renderWatchdog?.disarm();
      renderWatchdog = new RenderWatchdog(scene, engine, camera, () => phase === 'playing', (m) => { reportDiag('load', `render watchdog: ${m}`); setPhase('error', m); });
      renderWatchdog.arm();
      return true;
    } catch (e) {
      clearTimeout(watchdog);
      reportDiag('load', `${def.modeId} load failed: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
      console.error(`[FEL-MODE] ${def.modeId} load failed:`, e);
      setPhase('error', e instanceof Error ? e.message : 'Failed to load the arena.');
      return false;
    }
  };
  await attemptLoad();

  // M69: hand the bridge this mode's live seams (read-only forwarders). No-op
  // when the bridge is disabled. Intent-level play (control) is per-mode and
  // wired separately; observation + programmatic start work for every mode.
  agentBridge()?.attach({
    scene,
    modeId: def.modeId,
    getHero: () => {
      const h = heroRef.current;
      return h ? { x: h.position.x, y: h.position.y, z: h.position.z } : null;
    },
    getMetrics: () => {
      const s = perf.current();
      return { fps: s?.fps ?? 0, worstFrameMs: s?.worstMs ?? 0, drawCalls: s?.drawCalls ?? 0 };
    },
    control: agentHooks.control,     // M69: present only if a mode opted in during load()
    getScore: agentHooks.getScore,
    start: () => { if (phase === 'ready') startCountdown(); },
  });

  input.start();
  unsub = input.on((e) => {
    // M43: browsers block audio until a user gesture — unlock on the very first
    // input event of the session (safe to call repeatedly; no-ops after unlock).
    SoundKit.unlock();
    if (!ambientStarted) {
      ambientStarted = true;
      // mood -> ambient bed: dojo hush, alpine wind-quiet, everything else a stadium crowd.
      const bed = mood === 'dojoWarm' ? 'dojo' : mood === 'alpine' || mood === 'overcast' ? 'none' : 'stadium';
      SoundKit.startAmbient(bed);
    }
    // Error phase: any press retries the load (the UI shows a RETRY button too)
    if (phase === 'error' && e.t === 'button' && e.pressed) { void attemptLoad(); return; }
    // READY gate: only the first press starts; gameplay input ignored until GO
    if (phase === 'ready' && e.t === 'button' && e.pressed) { startCountdown(); return; }
    if (phase === 'playing' && e.t === 'button' && e.btn === 'START' && e.pressed) { setPhase('paused'); return; }
    if (phase === 'paused' && e.t === 'button' && e.pressed) { setPhase('playing'); return; }
    if (phase === 'playing' && e.t === 'button' && e.btn === 'SELECT' && e.pressed) { camDirector.toggle(); return; }
    if (phase === 'playing') {
      if (e.t === 'button' && e.pressed) buffer.press(e.btn);   // M37 input-buffer
      def.onInput(ctx, e);
    }
  });

  function startCountdown(): void {
    setPhase('countdown', 3);
    let n = 3;
    const tick = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(tick);
        startedAt = performance.now();
        setPhase('playing');
      } else {
        opts.onPhase?.('countdown', n);
      }
    }, 800);
  }

  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime() / 1000;
    // M37 hit-stop: dt scales to 0 during an impact freeze, then eases back.
    if (phase === 'playing') def.update(ctx, dt * timeScale());
    scene.render();
  });
  const onResize = () => { applyCanvasFit(engine, opts.canvas); };   // M95: re-cap on rotate/resize (applyCanvasFit calls engine.resize)
  window.addEventListener('resize', onResize);

  return () => {
    window.removeEventListener('resize', onResize);
    agentBridge()?.detach();   // M69
    renderWatchdog?.disarm();
    frameGuard?.stop();
    unsub?.();
    input.stop();
    SoundKit.stopAmbient();   // M43: silence the ambient bed on teardown
    juice.dispose();
    shaker.dispose();
    groundLock.dispose();
    def.dispose?.();
    perf.dispose();       // M67
    clearReady();         // M67
    unink();              // M59
    backdrop.dispose();   // M61
    iblShadows?.dispose();
    ssao?.dispose();
    lights.dispose();
    scene.dispose();
    engine.dispose();
    // OOM-HYGIENE (2026-09-07): Babylon 9's floating-origin helper keeps a module-level `getScene` closure over the LAST
    // RENDERED scene (Materials/floatingOriginMatrixOverrides — every scene.render rebinds it, nothing ever clears it). It
    // was the one strong root left on a disposed dojo after an in-page exit (heap snapshot, karate_vs: 339 MB retained
    // through Window → webpack module cache → FloatingOriginCurrentScene.getScene → this → Scene, and from the Scene every
    // per-scene asset cache). Released only when the NEXT mode rendered — the hub / home page in between carried it.
    // Unconditional: the bound getter answers undefined unless floating-origin mode is on, so it cannot be compared to
    // this scene, and any other live scene rebinds it on its next render anyway.
    FloatingOriginCurrentScene.getScene = NO_SCENE;
    // the dev handle held the disposed scene (and through it every mesh and texture) until the next mount
    if (devWindow.__FEL_DEV__ === devHandle) delete devWindow.__FEL_DEV__;
  };
}