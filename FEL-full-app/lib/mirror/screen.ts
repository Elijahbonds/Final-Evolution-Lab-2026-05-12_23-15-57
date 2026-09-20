// screen — the Mirror runs the athlete through a movement screen, scores it, and says what to do about it.
//
// THE SOURCE IS THE OWNER'S OWN BOOKS, not invented protocol: the Neuro-Mechanic Playbook's "5-Minute Movement Check"
// (Ch. 3) for the modified screen, and the Neuro-Mechanic Blueprint's Station 1–2 audit for the full one. The
// structure here follows them station for station, including the parts that make them work:
//
//   · DEFAULT POSTURE IS THE MEASUREMENT. The books' first instruction is not to tell the athlete to stand up
//     straight — the moment you cue "shoulders back", you are grading a performance instead of a default. So the
//     Mirror never cues posture during a station. It cues WHERE TO STAND and WHICH WAY TO FACE, and nothing else.
//   · ASYMMETRY BEATS SEVERITY. One side clearly off and one side fine is a bigger problem than both sides mildly
//     off; the scoring weights a one-sided finding above a bilateral one rather than averaging them away.
//   · ASSESS → CORRECT → LOAD → PERFORM. The screen is the Assess step and it hands off to the other three, which is
//     what makes the result a plan rather than a verdict.
//
// WHAT A CAMERA CANNOT DO, said out loud rather than faked. The Blueprint's full audit includes palpation — ASIS/PSIS
// tilt by hand, transverse rotation from above — and a phone cannot palpate. Its rib-angle check needs the
// infrasternal margins, which the pose model does not give. Those checks are carried here as SELF-REPORT or COACH
// stations, marked as such, and they never pretend to be measured. A screen that silently drops half its own protocol
// is worth less than one that tells you which half it ran.

export type ScreenId = 'modified' | 'full';
export type StationView = 'front' | 'side' | 'back';
/** How a finding arrives: the camera measured it, the athlete answered, or a coach in the room did. */
export type CheckSource = 'camera' | 'selfReport' | 'coach';
/** The books grade the wobble test in three words. Everything scored here uses the same three. */
export type Grade = 'stable' | 'borderline' | 'fail';

export interface ScreenCheck {
  id: string;
  /** What the athlete or coach is looking at, in the book's own language. */
  label: string;
  source: CheckSource;
  /** True when a one-sided result is the finding — these are weighted above bilateral ones. */
  sided: boolean;
  /** The red flag, stated as the book states it. */
  redFlag: string;
}

export interface ScreenStation {
  id: string;
  view: StationView;
  /** What the Mirror says to get them into position. Never a posture cue. */
  cue: string;
  /** Roughly how long the athlete stands there. */
  holdSec: number;
  checks: ScreenCheck[];
}

/** The turn cue, so the athlete is told which way to face rather than left to guess. */
export const TURN_CUE: Record<StationView, string> = {
  front: 'Face the camera.',
  side: 'Turn side-on — left shoulder to the camera.',
  back: 'Turn all the way around, back to the camera.',
};

const HEEL: ScreenCheck = {
  id: 'heelLine', label: 'Heel line and Achilles', source: 'camera', sided: true,
  redFlag: 'One heel rolls inward while the other stays vertical.',
};
const KNEE: ScreenCheck = {
  id: 'kneeWindow', label: 'Knee window', source: 'camera', sided: true,
  redFlag: 'Kneecaps point inward, especially on the jumping leg.',
};
const HIPS: ScreenCheck = {
  id: 'hipLevel', label: 'Hip points level', source: 'camera', sided: true,
  redFlag: 'One hip point sits noticeably higher than the other.',
};
const RIBS: ScreenCheck = {
  id: 'ribAngle', label: 'Rib angle and breath', source: 'selfReport', sided: false,
  redFlag: 'A wide flared rib V with neck-muscle breathing instead of the lower ribs widening.',
};
const HEAD: ScreenCheck = {
  id: 'headFloat', label: 'Head float', source: 'camera', sided: false,
  redFlag: 'The ear sits clearly forward of the shoulder.',
};
const WOBBLE: ScreenCheck = {
  id: 'singleLeg', label: 'Single-leg stance, 30 seconds a side', source: 'camera', sided: true,
  redFlag: 'Cannot hold thirty seconds without the pelvis dropping or the knee caving.',
};
const PELVIC_TILT: ScreenCheck = {
  id: 'pelvicTilt', label: 'Pelvic tilt (hands on the hip points)', source: 'coach', sided: false,
  redFlag: 'The front of the pelvis sits well below the back of it, or well above.',
};
const THORACIC: ScreenCheck = {
  id: 'thoracicRotation', label: 'Seated rotation, each side', source: 'coach', sided: true,
  redFlag: 'Clearly less rotation to one side than the other.',
};
const SHOULDER_LEVEL: ScreenCheck = {
  id: 'shoulderLevel', label: 'Shoulder height', source: 'camera', sided: true,
  redFlag: 'One shoulder rides higher than the other in a default stance.',
};

