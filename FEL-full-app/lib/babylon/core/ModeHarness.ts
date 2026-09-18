// ModeHarness — every Babylon mode runs through this: scene boot, LightRig,
// InputBus, READY gate + 3-2-1, pause, update loop, SessionResult emit.

import type { HudCue } from './danceTracks';
import { Scene, TargetCamera, Vector3, SceneInstrumentation, Ray } from '@babylonjs/core';
import { FloatingOriginCurrentScene } from '@babylonjs/core/Materials/floatingOriginMatrixOverrides';
import { createEngine } from './createEngine';
import type { TransformNode } from '@babylonjs/core';
import { mountPlayerRing, modeOwnsPlayerRing, type PlayerRingHandle } from '../visual/PlayerRing';   // PLAYER RING (all modes, 2026-09-17)
import { readPlayerIcon } from '../visual/playerIcon';
import { cachedIdentity } from './playerIdentity';
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
import { MomentumBus } from './MomentumBus';
import { crowdLevel, tierSting, tierImpact } from './MomentumFx';
import {
  kickImpactFrame, decayImpactFrame, impactGrade, IMPACT_FRAME_IDLE,
  type ImpactFrameState, type Grade,
} from './ImpactFrame';
import { SoundKit } from '../audio/SoundKit';
import { QaTrace } from './QaTrace';   // MECHANICS PASS: press → perceivable answer, agent-only   // M43: unlock audio on first user gesture
import { autoInk } from '../visual/AnimeInk';    // M59: anime ink outlines
import { mountBackdrop, MOOD_TO_FAMILY } from '../visual/Backdrops'; // M61: painted backdrops
import type { BackdropFamily } from '../visual/Backdrops';
import { FrameGuard, assertSpawned } from './FrameGuard';
import { applyCanvasFit } from './canvasFit';       // M95 (Pass 2): cap DPR + backing-pixel budget
import { PerfMonitor, budgetForTier } from './PerfMonitor';          // M67: dev frame-budget monitor
import { setReady, clearReady } from './readyMarker';  // M67: smoke-test readiness gate
import { installAgentBridge, agentBridge, agentEnabled } from './AgentBridge';  // M69: agent control plane
import { AGENT_MODES } from './agentModes';
import type { AgentControlSource } from './AgentControlSource';  // M69: per-mode intent play
import { reportDiag, setDiagMode } from './diag';
import { makeAnimProbe } from '../anim/animProbe';   // SHARED-ANIM-BUS: the production body readout
import type { PrqGrade } from '../../prq';
type PrqBand = PrqGrade['key'];
import { emit as emitCreator } from '@/lib/creator/CreatorRecord';   // the ONE canonical record
import { isWakeInput, WakeLatch } from './StartWake';   // SHARED-START-UNSTICK: any press/push/pull → playing

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
  /**
   * The player's PRQ band, when the host knows it.
   *
   * READ-ONLY and optional, and modes must treat absent as READY rather than as a penalty -- see
   * core/PrqVitals. A guest who has never done a body scan must not be handed a worse fighter.
   */
  prqBand?: PrqBand | null;
  camera: TargetCamera;
  camDirector: CameraDirector;
  input: InputBus;
  lights: LightRigHandle;
  /** premium-feel layer (M29): hit-stop, shake, world-space score pops, flash, slow-mo. */
  juice: JuiceKit;
  /** M37 game-feel: input buffer, screen shake, hit-stop bundle. */
  feel: ModeFeel;
  /**
   * The shared Game-Breaker meter, one per mount.
   *
   * It lives on the context rather than in each mode because the RESPONSE is the harness's: the crowd bed
   * tracks the score every frame and a tier RISE stings, flashes and shakes, so a mode gets all of that by
   * calling `ctx.momentum.report(...)` and nothing else. Eight modes used to build their own bus, and in
   * seven of them going ON FIRE was inaudible -- there was exactly one `onTierChange` subscriber in the
   * entire game. The harness also owns the per-frame `update(dt)` decay.
   */
  momentum: MomentumBus;
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
  end(outcome: string, score: number, stats: Record<string, number>, detail?: unknown): void;
  /** TRY-ONBOARD (G1/G7): the host asked for a CONTINUOUS night. A mode that would
   *  otherwise finish its card must offer GO AGAIN in-mode — report through card()
   *  and keep playing — instead of calling end(), which parks the harness in
   *  'ended' and hands the host a modal it can only answer by remounting. */
  continuous: boolean;
  /** A finished card that does NOT end the session. Same SessionResult the sink
   *  would get from end(), but the phase stays 'playing': the scene, the camera,
   *  the input and every loaded asset survive, so the next night is a soft reset
   *  inside the mode rather than a cold reboot of the whole stage. */
  card(outcome: string, score: number, stats: Record<string, number>, detail?: unknown): void;
  setHud(update: Record<string, HudValue>): void;   // bezel HUD bridge
  /** PLAYER RING (all modes, 2026-09-17): the ring's arc — a mode with a tank (boost / turbo) reports it 0..1; without a
   *  report the ring stays full. Optional so a mode (or a test's fake context) need not know about the ring. */
  stamina?(v01: number): void;
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
  /**
   * Set when the mode drives the crowd bed itself and the harness must keep its hands off.
   *
   * Only DunkMode does. It has CrowdEnergy -- a building voice tied to the contest's own beats (the
   * hush before an attempt, the roar on a flush) -- and that is better than a meter-driven bed, not
   * worse. The harness's `setAmbientLevel(crowdLevel(score01))` runs after `update()`, so without this
   * flag it would overwrite dunk's crowd every single frame.
   */
  ownsCrowd?: boolean;
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
  /** The player's PRQ band, if the host resolved one. Absent is a guest, and a guest is never penalised. */
  prqBand?: PrqBand | null;
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
  const backdrop = mountBackdrop(scene, def.backdrop ?? MOOD_TO_FAMILY[mood] ?? 'park', mood);
  // M59: anime ink outlines on every skinned character (auto-hooks spawns)
  const unink = autoInk(scene);
  const input = opts.input ?? new InputBus();
  const camDirector = new CameraDirector(scene, camera, def.camPreset);

  // M67: dev-only frame-budget monitor. mount() is a no-op in production, so
  // the overlay and its per-frame bookkeeping cost nothing for real players.
  const DEV = process.env.NODE_ENV === 'development';
  // the budget follows the TIER: one ceiling across both was firing on desktop (833 draws at a steady 60 fps)
  // and never on mobile (277 draws, the same scene), which is exactly backwards — see PerfMonitor.
  const perf = new PerfMonitor(scene, engine, budgetForTier(tier));
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
    else if (p === 'ended') setReady(def.modeId, 'ended');
    else if (p === 'error') setReady(def.modeId, 'failed', typeof detail === 'string' ? detail : undefined);
    opts.onPhase?.(p, detail);
  };

  const juice = new JuiceKit(scene, camera, opts.canvas.parentElement ?? document.body);

  // MECHANICS PASS (2026-09-15): CAUSE → EFFECT, measured. Under `?agent=1` only, every press the mode receives and
  // every answer a player can perceive (HUD news, a juice beat, an impact, a sound, the hero's clip changing) goes on
  // one timeline, published as `window.__FEL_QA__` for the mechanics probe. See QaTrace.ts. Off in play: `qa` is null.
  const qa = agentEnabled() ? new QaTrace() : null;
  const qaRawHud: Record<string, unknown> = {};
  const qaTrigAt: Record<'L' | 'R', number> = { L: -1e9, R: -1e9 };
  let qaResult: { outcome: string; score: number; card?: boolean } | null = null;
  let qaRestore: (() => void) | null = null;
  if (qa) {
    const j = juice as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const m of ['hitStop', 'shake', 'slowMo', 'flash', 'scorePop', 'banner', 'callout', 'impact']) {
      const orig = j[m]?.bind(juice);
      if (orig) j[m] = (...a: unknown[]) => { qa.juice(m); return orig(...a); };
    }
    const sk = SoundKit as unknown as { play: (n: string, o?: unknown) => void };
    const origPlay = sk.play;
    sk.play = function (this: unknown, n: string, o?: unknown) { qa.sfx(n); return origPlay.call(SoundKit, n, o); };
    const qaHandle: Record<string, unknown> = {};
    qaRestore = () => {
      sk.play = origPlay;
      // The handle OUTLIVES the mount, minus its scene. A probe reads the session's numbers after the mode has ended (the
      // onboarding card, the carnival's event rotation, any end screen) and deleting the handle outright made those
      // sessions read as "no presses at all". What must not survive is the SCENE: those getters go null here, so nothing
      // retains a disposed mount.
      qaHandle.scene = () => null;
      qaHandle.hero = () => null;
    };
    (window as unknown as { __FEL_QA__?: unknown }).__FEL_QA__ = Object.assign(qaHandle, {
      modeId: def.modeId,
      now: () => performance.now(),
      summary: (windowMs?: number, from?: number) => qa.summary(windowMs, from),
      events: (n = 400) => qa.events.slice(-n),
      hud: () => qa.snapshot(),
      /** Every HUD key's latest value, the continuous ones too (a meter, a phase) — what an INTENT driver plays from. */
      rawHud: () => ({ ...qaRawHud }),
      result: () => qaResult,
      reset: () => qa.reset(),
      /** The live scene for an INTENT driver (the ball in flight, a pitch on its way): QA sessions only (`?agent=1`). */
      scene: () => (scene.isDisposed ? null : scene),
      hero: () => heroRef.current,
    });
  }

  // M35/M37 shared-core services: floor clamp, screen shake, input buffer.
  const groundLock = new GroundLock(scene);
  const shaker = new Shaker(scene, camera);
  const buffer = new InputBuffer();
  // THE FRAME ANSWERS AN IMPACT TOO.
  //
  // `LightRig` mounts a real post pipeline for every mode and then nothing ever touches it again — audited
  // 2026-09-14: `rig.pipeline` had no reader outside LightRig and `flashBeat()` had exactly one caller in
  // the whole game. Meanwhile twenty-one modes already report their heaviest moments through
  // `ctx.feel.impact`. Putting the response HERE means all twenty-one gain it without a line of per-mode
  // code — the same argument gameFeel made when it added audio to `impact()`.
  //
  // The resting grade is captured once, from whatever mood the venue chose, so a night court and a bright
  // gym each pulse around their OWN look instead of being graded to shared constants.
  const restGrade: Grade = {
    vignette: lights.pipeline.imageProcessing.vignetteWeight,
    exposure: lights.pipeline.imageProcessing.exposure,
  };
  let frame: ImpactFrameState = IMPACT_FRAME_IDLE;
  let framePainted = false;
  const feel: ModeFeel = {
    shaker, buffer,
    impact: (s: number) => { qa?.impact(); feelImpact(shaker, s); frame = kickImpactFrame(frame, s); },
  };
  // MOMENTUM IS HEARD, NOT DISPLAYED. `momentum:` in setHud only draws in hosts that happen to render it,
  // and there are twenty-one separate host components. The crowd bed and the tier sting need no host at
  // all, so they work in every mode -- including the nineteen whose HUD never had a meter.
  const momentum = new MomentumBus();
  momentum.onTierChange((next, prev) => {
    const sting = tierSting(next, prev);
    if (!sting) return;                                    // falls are silent: decay makes them routine
    SoundKit.play(sting.sfx, { volume: sting.volume });
    if (sting.flash) lights.flashBeat();
    const punch = tierImpact(next, prev);
    if (punch > 0) feel.impact(punch);
  });

  const heroRef: MutableRef<TransformNode> = { current: null };
  let ring: PlayerRingHandle | null = null;   // PLAYER RING (harness-mounted; a mode's own ring keeps this null)
  const objectiveRef: MutableRef<Vector3> = { current: null };

  const agentHooks: ModeContext['agent'] = {};   // M69: filled by a mode's load() if it opts in
  const ctx: ModeContext = {
    location: opts.location,
    prqBand: opts.prqBand ?? null,
    scene, camera, camDirector, input, lights, juice,
    feel, momentum, heroRef, objectiveRef, groundLock, agent: agentHooks,
    phase: () => phase,
    end(outcome, score, stats, detail) {
      if (phase === 'ended') return;
      if (qa) qaResult = { outcome, score };
      setPhase('ended');
      const result: SessionResult = buildResult(def.modeId, outcome, score, stats, startedAt, detail);
      // a run that REACHED ITS END is a completion; the time is whatever it actually took. Both go to the
      // same record the session went to, and nowhere else.
      emitCreator({ kind: 'completion', discipline: def.modeId });
      emitCreator({ kind: 'time', discipline: def.modeId, seconds: Math.round((performance.now() - startedAt) / 1000) });
      (opts.resultSink ?? defaultResultSink)(result);
    },
    continuous: opts.continuous === true,
    card(outcome, score, stats, detail) {
      if (phase === 'ended') return;
      if (qa) qaResult = { outcome, score, card: true };
      const result: SessionResult = buildResult(def.modeId, outcome, score, stats, startedAt, detail);
      void opts.cardSink?.(result);
    },
    setHud(update) { if (qa) { qa.hud(update); Object.assign(qaRawHud, update); } opts.onHud?.(update); },
    stamina(v01) { ring?.set(v01); },
  };

  // M37: hero-framing watchdog — recenters the camera if the hero leaves frame.
  frameGuard = new FrameGuard(scene, camera, () => heroRef.current, camDirector, () => objectiveRef.current);
  // `instrument` (2026-09-12): SceneInstrumentation is a bare module specifier, so a probe running
  // IN the page cannot import it — which is why per-mode performance had never been measured and the
  // locomotion Phase 3 gate ("animation pass <= 4 ms") had to be reported unjudgeable. Handing the
  // constructor out here costs nothing: the whole devHandle is development-only, and instrumentation
  // is not constructed unless a probe asks for it.
  // SHARED-ANIM-BUS (2026-09-14): the body readout — clip scope, registered / refused clips, the hero's playing clips and
  // hands in the chest frame with the LocoBus arms verdict. Published in PRODUCTION too: the eye grades skate H1 and the
  // derby / football arms on `next start`, where there is no scene handle to read bones through. Holds the scene weakly.
  const animProbe = makeAnimProbe(scene, () => heroRef.current);
  const devHandle = {
    scene, modeId: def.modeId, hero: () => heroRef.current,   // hero for the framing probe (phase 6)   // dev probes (ship pass 4)
    instrument: () => new SceneInstrumentation(scene),
    // INPUT (2026-09-13): the bus itself, so a probe can subscribe and read the CANONICAL events a pad
    // produces. That is what makes the controller-profile claim checkable on a running game rather than only
    // against fixtures — a Switch Pro's bottom face button has to arrive in a real mode as A.
    input,
    // MOMENTUM (2026-09-14): the shared meter, so a probe can watch a run heat up. The response is a crowd
    // bed and a sting -- neither of which a probe can hear -- so without this the only way to check that a
    // mode reports at all is to read its source and hope.
    momentum: () => ({ score01: momentum.score01, tier: momentum.tier }),
    anim: animProbe,
  };
  // CONTROLLER-STICK-LIVE (2026-09-14): a QA eye on the production server (`next start`, /try) waited 120 s for
  // `__FEL_DEV__.input`, which only a dev build published — so it read an empty roster and zero slot events under
  // four live chips, and its reload timed out. Production now publishes the INPUT seam alone: no scene, no hero,
  // nothing that retains a disposed mount. The full handle stays development-only.
  const probeHandle = process.env.NODE_ENV === 'development' ? devHandle : { modeId: def.modeId, input, anim: animProbe };
  const devWindow = window as unknown as { __FEL_DEV__?: unknown };
  devWindow.__FEL_DEV__ = probeHandle;
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
    start: () => { if (phase === 'ready') wake(); },
  });

  input.start();
  const wakeLatch = new WakeLatch();
  const qaTrig = { L: 0, R: 0 };
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
    // READY gate (SHARED-START-UNSTICK): the first press, stick push, d-pad press or trigger pull starts play NOW.
    // A waking button is not a gameplay press (dropped, and so is its release — see StartWake); a waking stick or
    // trigger is state, so it falls through and the hero is already moving on the first playing frame.
    if (phase === 'ready' && isWakeInput(e)) {
      wake();
      if (!wakeLatch.wake(e, performance.now())) return;
    }
    if (phase === 'playing' && e.t === 'button' && e.btn === 'START' && e.pressed) { setPhase('paused'); return; }
    if (phase === 'paused' && e.t === 'button' && e.pressed) { setPhase('playing'); return; }
    if (phase === 'playing' && e.t === 'button' && e.btn === 'SELECT' && e.pressed) { camDirector.toggle(); return; }
    if (phase === 'playing') {
      if (!wakeLatch.pass(e, performance.now())) return;
      if (e.t === 'button' && e.pressed) buffer.press(e.btn);   // M37 input-buffer
      if (qa) {
        if (e.t === 'button' && e.pressed) qa.press(e.btn);
        else if (e.t === 'dpad' && e.pressed) qa.press(`DPAD_${e.dir.toUpperCase()}`);
        else if (e.t === 'trigger') {
          // a crossing is a PRESS only once per pull: a trigger that flickers (two emitters, a noisy pad) must not read as
          // a burst of presses — it has to come back under half for a beat before the next one counts
          const was = qaTrig[e.side]; qaTrig[e.side] = e.value;
          const t = performance.now();
          if (was < 0.5 && e.value >= 0.5 && t - qaTrigAt[e.side] > 120) { qaTrigAt[e.side] = t; qa.press(`${e.side}T`); }
        }
      }
      def.onInput(ctx, e);
    }
  });

  // SHARED-START-UNSTICK (2026-09-14): READY → 'playing' in the same event. This was a 3-2-1 on an 800 ms interval —
  // 2.4 s from the press to the first update(), the hero standing still throughout, and a stick or d-pad never
  // started it at all. The 'countdown' phase stays in ModePhase (hosts still type against it) but nothing enters it.
  function wake(): void {
    if (phase !== 'ready') return;
    startedAt = performance.now();
    setPhase('playing');
    // CREATOR CARD (2026-09-13): one canonical record, one writer. Every mode's session is recorded HERE
    // rather than in each mode, which is the mission's rule ("No mode may persist its own parallel
    // profile") enforced by there being exactly one call site. A discipline id is the mode id — nothing
    // finer, because a richer stream would be more useful to us and worse for the person it is about.
    emitCreator({ kind: 'session', discipline: def.modeId });
  }

  const qaSteps = qaSpeedParam();
  // the hero's DOMINANT clip, sampled every 100 ms: a new top clip is a body answering a press
  let qaAnimAt = 0, qaTop = '', qaRoot: TransformNode | null = null, qaTargets: Set<unknown> | null = null;
  function qaSampleAnim(): void {
    const now = performance.now(); if (now - qaAnimAt < 100) return; qaAnimAt = now;
    const root = heroRef.current; if (!root || !qa) return;
    if (root !== qaRoot) {
      qaRoot = root;
      const under = new Set<unknown>(root.getDescendants(false));
      const sk = scene.skeletons.find((k) => k.bones.some((b) => under.has(b.getTransformNode())));
      qaTargets = sk ? new Set<unknown>(sk.bones.map((b) => b.getTransformNode()).filter(Boolean)) : null;
    }
    if (!qaTargets) return;
    let best = '', bw = 0.3;
    for (const g of scene.animationGroups) {
      if (!g.isPlaying) continue;
      const w = g.weight === undefined || g.weight < 0 ? 1 : g.weight;
      if (w > bw && g.targetedAnimations.some((t) => qaTargets!.has(t.target))) { bw = w; best = g.name; }
    }
    if (best && best !== qaTop) { qaTop = best; qa.anim(best); }
  }
  // PLAYER RING (owner, 2026-09-17: "a player indicator with their icon in all modes like we did for 1v1"). The seven
  // modes that mount their own ring (mountPlayerRing without `harness`) keep it; everywhere else the harness rides the
  // hero reference every mode already sets for the frame guard. A reference that is not a body — a ball in flight, a
  // scene anchor in a quiz — keeps the ring where it was, so the indicator never points at the wrong thing.
  const RING_SKIP = new Set(['brainbrawl', 'who_scene_it']);
  let ringRoot: TransformNode | null = null;
  const bodyLike = (n: TransformNode | null): n is TransformNode => !!n && !n.isDisposed() && n.getChildMeshes(false).some((m) => m.getTotalVertices() > 0);
  const ringFollow = () => {
    if (RING_SKIP.has(def.modeId) || modeOwnsPlayerRing(scene)) return;
    const root = heroRef.current;
    if (root === ringRoot || !bodyLike(root)) return;
    ring?.dispose(); ringRoot = root;
    const card = cachedIdentity()?.card;
    // (a trail / effect plane wider than 4 m is not the footprint and is skipped)
    // (the footprint is the UNSKINNED part: a chassis, a deck — never the person, nor the driver sitting in the kart)
    // the ring fits the hero's FOOTPRINT: a body takes the default 0.62 m, a kart (1.3 x 2 m, root at axle height) a
    // 1.1 m ring at its wheels — measured in root space so the ring rides whatever the root does
    root.computeWorldMatrix(true);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity;
    const inv = root.getWorldMatrix().clone().invert();
    for (const m of root.getChildMeshes(false)) { if (m.getTotalVertices() === 0 || !m.isVisible || !m.isEnabled() || m.skeleton) continue; const bi = m.getBoundingInfo(); if (bi.boundingSphere.radiusWorld > 4) continue; const bb = bi.boundingBox; for (const v of bb.vectorsWorld) { const p = Vector3.TransformCoordinates(v, inv); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); minY = Math.min(minY, p.y); } }
    const span = Math.max(maxX - minX, maxZ - minZ);
    const radius = isFinite(span) && span > 1.3 ? Math.min(1.3, span * 0.5) : 0.62;   // a person (or a rider on a deck) keeps the default; a vehicle gets its own
    // the ring sits on the SURFACE under the root, not at the root: a kart's root is its axle (0.44 m up), and its
    // lowest child box (measured −0.8) is not its wheels either. A ray down from the root finds the ground it rides;
    // a root already on its surface (a body, a board rider) keeps 0.
    void minY;
    const at = root.getAbsolutePosition();
    const hit = scene.pickWithRay(new Ray(new Vector3(at.x, at.y + 0.3, at.z), Vector3.Down(), 6), (m) => m.isEnabled() && m.isVisible && m.getTotalVertices() > 0 && !m.isDescendantOf(root) && !/^player_/.test(m.name));   // NOT isPickable: the kart's road is unpickable and sits above the pickable venue ground
    const y = hit?.hit && hit.distance > 0.4 ? -(hit.distance - 0.3) : at.y > 0.15 && at.y < 0.9 ? -at.y : 0;
    ring = mountPlayerRing(scene, root, { color: card?.accent ?? '#22d3ee', icon: readPlayerIcon(), harness: true, radius, y });
  };
  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime() / 1000;
    ringFollow();
    // M37 hit-stop: dt scales to 0 during an impact freeze, then eases back.
    if (phase === 'playing') {
      if (qa) qaSampleAnim();
      def.update(ctx, dt * timeScale());
      // RELEASE GAUNTLET fast-forward (?agent=1&qaSpeed=N only): N-1 extra updates a frame, so a QA run reaches the
      // mode's OWN end card — its clock, its attempts, its ctx.end — in a fraction of the wall time. Never on in play.
      for (let i = 1; i < qaSteps && phase === 'playing'; i++) def.update(ctx, dt * timeScale());
      // the meter cools on REAL time, so a hit-stop cannot be used to bank momentum
      momentum.update(dt);
      if (!def.ownsCrowd) SoundKit.setAmbientLevel(crowdLevel(momentum.score01));
    }
    // The impact pulse runs on REAL dt and in every phase, so a mode that ends mid-pulse still hands the
    // frame back at its resting grade instead of leaving the end card dimmed. `framePainted` means the
    // restore is written exactly once rather than every frame for the rest of the session.
    if (frame.level > 0 || framePainted) {
      frame = decayImpactFrame(frame, dt);
      const g = impactGrade(frame.level, restGrade);
      lights.pipeline.imageProcessing.vignetteWeight = g.vignette;
      lights.pipeline.imageProcessing.exposure = g.exposure;
      framePainted = frame.level > 0;
    }
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
    qaRestore?.();
    shaker.dispose();
    groundLock.dispose();
    ring?.dispose(); ring = null; ringRoot = null;   // PLAYER RING
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
    if (devWindow.__FEL_DEV__ === probeHandle) delete devWindow.__FEL_DEV__;
  };
}

/** `?qaSpeed=N` (1..8), honoured only under the agent bridge (`?agent=1`). 1 = normal play. */
function qaSpeedParam(): number {
  if (!agentEnabled()) return 1;
  try {
    const n = Number(new URLSearchParams(window.location.search).get('qaSpeed'));
    return Number.isFinite(n) && n >= 1 ? Math.min(8, Math.floor(n)) : 1;
  } catch { return 1; }
}
