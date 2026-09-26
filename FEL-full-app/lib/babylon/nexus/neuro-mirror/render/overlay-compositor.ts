// Neuro-Mechanic Mirror (v1) — overlay compositor
//
// Composites a transparent Babylon canvas over the live <video> camera feed
// (brief §2.2). Reuses the EXISTING FEL rig via CharacterLibrary.spawn (the same
// procedural athlete the game uses — no second skeleton), binds the highlight
// zones to it, and each frame: pulls MediaPipe landmarks, runs the standalone
// kinematic engine, and recolours the zones by their estimated state.
//
// The rig is shown in its neutral idle stance as an anatomical reference for the
// highlight zones. Driving the rig's pose from the user's landmarks (live
// retargeting) is NOT part of v1 scope and is deliberately not attempted here.

import {
  ArcRotateCamera, Color3, Color4, Engine, HemisphericLight, Scene, Vector3,
} from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../../../core/CharacterLibrary';
import { MediaPipePoseAdapter, type PoseFrame } from '../pose/mediapipe-adapter';
import { KinematicEngine } from '../rules/kinematic-engine';
import { RepCounter, type RepState } from '../rules/rep-counter';
import { SquatAudit, type SquatFrameResult } from '../rules/squat-audit';
import { PoseFrameGate } from './pose-frame-gate';
import { applyZoneState, bindHighlightZones, disposeZones, type BoundZone } from '../rig/zone-binding';
import { SPLIT_STANCE_PRESS_ROW, PATTERN_ZONES, type PatternConfig, type ZoneId } from '../patterns/split-stance-press-row';
import type { ZoneState } from '../rules/config';

export interface SessionSummary {
  patternId: string;
  startedAtMs: number;
  durationMs: number;
  /** Real accumulated ms each zone spent estimated-stable this session. */
  timeInStableMs: Record<ZoneId, number>;
  /** Real count of transitions INTO an estimated-fault state this session. */
  faultCounts: Record<ZoneId, number>;
  /** Rolling average per-frame engine+pose processing time (ms). */
  avgFrameMs: number;
  /** Completed pull→press cycles (estimated from joint kinematics). */
  reps: number;
  /** Average tempo across completed reps (null before the first). */
  avgTempo: { pullSec: number; pressSec: number } | null;
}

export interface MirrorRuntime {
  /** Whether the pose model has finished loading. */
  ready(): boolean;
  /** Snapshot of live session stats (real, not fabricated). */
  summary(): SessionSummary;
  dispose(): void;
}

export interface MirrorMountOpts {
  video: HTMLVideoElement;
  overlayCanvas: HTMLCanvasElement;
  pattern?: PatternConfig;
  /** Which analysis runs. 'zones' = the pattern's engagement zones (v1);
   *  'squat' = the corrective squat audit (the Playbook's movement check).
   *  The rig + video layers are identical either way. */
  analysis?: 'zones' | 'squat';
  /** Called when the pose model is ready (to flip UI out of "loading"). */
  onReady?: () => void;
  /** Optional per-frame callback for a live HUD (phase, latency, zone states,
   *  rep state, and the RAW POSE FRAME — pattern-specific trackers (vertical
   *  jump) and the skeleton painter consume it without the compositor knowing
   *  any pattern but its own). */
  onFrame?: (info: {
    phase: string;
    frameMs: number;
    zones: Record<ZoneId, ZoneState>;
    reps: RepState;
    pose: PoseFrame;
    /** Present when analysis==='squat'. */
    squat?: SquatFrameResult;
  }) => void;
}

const emptyPerZone = (): Record<ZoneId, number> => ({
  posterior_chain: 0, lat_rhomboid: 0, upper_traps: 0, rib_thoracic: 0, lumbo_pelvic: 0,
});

/**
 * Mount the mirror overlay. Everything runs client-side; the pose model streams
 * no data off-device. Returns a runtime handle for stats + teardown.
 */
