/**
 * lib/feel/index.ts
 * =================
 * M9 — barrel export for the six shared feel systems (ported from the
 * proven Babylon.js engineering line, FEEL_REFERENCE_SPEC). Archetype
 * cores import from here; modes are thin skins on the cores.
 *
 *   FixedStepLoop  · InputBuffer · StateMachine · ArcDrive · SensoryBus
 *   feelConfig (+ variable-gravity helpers) · AirTrick · RhythmCadence
 *   QuizCore
 *
 * Reconciliation note: lib/impact-system.ts (M8.3) and lib/camera-director.ts
 * (M8.2) remain the render-side effect libraries. SensoryBus is the
 * frame-synced *dispatcher* that can drive them (shake/hit-stop) plus SFX
 * and rumble on the same frame. Cores wire SensoryBus → loop.hitStop and
 * camera.applyCameraShake; existing impact visuals stay as the renderers.
 */

export { FixedStepLoop } from './fixed-step-loop';
export type { FixedStepLoopOpts } from './fixed-step-loop';

export { InputBuffer } from './input-buffer';
export type { InputBufferOpts } from './input-buffer';

export { StateMachine } from './state-machine';
export type { FsmState, StateMachineOpts } from './state-machine';

export { ArcDrive } from './arc-drive';
export type { Vec3, ArcDriveOpts } from './arc-drive';

export { AirTrick } from './air-trick';
export type { AirTrickOpts, TrickGrade, TrickResult } from './air-trick';

export { RhythmCadence } from './rhythm-cadence';
export type {
  RhythmCadenceOpts,
  CadenceSide,
  CadenceQuality,
  CadenceStats,
} from './rhythm-cadence';

export { SensoryBus } from './sensory-bus';
export type {
  SensoryBusOpts,
  SensoryEvent,
  SensoryStats,
  SensoryCamera,
  SensoryLoop,
} from './sensory-bus';

export {
  feelConfig,
  mergeFeel,
  gravityScaleForVy,
  gravityAccelForVy,
} from './feel-config';
export type { FeelConfig, GravityConfig } from './feel-config';

export { QuizCore } from './quiz-core';
export type {
  QuizQuestion,
  QuizCoreOpts,
  QuizResult,
  QuizStats,
} from './quiz-core';
