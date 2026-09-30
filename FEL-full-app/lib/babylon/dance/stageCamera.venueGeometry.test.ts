// stageCamera.venueGeometry.test.ts — MUSIC-SUITE P8 FIX (2026-09-29). Node environment: pure math against
// venueSpecs.ts's plain data object, no Babylon/DOM needed.
//
// THE GAP THIS CLOSES: stageCamera.test.ts's own contract ("sits ON THE AUDIENCE SIDE of the dancer, not behind — an
// over-shoulder camera would sit on the OPPOSITE side") was checked only against an ABSTRACT audience point
// ({x:0, z:-6}), never against the REAL prop coordinates the dance venue actually places
// (lib/babylon/nexus/venueSpecs.ts's VENUE_SPECS.dance.props). A camera that passes every check in that file could
// still — and, before this fix, DID — stand exactly where decision #8 asked it to and look permanently AWAY from the
// wall/banner/lamps beatBus.ts's pulse was built to make visible, because those props were authored for the OLD
// over-the-shoulder camera (opposite side, opposite view direction) and never moved when this pass added the new
// front-audience one. See venueSpecs.ts's own MUSIC-SUITE P8 FIX comment on VENUE_SPECS.dance.props for the fix.
//
// This test drives stageCameraFrame with the SAME AUDIENCE/dancer points DanceMode.ts actually uses, across the
// camera's full range of states (still/neutral/mid-beat/max-streak/freeze), and checks that every prop the beat bus
// pulses (lamp/banner/wall — collectPulsables/pulseStage) sits in front of the camera, not behind it. A point behind
// the camera (negative dot product against the view direction) can never be in frame at any FOV — this is a strictly
// necessary condition for visibility, not merely a proxy for it, so a real regression here is a real bug, not a
// false alarm from an imprecise heuristic.
import { describe, it, expect } from 'vitest';
import { stageCameraFrame, DEFAULT_STAGE_CAMERA, type StageCameraInput } from './stageCamera';
import { VENUE_SPECS } from '../nexus/venueSpecs';

/** DanceMode.ts's own AUDIENCE constant (x, z only — this camera never reads Y). */
const AUDIENCE = { x: 0, z: -6 };
/** The dancer spawns at the podium's own position (venueSpecs.ts's dance spec, actors[0] / props[0]). */
const DANCER = { x: 0, z: 0 };

/** Is `point` in front of a camera standing at `camPos` and looking at `lookAt` (flat, Y ignored)? */
function inFrontOf(
  camPos: { x: number; z: number },
  lookAt: { x: number; z: number },
  point: { x: number; z: number },
): boolean {
  const viewX = lookAt.x - camPos.x;
  const viewZ = lookAt.z - camPos.z;
  const toPointX = point.x - camPos.x;
  const toPointZ = point.z - camPos.z;
  return viewX * toPointX + viewZ * toPointZ > 0;
}

/** The camera's ground position for one input state — the same math DanceMode.ts's applyStageCamera runs, minus the
 *  Babylon Vector3/CameraDirector plumbing this file does not need. stageCameraFrame always aims back at the
 *  dancer's own root (CameraDirector.setFixed's `targetHeight` convention: an offset ABOVE the subject, never to the
 *  side), so `lookAt` is just the dancer's flat position in every state. */
function cameraFor(over: Partial<StageCameraInput>): { camPos: { x: number; z: number }; lookAt: { x: number; z: number } } {
  const input: StageCameraInput = {
    dancer: DANCER, audience: AUDIENCE, aspect: 1.6, fovRad: 0.8,
    beatPhase: 0, freeze: false, streak: 0, stillCamera: false,
    ...over,
  };
  const frame = stageCameraFrame(input, DEFAULT_STAGE_CAMERA);
  return {
    camPos: { x: DANCER.x + frame.groundOffset.x, z: DANCER.z + frame.groundOffset.z },
    lookAt: { x: DANCER.x, z: DANCER.z },
  };
}

const dance = VENUE_SPECS.dance;
if (!dance) throw new Error('VENUE_SPECS.dance is missing — this test has nothing real to check the camera against');

// Every prop kind the beat bus actually pulses (DanceMode.ts's collectPulsables reads v.beatProps.lamps/banners/
// podium — NexusVenue.ts's beatProps match by name prefix off these same kinds). The podium sits AT the dancer's own
// root by construction (props[0], position [0,0,0]) so it is always "in front" trivially; this test is about the
// scenery placed AWAY from the dancer, which is the part a camera CAN fail to reach.
const awayProps = dance.props.filter((p) => p.kind === 'lamp' || p.kind === 'banner' || p.kind === 'wall');

// A spread of every state DanceMode.ts's applyStageCamera can actually hand the camera: the comfort "still camera"
// setting, the neutral shot, mid-beat sway/push at four phases, the widest streak shot (at rest and mid-sway), and a
// freeze's low angle.
const STATES: Array<{ label: string; input: Partial<StageCameraInput> }> = [
  { label: 'still camera (comfort setting)', input: { stillCamera: true } },
  { label: 'neutral, beat 0', input: { beatPhase: 0, streak: 0 } },
  { label: 'mid-beat sway, beat 0.25', input: { beatPhase: 0.25, streak: 0 } },
  { label: 'on-beat push, beat 0.5', input: { beatPhase: 0.5, streak: 0 } },
  { label: 'mid-beat sway, beat 0.75', input: { beatPhase: 0.75, streak: 0 } },
  { label: 'max streak widen, beat 0', input: { beatPhase: 0, streak: DEFAULT_STAGE_CAMERA.streakCap } },
  { label: 'max streak widen, beat 0.5', input: { beatPhase: 0.5, streak: DEFAULT_STAGE_CAMERA.streakCap } },
  { label: 'freeze (low angle)', input: { beatPhase: 0, streak: 0, freeze: true } },
];

describe('stage camera vs. the REAL dance venue geometry (venueSpecs.ts)', () => {
  it('the dance venue actually declares the props this test is meant to guard (a false-positive-proof check)', () => {
    // 1 wall + 1 banner + 4 lamps, at minimum — if this ever reads 0, the filter above stopped matching
    // venueSpecs.ts's real prop kinds and every test below would be vacuously green.
    expect(awayProps.length).toBeGreaterThanOrEqual(6);
  });

  for (const { label, input } of STATES) {
    it(`every lamp/banner/wall prop is in front of the camera — ${label}`, () => {
      const { camPos, lookAt } = cameraFor(input);
      for (const prop of awayProps) {
        const point = { x: prop.position[0], z: prop.position[2] };
        const ok = inFrontOf(camPos, lookAt, point);
        expect(ok, `${prop.kind} at [${prop.position.join(', ')}] is BEHIND the camera in state "${label}" `
          + `(camera at [${camPos.x.toFixed(2)}, ${camPos.z.toFixed(2)}] looking at [${lookAt.x}, ${lookAt.z}])`).toBe(true);
      }
    });
  }
});