/**
 * THE MODIFIED SCREEN — the Playbook's five checks plus the wobble test, in its own order: heels from behind, then
 * knees and hips from the front, then the head from the side, then thirty seconds a leg. Five minutes, no hands.
 */
export const MODIFIED_SCREEN: ScreenStation[] = [
  { id: 'heels', view: 'back', cue: 'Turn all the way around, back to the camera. Feet about hip-width. Look straight ahead.', holdSec: 12, checks: [HEEL] },
  { id: 'frontStack', view: 'front', cue: 'Turn and face the camera. Same stance — do not fix anything.', holdSec: 14, checks: [KNEE, HIPS, SHOULDER_LEVEL] },
  { id: 'breath', view: 'front', cue: 'Stay facing me. Take one easy breath in and out.', holdSec: 8, checks: [RIBS] },
  { id: 'profile', view: 'side', cue: 'Turn side-on — left shoulder to the camera. Look straight ahead.', holdSec: 10, checks: [HEAD] },
  { id: 'wobbleL', view: 'front', cue: 'Face me. Stand on your LEFT leg, other knee up to hip height, arms by your sides.', holdSec: 30, checks: [WOBBLE] },
  { id: 'wobbleR', view: 'front', cue: 'Now the RIGHT leg. Same thing — thirty seconds.', holdSec: 30, checks: [WOBBLE] },
];

/**
 * THE FULL SCREEN — the Blueprint's audit, with the hands-on stations carried as coach checks because a phone cannot
 * palpate. Longer, and it says which parts it measured and which parts somebody had to answer.
 */
export const FULL_SCREEN: ScreenStation[] = [
  ...MODIFIED_SCREEN.slice(0, 4),
  { id: 'pelvis', view: 'side', cue: 'Stay side-on. If a coach is with you, they can check the pelvis now.', holdSec: 12, checks: [PELVIC_TILT] },
  { id: 'rotation', view: 'front', cue: 'Sit tall and rotate to each side as far as is comfortable.', holdSec: 20, checks: [THORACIC] },
  ...MODIFIED_SCREEN.slice(4),
];

export function screenFor(id: ScreenId): ScreenStation[] {
  return id === 'full' ? FULL_SCREEN : MODIFIED_SCREEN;
}

// ── SCORING ─────────────────────────────────────────────────────────────────

export interface CheckResult {
  checkId: string;
  grade: Grade;
  /** Set when the finding is one-sided — the books' headline finding. */
  side?: 'left' | 'right';
  /** What was measured or answered, for the report. */
  detail?: string;
  source: CheckSource;
}

export interface ScreenResultSummary {
  screen: ScreenId;
  /** The book's own count: how many checks came back as red flags. */
  redFlags: number;
  /** Red flags that are ONE-SIDED. The books rank these above bilateral findings. */
  asymmetries: number;
  /** 0–100, for the app's own grade bands. A screen is scored down hardest by one-sided fails. */
  score: number;
  triage: 'proceed' | 'addressFirst' | 'seeSpecialist';
  headline: string;
  /** What it means, in movement language. */
  meaning: string[];
  /** What to do now — the Correct step. */
  suggestions: string[];
  /** What to do with training while that happens — the Load step. */
  programming: string[];
  /** Checks a camera could not take, named rather than hidden. */
  notMeasured: string[];
  ranAll: boolean;
}

/** The books' triage, unchanged: none, a couple, or three and up. */
export function triageFor(redFlags: number): ScreenResultSummary['triage'] {
  if (redFlags >= 3) return 'seeSpecialist';
  if (redFlags >= 1) return 'addressFirst';
  return 'proceed';
}

