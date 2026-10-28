// PROPOSED-jump — the jump tool's register (JUMP-PRO, 2026-10-24): when a trial is less than lab-grade, when a jump
// is verified, and when a change is real.
//
// PROPOSED — pending Elijah. NOT FINAL. Every entry is TUNE and unsigned until the PJF pilot (force-plate) data; the
// sources say where each starting value came from. Its own file, like lib/screen/PROPOSED-trust.ts, so
// lib/screen/PROPOSED-thresholds.ts (and its pinned THRESHOLDS_VERSION) is untouched; a reused screen gate is READ
// from there (th()), never copied.
//
// Pure data.
import { th } from '@/lib/screen/PROPOSED-thresholds';

export const JUMP_REGISTER_VERSION = 'jump-0.1-proposed';

export type JumpSource =
  | 'bench-2026-10-24'          // measured on lib/jump/bench.ts (synthetic ground truth; see docs/JUMP-PRO.md)
  | 'benchmark-2026-10-24'      // the competitor/literature benchmark (scratchpad round7 competitors.md, cited there)
  | 'reuses-screen-gate'        // a screen gate, read from PROPOSED-thresholds
  | 'lane-guess';               // a starting guess, labelled as one

export interface JumpEntry { value: number; tune: true; signedOff: false; source: JumpSource; label: string }
const e = (value: number, source: JumpSource, label: string): JumpEntry => ({ value, tune: true, signedOff: false, source, label });

