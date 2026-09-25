// FEL Babylon engine — unified barrel (M24 anim/scene + M26 framework cores).
// Every Babylon mode runs through runMode() with a ModeDefinition.
// See lib/babylon/modes/registry.ts for the route-ready MODES map.

// ── anim (M24) ──
export { CLIP_ALIASES, FALLBACK_CLIP } from './anim/clipAliases';
export { resolveClip, missingClipList, missingClipCount } from './anim/clipResolver';
export { CharacterAnimator, type PlayOpts } from './anim/CharacterAnimator';
export { buildClip, type BoneKeys, type HipsYKeys } from './anim/clipBuilder';
export { EASTBAY_TIMING, DUNK_TIMING } from './anim/authored/timing';
export { registerAuthoredClips } from './anim/authored';
export {
  attachBallToHand, releaseBall, runEastbayPath, flushThroughRim, clankOffRim,
} from './anim/ballRig';

// ── scene (M24) ──
export { MOODS, MODE_MOODS, type VenueMood } from './scene/moods';
export { mountLightRig, liftBlackMaterials, addShadowCasters, type LightRigHandle } from './scene/LightRig';
export { DunkReplayRecorder } from './scene/DunkReplayCam';

// ── framework cores (M26) ──
export { CharacterLibrary, type SpawnedCharacter, type SpawnOpts } from './core/CharacterLibrary';
export {
  runMode, type ModeDefinition, type ModeContext, type ModePhase, type HudValue, type HudScoreCard,
  type BodyView, type ModeBodySpec, type BodyClaim,   // MOVEMENT PLAY P3: the body seam a mode meets
} from './core/ModeHarness';
export { CameraDirector, FOLLOW_PRESETS } from './core/CameraDirector';
export { InputBus, publishBodyToLive, type FelInput, type BodyPacket } from './core/InputBus';
// MOVEMENT PLAY P3 (2026-09-24): what the body channel carries, and a mode's row in the body profiles
export type { BodyRead, BodyEvent } from '../pose/BodyReader';
export type { BodyChannels } from '../pose/bodyChannels';
export type { BodyProfile } from '../input/bodyProfiles';
export { BallSim, arcVelocity } from './core/BallPhysics';
export { CoinField, COIN_RUN_CAP } from './core/Pickups';
export { Mob, MobPool, STEERING_PRESETS, type SteeringConfig } from './core/MobSteering';
export { Rider, type GrindLine } from './core/GroundRide';
export { buildResult, type SessionResult } from './core/sessionResult';

// ── premium feel (M29) ──
export { JuiceKit } from './premium/JuiceKit';
export { vibrate, padRumble, HAPTIC } from './premium/Haptics';
