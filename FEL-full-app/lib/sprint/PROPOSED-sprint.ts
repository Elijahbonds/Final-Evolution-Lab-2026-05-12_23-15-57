// PROPOSED-sprint — the camera sprint timer's register (SPRINT-SPEED, 2026-10-25): every number the timer, the speed
// trace and the 5-10-5 read decide with, where it came from, and that none of it is signed off.
//
// PROPOSED — pending Elijah. NOT FINAL. Every entry is TUNE and unsigned until the validation pilot against timing gates
// (the owner's rule for the jump, applied here: no accuracy claim until a pilot). Its own file, like
// lib/jump/PROPOSED-jump.ts. Not feel-panel knobs: none of these is a gameplay feel number, and none is read in play.
//
// Pure data.

export const SPRINT_REGISTER_VERSION = 'sprint-0.1-proposed';

export type SprintSource =
  | 'bench-2026-10-25'      // measured on the synthetic runs in tests/sprint-speed (tests/helpers/sprintSynth.ts)
  | 'benchmark-2026-10-25'  // docs/SPRINT-BENCHMARK.md (cited there)
  | 'literature'            // a published constant, named in the label
  | 'lane-guess';           // a starting guess, labelled as one

export interface SprintEntry { value: number; tune: true; signedOff: false; source: SprintSource; label: string }
const e = (value: number, source: SprintSource, label: string): SprintEntry => ({ value, tune: true, signedOff: false, source, label });

export const SPRINT = {
  // ── the line ──
  'sprint.minVisibility': e(0.5, 'lane-guess', 'A body point is used only when every landmark it is built from is at least this visible (MediaPipe v, 0..1)'),
  'sprint.fitHalf': e(2, 'bench-2026-10-25', 'Frames each side of a crossing in its local straight-line fit (sub-frame time), at least. 2 each side: at 30 fps a sprinter is in a 4 m view for ≈ 13 frames'),
  'sprint.fitMs': e(60, 'bench-2026-10-25', 'And at least this long each side (ms): at 240 fps the fit takes ≈ 15 frames each side, averaging their jitter. Over ±60 ms a sprinter\'s speed changes well under 1 %, so the line is still straight'),
  'sprint.smoothMs': e(25, 'bench-2026-10-25', 'Where the crossing is looked for: the distance averaged over ±this (ms) first, so at a high frame rate a point jittering by more than it moves per frame is not read as many crossings'),
  'sprint.holdFrames': e(2, 'bench-2026-10-25', 'A crossing counts only when the point was on the start side for this many frames before and on the far side for this many after (a jittering point at the line is not two crossings)'),
  'sprint.holdMs': e(40, 'bench-2026-10-25', 'And for at least this long each side (ms), whatever the frame rate'),
  'sprint.pointSd': e(0.004, 'lane-guess', 'A body point\'s own jitter (σ, in picture heights) when a read has too few frames to measure it. MediaPipe lite\'s torso ≈ 0.002 of the width standing still (lib/pose/synth.ts DEFAULT_NOISE); doubled for motion blur at speed'),
  'sprint.minLineFrac': e(0.15, 'lane-guess', 'Two taps closer than this (picture heights) are not a line: tap the two ends of it'),
  // ── the start ──
  'sprint.goHoldMinS': e(1.5, 'lane-guess', '"Set" to "Go": the shortest random hold (s), so the Go cannot be anticipated'),
  'sprint.goHoldMaxS': e(2.5, 'lane-guess', '"Set" to "Go": the longest random hold (s)'),
  'sprint.audioLatencySdMs': e(10, 'lane-guess', 'The Go beep\'s output delay (σ, ms) when the browser does not report one (AudioContext.outputLatency)'),
  'sprint.startDistanceSdM': e(1, 'lane-guess', 'How far the athlete may stand from the distance typed (σ, m): the Go\'s sound travel time is corrected with the distance, and this is its share of the ±'),
  'sprint.onsetK': e(5, 'bench-2026-10-25', 'First movement: the body point has moved more than this many SDs of its own stillness'),
  'sprint.onsetMin': e(0.012, 'bench-2026-10-25', 'First movement: and at least this far (picture heights), whatever the stillness SD'),
  'sprint.onsetSustain': e(3, 'bench-2026-10-25', 'First movement: and stays moved for this many frames (a sway is not a start)'),
  'sprint.onsetFitMs': e(150, 'bench-2026-10-25', 'First movement: the frames from the threshold to this far past it (ms) are fitted as a body starting from rest, and the start is that fit\'s zero (the threshold frame itself is late by however long the body took to move that far)'),
  'sprint.stillFrames': e(10, 'lane-guess', 'First movement: the stillness it is measured against is at least this many frames'),
  // ── distance and scale ──
  'sprint.legOverStature': e(0.491, 'literature', 'Hip-to-ankle (thigh + shank) as a share of standing height, Drillis–Contini (the jump tool reads the same table: lib/jump/reach.ts)'),
  'sprint.tapSd': e(0.004, 'lane-guess', 'Where a tap lands vs where the marker is (σ, picture heights): a fingertip on a phone screen. Two taps a known distance apart scale the run to ± √2 × this ÷ their separation'),
  'sprint.legRatioSdPct': e(3, 'lane-guess', 'Person to person, the leg is 0.491 of standing height give or take this (σ, %): the share of the ± when the run is scaled from the athlete\'s height. Markers avoid it'),
  'sprint.laneOffsetM': e(0.3, 'lane-guess', 'How far off the marker line the athlete may run (m): with two lines in one frame it is a parallax error of half-span × offset ÷ camera distance, part of the ±'),
  // ── the speed trace and the profile ──
  'sprint.tauMin': e(0.4, 'literature', 'τ search range, low end (s). Samozino 2016 sprinters ≈ 0.9–1.4 s; team sport ≈ 0.9–1.6'),
  'sprint.tauMax': e(3, 'literature', 'τ search range, high end (s)'),
  'sprint.airRho': e(1.204, 'literature', 'Air density (kg/m³) at 20 °C, sea level (Samozino 2016 computes it from pressure and temperature)'),
  'sprint.airCd': e(0.9, 'literature', 'Drag coefficient of a sprinter (Samozino 2016, after van Ingen Schenau)'),
  // ── the 5-10-5 ──
  'agility.touchM': e(0.15, 'lane-guess', 'A turn counts as touching a line when the turning foot gets to within this far of it (m), or past it. The test asks for a hand on the line; the camera reads the foot'),
} as const satisfies Record<string, SprintEntry>;

export type SprintId = keyof typeof SPRINT;
export const SPRINT_IDS = Object.keys(SPRINT) as SprintId[];
/** A register value, by id. */
export const sr = (id: SprintId): number => SPRINT[id].value;

/** Physics, not tune: the speed of sound in air at 20 °C (m/s). */
export const SOUND_MPS = 343;