const MEANING: Record<string, string> = {
  heelLine: 'The foot is not giving the leg a level platform, so everything above it starts crooked.',
  kneeWindow: 'The knee is being asked to control rotation it should not have to, which is where landing forces go wrong.',
  hipLevel: 'The pelvis is starting every jump and cut from a tilt, so one side works harder than the other.',
  shoulderLevel: 'The rib cage is sitting rotated or shifted under the shoulders rather than square.',
  ribAngle: 'The cylinder is leaking pressure — breathing is happening at the neck instead of the lower ribs.',
  headFloat: 'The head is riding forward of the shoulders, so the neck is holding a brace all day.',
  singleLeg: 'The hip cannot hold the pelvis level on one leg, which is the position every stride and landing is.',
  pelvicTilt: 'The pelvis is parked at one end of its range rather than sitting in the middle of it.',
  thoracicRotation: 'Rotation is not shared evenly between the two sides.',
};

const FIX: Record<string, string> = {
  heelLine: 'Foot tripod work before anything loaded — short-foot holds, then slow calf raises with the heel tracking straight.',
  kneeWindow: 'Hip external-rotation and glute-medius work, and slow tempo squats watching the knee track over the second toe.',
  hipLevel: 'Single-leg hip work on the low side, and stop loading the tilt with heavy bilateral lifts for now.',
  shoulderLevel: 'Breathing work first, then rotation drills to the restricted side.',
  ribAngle: 'Exhale-biased breathing — long exhales, ribs down — before any heavy axial loading.',
  headFloat: 'Chin nods and thoracic extension over a roller, and raise the screen you are looking at all day.',
  singleLeg: 'Thirty-second stance holds daily, then step-downs, before plyometrics go back in.',
  pelvicTilt: 'Position work at both ends of the pelvis range so it can sit in the middle.',
  thoracicRotation: 'Rotation work to the restricted side, held, not bounced.',
};

/**
 * Score a screen the way the books read one: count the red flags, weight the one-sided ones, and turn the count into
 * a decision rather than a number. The triage bands, the language and the ordering are the Playbook's.
 */
export function scoreScreen(screen: ScreenId, results: readonly CheckResult[]): ScreenResultSummary {
  const stations = screenFor(screen);
  const expected = new Set(stations.flatMap((s) => s.checks.map((c) => c.id)));
  const byId = new Map(stations.flatMap((s) => s.checks).map((c) => [c.id, c]));

  const fails = results.filter((r) => r.grade === 'fail');
  const borderline = results.filter((r) => r.grade === 'borderline');
  const redFlags = fails.length;
  const asymmetries = fails.filter((r) => !!r.side).length;

  // 0–100: every fail costs, a one-sided fail costs more (the books' rule), borderline costs a little
  const penalty = fails.reduce((a, r) => a + (r.side ? 22 : 15), 0) + borderline.length * 6;
  const score = Math.max(0, Math.min(100, 100 - penalty));

  const notMeasured = [...expected].filter((id) => {
    const c = byId.get(id);
    return c && c.source !== 'camera' && !results.some((r) => r.checkId === id);
  }).map((id) => byId.get(id)!.label);
  const ranAll = results.length >= expected.size;

  const flagged = [...fails, ...borderline];
  const meaning = flagged.map((r) => MEANING[r.checkId]).filter(Boolean);
  const suggestions = fails.map((r) => FIX[r.checkId]).filter(Boolean);

  const triage = triageFor(redFlags);
  const programming = triage === 'seeSpecialist'
    ? ['Keep practising skills at controlled intensity.',
       'Hold off on heavy load and high-volume jumping until this is looked at in person.',
       'This is not medical clearance — pain, swelling, numbness or a pop belongs with a physician.']
    : triage === 'addressFirst'
      ? ['Keep training.', 'Do the corrective work above before you add intensity, not instead of training.',
         'Re-run this screen in two weeks and compare the sides.']
      : ['Train normally.', 'Re-run this screen monthly, or after an ankle sprain, a growth spurt, or a jump in workload.'];

  const worstSided = fails.find((r) => r.side);
  const headline = redFlags === 0
    ? 'Nothing flagged. That is a platform you can load.'
    : worstSided
      ? `${byId.get(worstSided.checkId)?.label ?? 'A check'} failed on the ${worstSided.side} side. One side off and one side fine matters more than both being mildly off.`
      : `${redFlags} flag${redFlags > 1 ? 's' : ''} worth clearing before you add intensity.`;

  return { screen, redFlags, asymmetries, score, triage, headline, meaning, suggestions, programming, notMeasured, ranAll };
}

/** The line that rides every screen result. It is not medical clearance and the books say so first. */
export const SCREEN_DISCLAIMER =
  'A movement screen from a single camera, scored on what was visible. It is not medical clearance. Chest pain, acute '
  + 'swelling, numbness, or anything that sounded like a pop belongs with a physician, not an app.';
