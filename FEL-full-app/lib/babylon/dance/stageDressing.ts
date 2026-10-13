// THE CYPHER, DRESSED (vis-party, 2026-10-13; docs/VISUAL-PASS-PLAN.md Part B, dance).
//
// What the pass adds to the room the venue spec builds — all of it VISUAL, none of it reads or writes a score, a window, a
// step or a judgement:
//   · an LED wall where the banner stood (dance/ledWall.ts) — beat-synced patterns, the room's name, the song, the player;
//   · moving heads (party/movingHeads.ts) sweeping the floor on the bar and snapping to the dancer on the cross;
//   · lit tiles on the stage deck (dance/stageFloor.ts), the stand-in for a mirror floor;
//   · a packed floor of silhouettes bouncing to the tempo (dance/clubCrowd.ts) behind the eight real bodies;
//   · CO2 jets and a confetti burst on a streak milestone, an instrument joining the band and the S grade.
// Everything runs off the SAME BeatBus the lamps, the podium and the camera read (beatBus.ts), so the stage is on the song's
// clock and a paused song holds all of it. Reduced flashing holds the wall's pattern for the whole bar and steadies the beams;
// reduced motion stands the crowd still and skips the jets and the confetti.
//
// NOT here, because they need the foundation's wave-2 systems (VISUAL-PASS-PLAN "Foundation status"): clustered spot lights
// on the heads (so a beam lights the dancer), a mirror / SSR stage floor, and the new sky. `fixtures` on the heads is where a
// light would ride.

import { Vector3, type Scene, type TransformNode } from '@babylonjs/core';
import type { LightRigHandle } from '../scene/LightRig';
import { EffectsKit } from '../visual/EffectsKit';
import { headCountFor, mountMovingHeads, type HeadFloor, type HeadHandle, type HeadPhase, type HeadSpec } from '../party/movingHeads';
import { keepOutOfShadows } from '../party/shadowOpt';
import { beatPhaseAt } from './beatBus';
import { crowdCountFor, mountClubCrowd, type ClubCrowdHandle } from './clubCrowd';
import { mountLedWall, type LedWallHandle } from './ledWall';
import { mountStageFloor, type StageFloorHandle } from './stageFloor';

/** The truss: where the moving heads hang (above the top of the stage camera's frame) — the first `headCountFor(tier)` are used. */
export const DANCE_HEADS: readonly HeadSpec[] = [
  { at: [-6, 7.5, 4.5], color: '#FF2D95' },
  { at: [6, 7.5, 4.5], color: '#00E5FF' },
  { at: [-2.4, 7.5, 7], color: '#FFD60A' },
  { at: [2.4, 7.5, 7], color: '#7B5CFF' },
  { at: [-9, 7.5, 2], color: '#00E5FF' },
  { at: [9, 7.5, 2], color: '#FF2D95' },
];
/** What the beams sweep: the stage and the floor around it. */
export const DANCE_FLOOR: HeadFloor = { cx: 0, cz: 1.5, halfX: 6, halfZ: 4 };
/** The podium (the dancer's stage) is 3 m × 1.4 scale across and 0.7 m high: a beam that lands on it lands on its top. */
const PODIUM_R = 2.1, PODIUM_TOP = 0.72;
export const danceFloorY = (x: number, z: number): number => (Math.hypot(x, z) < PODIUM_R ? PODIUM_TOP : 0.03);

/** Where the LED wall hangs: over the crowd stand, in front of the back wall (z 14.6), facing the stage camera. */
export const DANCE_WALL = { at: [0, 4.35, 13.9] as [number, number, number], width: 15, height: 3.3 };
/** The club floor: three rows between the stage and the stand (z 11), clear of the eight real bodies' ring. */
export const DANCE_CROWD_AREA = { x0: -9.5, x1: 9.5, z0: 6.6, z1: 9.4, rows: 3 };
/** The jets stand at the stage's front corners; the confetti bursts over the front of the stage. */
export const JET_AT: readonly [number, number, number][] = [[-3.6, 0.1, -1.4], [3.6, 0.1, -1.4]];
export const CONFETTI_AT: [number, number, number] = [0, 3.4, -0.6];

export type DanceMilestone = 'streak' | 'join' | 'gradeS';

/** TUNED (new): a milestone fires jets and confetti only this far apart (song-independent wall seconds) — a streak chain and an
 *  S grade in one second must not stack three bursts. */
export const MILESTONE_GAP_SEC = 1.2;
/** Pure: may a milestone fire now? */
export function milestoneDue(lastAt: number, now: number, gap = MILESTONE_GAP_SEC): boolean {
  return lastAt < 0 || now - lastAt >= gap;
}