export const JUMP = {
  'jump.landedLowCm': e(5, 'benchmark-2026-10-24',
    'Landed this much lower (cm, hips at touch-down vs take-off) AND beyond 2 SD of its own read: a flexed or flat-foot landing. The height is corrected; the trial is not verified and gets the landing tip. ≈ the benchmark\'s "~15° more knee flexion than at take-off" (an assumption there too)'),
  'jump.unclearSdCm': e(3, 'bench-2026-10-24',
    'A trial whose own ±1 SD is wider than this (cm) was read through blur or occlusion: kept, never verified, and the tip asks for light and the whole body in the shot. Bench: realistic noise 0.5–1.5 cm; motion blur 2–4 cm'),
  'jump.verifiedSdCm': e(1.75, 'bench-2026-10-24', 'A verified live jump\'s own ±1 SD is at most this (cm). Bench, clean landings at 60 fps: the claimed SD runs 1.2–1.7 cm (true SD 1.5, 95 % within ±3 cm, the benchmark\'s LoA target); at 30 fps it is wider and the frame-rate rule blocks it anyway'),
  'jump.verifiedFps': e(th('gate.jumpFps') as number, 'reuses-screen-gate', 'A verified live jump was timed at this pose rate or more (the screen\'s jump gate)'),
  'jump.labFps': e(120, 'benchmark-2026-10-24', 'At or over this frame rate the read is lab-grade, not an "estimate" (benchmark target 3: live under 120 fps is flagged as an estimate)'),
  'jump.outlierPct': e(15, 'lane-guess', 'With 3+ jumps, one this far (%) above the others\' median is an outlier: shown, never the verified best'),
  'jump.bioCvPct': e(3, 'benchmark-2026-10-24', 'The body\'s own jump-to-jump CV (%) a session\'s typical error never goes under (published CMJ test–retest ≈ 2.5–5 %)'),
  'jump.realChangeZ': e(1.645, 'lane-guess', 'z of the smallest real change between two sessions (1.645 = 90 % sure the change is not noise)'),
  // JUMP-PRO 2 (2026-10-25): the touch height
  'jump.fingertipOverLeg': e(0.11, 'lane-guess',
    'The fingertip beyond MediaPipe\'s "index" point (the knuckle), as a share of the leg (hip → knee → ankle): the middle finger is ≈ 0.05 of stature and the leg ≈ 0.49 (Drillis–Contini segment table), so ≈ 0.10–0.11. Added to every standing reach. Unbenched (the bench body has no fingers): a real capture or a tape measure should replace it'),
  'jump.legRulerSdPct': e(0.8, 'bench-2026-10-24',
    'The leg in metres from an approach jump\'s own free fall: its ±1 SD (%), the scale of the reach in the touch height. Bench, side-on at 4.5 m: 0.6–0.7 % at 30–60 fps, 0.2–0.45 % at 240; a run angled 12° toward or away from the lens 0.75–1.6 % (lib/jump/reachBench.ts)'),
  // JUMP-TESTS (2026-10-25): the standard test set's validity rules (lib/jump/protocols.ts). All new, all TUNE.
  'jump.sjHoldMs': e(1000, 'lane-guess',
    'A squat jump starts from a held squat: the centre of mass still (within jump.sjStillCm) for at least this long (ms) before the drive. Protocols ask for 2–3 s; 1 s is the least a video can show'),
  'jump.sjStillCm': e(3, 'lane-guess',
    'Still, for the squat hold: the centre of mass moves less than this (cm, top to bottom) over the hold. The hold is the LATEST still window, so it ends where the drive starts and its range reaches this line by construction; the protocol bench reads every honest squat jump (and refuses every dip of 7–8 cm) at 30–240 fps'),
  'jump.sjDipCm': e(3, 'lane-guess',
    'A squat jump whose centre of mass drops more than this (cm) below its held squat before the take-off had a countermovement: refused ("you dipped before you jumped"). A real countermovement is 5–15 cm'),
  'jump.sjMinDepthCm': e(12, 'lane-guess',
    'A squat jump starts from a squat: the held hips at least this far (cm) under the standing hips. A 90° knee squat drops the hips ≈ 20–30 cm'),
  'jump.hipsWristShare': e(0.35, 'lane-guess',
    'Hands on hips, from the pose: each wrist within this share of the torso (shoulders\' midpoint → hips\' midpoint) of its own hip …'),
  'jump.hipsElbowDeg': e(140, 'lane-guess',
    '… and each elbow bent to at most this angle (deg, shoulder–elbow–wrist in the picture): hands on hips bend the elbows out; arms hanging at the sides are straight (≈ 170°)'),
  'jump.hipsOffPct': e(25, 'lane-guess',
    'A hands-on-hips jump is refused when more than this share (%) of its frames, from the dip to the landing, show a hand off its hip'),
  'jump.slFreeFootShare': e(0.04, 'lane-guess',
    'Single-leg jumps: the free foot stays at least this share of the body\'s height, nose to floor (≈ 6 cm) over the stance foot\'s floor from before the take-off to after the landing'),
  'jump.slFreeFootPct': e(90, 'lane-guess', '… on at least this share (%) of the frames where the feet are seen (one jittered frame is not a touch-down)'),
  'jump.rjMaxContactMs': e(250, 'benchmark-2026-10-24',
    '10-5 repeated jumps: a rebound counted toward the best five is on the floor no longer than this (ms). The 10/5 test asks for the shortest contact; longer contacts are a slow, not reactive, rebound'),
  // JUMP-TESTS, velocity and power (owner scope addition 2026-10-25; lib/jump/velocity.ts). New, TUNE.
  'jump.onsetCm': e(1.5, 'lane-guess',
    'The countermovement starts when the centre of mass first sits this far (cm) under the standing level before the dip: the start of "time to take-off" in RSI-mod. A force plate starts it at body weight − 5 SD, a little earlier'),
  'jump.pushOffRangeCm': e(10, 'lane-guess',
    'A push-off distance (the hips\' rise from the bottom of the dip to the take-off) under this (cm), or over 7× it, is not a jump\'s push-off: no push-off, no Samozino force or power'),
} as const satisfies Record<string, JumpEntry>;

export type JumpId = keyof typeof JUMP;
export const JUMP_IDS = Object.keys(JUMP) as JumpId[];
/** A register value, by id. */
export const jr = (id: JumpId): number => JUMP[id].value;
