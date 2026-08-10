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
import { MediaPipePoseAdapter } from '../pose/mediapipe-adapter';
import { KinematicEngine } from '../rules/kinematic-engine';
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
  /** Called when the pose model is ready (to flip UI out of "loading"). */
  onReady?: () => void;
  /** Optional per-frame callback for a live HUD (phase, latency, zone states). */
  onFrame?: (info: { phase: string; frameMs: number; zones: Record<ZoneId, ZoneState> }) => void;
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

  // Pose + rules.
  const adapter = new MediaPipePoseAdapter({ numPoses: 1 });
  const kin = new KinematicEngine(pattern.thresholds);

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

  engine.runRenderLoop(() => {
    if (ready && opts.video.readyState >= 2) {
      const t0 = performance.now();
      const frame = adapter.detect(opts.video, t0);
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
      const frameMs = performance.now() - t0;
      frameMsAccum += frameMs; frameMsCount += 1;
      opts.onFrame?.({ phase: result.phase, frameMs, zones: zoneStates });
    }
    scene.render();
  });

  const onResize = () => engine.resize();
  window.addEventListener('resize', onResize);

  return {
    ready: () => ready,
    summary: (): SessionSummary => ({
      patternId: pattern.id,
      startedAtMs,
      durationMs: performance.now() - startedAtMs,
      timeInStableMs: { ...timeInStableMs },
      faultCounts: { ...faultCounts },
      avgFrameMs: frameMsCount ? frameMsAccum / frameMsCount : 0,
    }),
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