/** The idle phase a menu runs on (the pick and results screens have no song): a slow club tempo on the wall clock. */
export const IDLE_BPM = 104;
export function idlePhase(seconds: number, bpm = IDLE_BPM): HeadPhase {
  return beatPhaseAt(seconds, bpm);   // the beat bus's own grid, so a menu and a song agree on what a beat is
}

export interface DanceStageOptions {
  scene: Scene;
  lights: LightRigHandle;
  /** The venue's banner nodes (venue.beatProps.banners): the LED wall replaces them, so they are switched off. */
  banners: readonly TransformNode[];
  track: string;
  player?: string;
  /** Reduced flashing (!motionPolicy().flash) and reduced motion (motionPolicy().reduced). */
  calmLights: boolean;
  calmMotion: boolean;
}

export interface DanceStageHandle {
  /** One frame on a live song: the beat bus's phase, its cheer pulse and the combo. */
  update(p: HeadPhase, cheer: number, combo: number): void;
  /** One frame off the song (the pick and results screens): the stage idles on the wall clock. */
  idle(dt: number): void;
  setTrack(name: string): void;
  /** Jets and confetti. Returns whether it fired (rate-limited; not at all under reduced motion). */
  milestone(kind: DanceMilestone): boolean;
  readonly wall: LedWallHandle;
  readonly heads: HeadHandle;
  readonly crowd: ClubCrowdHandle;
  readonly floor: StageFloorHandle;
  dispose(): void;
}

export function mountDanceStage(o: DanceStageOptions): DanceStageHandle {
  const tier = o.lights.tier;
  // the banner is the stand-in this replaces; its mesh stays in the scene (the beat bus's pulsables hold its material)
  for (const b of o.banners) b.setEnabled(false);
  const wall = mountLedWall(o.scene, { ...DANCE_WALL, small: tier === 'mobile', track: o.track, player: o.player });
  const heads = mountMovingHeads(o.scene, {
    name: 'dance_head', specs: DANCE_HEADS, floor: DANCE_FLOOR, count: headCountFor(tier), floorRadius: 1.2, pools: tier !== 'mobile', soft: tier !== 'mobile', floorY: danceFloorY,
  });
  const floor = mountStageFloor(o.scene, { radius: PODIUM_R - 0.08, y: PODIUM_TOP - 0.015, small: tier === 'mobile' });
  const crowd = mountClubCrowd(o.scene, { area: DANCE_CROWD_AREA, count: crowdCountFor(tier), rims: ['#e8409e', '#34c4e6'] });
  keepOutOfShadows(o.lights.shadows, [wall.mesh, floor.mesh, ...heads.root.getChildMeshes(), ...crowd.meshes]);
  let idleT = 0;
  let lastMilestone = -1;
  let clockT = 0;
  const frame = (p: HeadPhase, cheer: number, combo: number): void => {
    wall.update({ beatIndex: p.beatIndex, beatPhase: p.beatPhase, barIndex: p.barIndex, cheer, calm: o.calmLights });
    heads.update(p, Math.min(1, combo / 24), cheer, o.calmLights);
    crowd.update(p.beatPhase, cheer, o.calmMotion);
    floor.update({ beatIndex: p.beatIndex, beatPhase: p.beatPhase, barIndex: p.barIndex, calm: o.calmLights });
  };
  frame(idlePhase(0), 0, 0);   // the first frame is already dressed
  return {
    update(p, cheer, combo) { frame(p, cheer, combo); },
    idle(dt) {
      idleT += dt;
      // the menu's club breathes at a slow tempo; the name card holds (bar −1 is the card in the wall's own sequence)
      const p = idlePhase(idleT);
      frame({ ...p, barIndex: -1 }, 0, 0);
    },
    setTrack(name) { wall.setTrack(name); },
    milestone(kind) {
      clockT = performance.now() / 1000;
      if (o.calmMotion || !milestoneDue(lastMilestone, clockT)) return false;
      lastMilestone = clockT;
      const k = kind === 'gradeS' ? 1.6 : kind === 'streak' ? 1.2 : 0.9;
      for (const j of JET_AT) EffectsKit.burst(o.scene, new Vector3(j[0], j[1], j[2]), 'dust', k, '#e4f3ff');   // CO2: a white-blue gust off the deck
      EffectsKit.burst(o.scene, new Vector3(CONFETTI_AT[0], CONFETTI_AT[1], CONFETTI_AT[2]), 'confetti', k);
      return true;
    },
    wall, heads, crowd, floor,
    dispose() { wall.dispose(); heads.dispose(); crowd.dispose(); floor.dispose(); },
  };
}