export async function mountMirrorOverlay(opts: MirrorMountOpts): Promise<MirrorRuntime> {
  const pattern = opts.pattern ?? SPLIT_STANCE_PRESS_ROW;

  // Transparent Babylon layer over the video.
  const engine = new Engine(opts.overlayCanvas, true, { preserveDrawingBuffer: true, alpha: true } as any);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 0); // fully transparent so the video shows through

  const cam = new ArcRotateCamera('mirror_cam', -Math.PI / 2, 1.32, 2.7, new Vector3(0, 1.1, 0), scene);
  cam.fov = 0.9;
  cam.minZ = 0.05;
  const fill = new HemisphericLight('mirror_fill', new Vector3(0, 1, 0), scene);
  fill.intensity = 0.9;

  // Reuse the existing rig. URL is ignored while PROCEDURAL_CHARACTERS is on
  // (the game's default), which spawns the same procedural athlete the modes use.
  let character: SpawnedCharacter | null = null;
  try {
    character = await CharacterLibrary.spawn(scene, '/models/candidate.glb', { startClip: 'idle_stand' });
    // Face the camera. //TUNE(elijah) — flip by π if the rig shows its back.
    character.root.rotation = new Vector3(0, Math.PI, 0);
  } catch (e) {
    console.error('[FEL-MIRROR] rig spawn failed', e);
  }

  const zones: BoundZone[] = character
    ? bindHighlightZones(scene, character.skeleton, character.root)
    : [];

  // Pose + rules + the rep book (phase stream → counted reps with tempo).
  const adapter = new MediaPipePoseAdapter({ numPoses: 1 });
  const kin = new KinematicEngine(pattern.thresholds);
  const reps = new RepCounter();
  const squatAudit = opts.analysis === 'squat' ? new SquatAudit() : null;

  // Session accounting (all real).
  const startedAtMs = performance.now();
  const timeInStableMs = emptyPerZone();
  const faultCounts = emptyPerZone();
  const prevState: Record<ZoneId, ZoneState> = {
    posterior_chain: 'unavailable', lat_rhomboid: 'unavailable', upper_traps: 'unavailable',
    rib_thoracic: 'unavailable', lumbo_pelvic: 'unavailable',
  };
  let frameMsAccum = 0;
  let frameMsCount = 0;

  let ready = false;
  adapter.init().then(() => { ready = true; opts.onReady?.(); })
    .catch((e) => console.error('[FEL-MIRROR] pose init failed', e));

  // MIRROR-COACH P2 (2026-09-26): one camera frame, one evaluation. This loop runs at the display's rate and the adapter
  // returns its previous frame, unchanged, until the camera delivers the next — and every one of those used to be
  // evaluated again: the squat audit read a repeat as 1 ms of zero hip travel, so a hip near the top read 'standing'
  // and the harness counted a rep (P1's live proof: all 11 reps of the guided squat inside ONE squat). Only a frame
  // whose timestamp has advanced is analysed and handed to onFrame (render/pose-frame-gate.ts); the scene still renders.
  const poseGate = new PoseFrameGate();

  engine.runRenderLoop(() => {
    if (ready && opts.video.readyState >= 2) {
      const t0 = performance.now();
      const frame = adapter.detect(opts.video, t0);
      if (!poseGate.admit(frame)) { scene.render(); return; }
      const result = kin.evaluate(frame);
      const zoneStates = {} as Record<ZoneId, ZoneState>;
      for (const z of zones) {
        const rep = result.zones[z.id];
        applyZoneState(z, rep.state);
        zoneStates[z.id] = rep.state;
        // accumulate stable time
        if (rep.state === 'stable') timeInStableMs[z.id] += result.dtMs;
        // count transitions into fault
        if (rep.state === 'fault' && prevState[z.id] !== 'fault') faultCounts[z.id] += 1;
        prevState[z.id] = rep.state;
      }
      // ensure zones that had no mesh still report for the HUD
      for (const id of PATTERN_ZONES) if (!(id in zoneStates)) zoneStates[id] = result.zones[id].state;
      reps.feed(result.phase, frame.timestampMs);
      const squat = squatAudit?.evaluate(frame);
      const frameMs = performance.now() - t0;
      frameMsAccum += frameMs; frameMsCount += 1;
      opts.onFrame?.({ phase: result.phase, frameMs, zones: zoneStates, reps: reps.state, pose: frame, squat });
    }
    scene.render();
  });

  const onResize = () => engine.resize();
  window.addEventListener('resize', onResize);

  return {
    ready: () => ready,
    summary: (): SessionSummary => {
      const repState = reps.state;
      return {
        patternId: pattern.id,
        startedAtMs,
        durationMs: performance.now() - startedAtMs,
        timeInStableMs: { ...timeInStableMs },
        faultCounts: { ...faultCounts },
        avgFrameMs: frameMsCount ? frameMsAccum / frameMsCount : 0,
        reps: repState.reps,
        avgTempo: repState.avg,
      };
    },
    dispose() {
      window.removeEventListener('resize', onResize);
      engine.stopRenderLoop();
      disposeZones(zones);
      character?.dispose();
      adapter.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
