// drills — the owner's drills as body charts (movement play, phase 9, 2026-09-24).
//
// The content is the owner's Playbook (lib/education/playbook.data.json, "The Neuro-Mechanic Playbook"): chapter 5's
// pre-game wake-up, chapter 6's jumping and landing drills, chapter 7's SAQ drills. The approach-rhythm drills are
// The Art of Dunking's push 1-2 (chapters 7–8, as lib/babylon/anim/authored/dunkTakeoff.ts paraphrases them), run in
// place. Every drill names its chapter and section, and says what changed to fit a living room with ~2 m of floor
// (owner's decision: jumping in place, approaches become steps or running in place).
//
// The DOSAGE is the book's wherever the book gives one (reps, sets, rests, minutes). Where it does not, the number is
// ours and its comment says so. Tempos and flight times are a named constant each, with where they come from.
import {
  type Drill, type DrillPhase, type DrillTarget, alternate, repeat, round3, stepInterval, mirrorPhase,
  FIRST_LEAD_IN_SEC, LEAD_IN_SEC,
} from './chart';

// ── tempos and body timings ──────────────────────────────────────────────────────────────────────────────────────────

/** Running in place, the approach's cadence: a CMU subject's run in place (fixture run_in_place, CMU 143_04) steps
 *  every 337 ms (median), 178 a minute, and the owner's own approach in place (dunk_approach_two_foot) every 353 ms,
 *  170; 180 is the round number beside them. */
export const APPROACH_SPM = 180;
/** A sprint's fast feet in place. Under 4 steps a second so each step still lifts past the 2.5 cm the body reader needs
 *  to call it a step (BodyReader STEP_LIFT_M) for its 100 ms (STEP_MIN_SWING_MS), with 8+ camera frames a step at 30 fps. */
export const SPRINT_SPM = 210;
/** A defensive shuffle step (s): ~2.5 steps a second, a slide's pace in a room. Ours. */
export const SHUFFLE_SEC = 0.4;
/**
 * Pogo contacts (s): 2 a second, ours (the book's sets are "about 20 contacts" and "15 seconds", no rate). Quick
 * contacts (~0.2 s) leave ~0.3 s of flight (~11 cm). That is right on the body reader's jump floor: its contact lines
 * (5 cm off, 3.5 cm on) see a 0.3 s flight for ~0.27 s against its 250 ms MIN_FLIGHT_MS, and of synthesized two-foot
 * pogos (three noise draws of ten) it took 20 of 30 at 0.3 s and none at 0.25 s. The frames' contacts read them
 * (fromReader FrameMoves: a flight of two frames off both feet): 30 of 30 at 0.3 s, 29 of 30 at 0.25 s.
 */
export const POGO_SEC = 0.5;
/** Wall drives (s): one explosive knee a second, up and back down with a beat to reset the lean. Ours. */
export const DRIVE_SEC = 1.0;
/** Flight of a low hop (s): 15 cm is √(8·0.15/9.81) = 0.35 s. */
export const HOP_FLIGHT_SEC = 0.35;
/** Flight of a warm-up countermovement jump (s): 30 cm is √(8·0.30/9.81) ≈ 0.5 s. */
export const CMJ_FLIGHT_SEC = 0.5;
/** The bottom of a countermovement to the take-off (s): the jump's propulsive push, about 0.3 s standing. */
export const DIP_TO_TAKEOFF_SEC = 0.3;
/** Flight of a short lateral bound (s): a 20 cm rise is ~0.4 s, enough for ~0.6 m sideways. */
export const BOUND_FLIGHT_SEC = 0.4;
/** The penultimate is "the longest step" (dunkTakeoff.ts, from the book): its stride takes 1.2× the run's. Ours. */
export const PENULT_STRETCH = 1.2;
/** "Penultimate long, last short" (lib/workout/plan-generator.ts): the plant comes after 0.7× a run stride. Ours. */
export const PLANT_QUICK = 0.7;
/**
 * One-foot plant to take-off (s): the owner's own one-foot take-off, fixture dunk_elijah_one_foot (the left plant down
 * at 1875 ms, off at 2028 ms: 153 ms). Shorter than off two, as the book has it: one-foot is "faster, shallower
 * flexion" (dunkTakeoff.ts), and a contact that balloons is its over-gathering fault. (The 355 ms of fixture
 * jump_one_foot_runup is a CMU subject's take-off over an obstacle, not an approach jump.)
 */
export const PLANT_CONTACT_ONE_SEC = 0.15;
/** Two-foot plant to take-off (s): fixture dunk_approach_two_foot (the second foot down at 1956 ms, off at 2173 ms). */
export const PLANT_CONTACT_TWO_SEC = 0.22;

// ── zones on the self-view (mirrored: the player's left is the view's left) ──────────────────────────────────────────

/** Low cones for the T-drill, about knee height at the play fill (ankles near y 0.9, hips near 0.6). */
const CONE_Y = 0.78;
const CONE_MID = { x: 0.5, y: CONE_Y };
/** ~0.8 m to the side at the play fill (a frame ~4.5 m wide at 640×480): two shuffle steps. */
const CONE_LEFT = { x: 0.28, y: CONE_Y };
const CONE_RIGHT = { x: 0.72, y: CONE_Y };

const PB = 'playbook' as const;

// ── chapter 5: the pre-game wake-up ──────────────────────────────────────────────────────────────────────────────────

const POGO_WARMUP_COUNT = 30;   // the trainer's note: "two sets of 15 seconds" at POGO_SEC

function wakeUpRound(r: number): DrillTarget[] {
  const dip = r + 3;
  const jump = round3(dip + DIP_TO_TAKEOFF_SEC);
  const hop = r + 8;
  return [
    { t: r, move: 'hold', limb: 'feet', holdSec: 2, label: 'ATHLETIC STANCE' },
    { t: dip, move: 'squat', label: 'DIP' },
    { t: jump, move: 'jump', limb: 'feet', label: 'JUMP' },
    { t: round3(jump + CMJ_FLIGHT_SEC), move: 'land', limb: 'feet', holdSec: 2, label: 'LAND + PAUSE' },
    { t: hop, move: 'jump', limb: 'feet', label: 'LOW HOP' },
    { t: round3(hop + HOP_FLIGHT_SEC), move: 'land', limb: 'footR', holdSec: 2, label: 'STOMP' },
  ];
}

export const WAKE_UP: Drill = {
  id: 'wake-up',
  name: 'Pre-Game Wake-Up',
  blurb: 'Ten minutes, six phases: release, pressurize, feet, joints, rhythm, launch.',
  source: { book: PB, chapter: 5, section: 'The 10-Minute Pre-Game Protocol' },
  checks: [],
  phases: [
    {
      id: 'release-the-locks', name: 'Release the Locks', durationSec: 120, presence: 'required',
      source: {
        book: PB, chapter: 5, section: 'Phase 1: Release the Locks (2 minutes)',
        adapted: 'No targets: a contract-relax is felt, not seen. The clock runs while you are in frame.',
      },
      cue: 'Hands on a wall. Contract, relax, sink a little further.',
      lines: [
        { t: 0, text: 'Left ankle: front foot flat, drive the knee over the toes.' },
        { t: 30, text: 'Right ankle.' },
        { t: 60, text: 'Left hip flexor: hips forward, ribs stacked over the pelvis.' },
        { t: 90, text: 'Right hip flexor.' },
      ],
      targets: [],
      prompts: [
        { t: 0, id: 'coach.drill.intro' }, { t: 4.5, id: 'coach.drill.go' },
        { t: 30, id: 'coach.drill.switch' }, { t: 60, id: 'coach.drill.go' }, { t: 90, id: 'coach.drill.switch' },
      ],
    },
    {
      id: 'pressurize', name: 'Pressurize the System', durationSec: 60, presence: 'required',
      source: { book: PB, chapter: 5, section: 'Phase 2: Pressurize the System (1 minute)' },
      cue: 'Stand tall, hands on the lower ribs. In for 4, hold 2, out for 6.',
      targets: [{ t: 6, move: 'hold', holdSec: 36, label: 'STAND TALL' }],
      // three IAP breaths, 4 in / 2 hold / 6 out: the book's own count (also the Mirror's pacer, mirror-harness.tsx)
      pacer: { from: 6, inSec: 4, holdSec: 2, outSec: 6, rounds: 3 },
      prompts: [
        { t: 0.5, id: 'coach.drill.go' },
        { t: 6, id: 'coach.drill.breathe' }, { t: 10, id: 'coach.drill.hold' },
        { t: 18, id: 'coach.drill.breathe' }, { t: 22, id: 'coach.drill.hold' },
        { t: 30, id: 'coach.drill.breathe' }, { t: 34, id: 'coach.drill.hold' },
      ],
    },
    {
      id: 'wake-the-tripod', name: 'Wake Up the Tripod', durationSec: 60, presence: 'required',
      source: { book: PB, chapter: 5, section: 'Phase 3: Wake Up the Tripod (1 minute)' },
      cue: 'One foot: heel, big-toe base, little-toe base. Draw the arch up, hold 3, again.',
      targets: [
        { t: 4, move: 'hold', limb: 'footL', holdSec: 24, label: 'LEFT FOOT' },
        { t: 34, move: 'hold', limb: 'footR', holdSec: 24, label: 'RIGHT FOOT' },
      ],
      prompts: [
        { t: 0.5, id: 'coach.drill.go' }, { t: 4, id: 'coach.drill.hold' },
        { t: 30, id: 'coach.drill.switch' }, { t: 34, id: 'coach.drill.hold' },
      ],
    },
    {
      id: 'open-the-joints', name: 'Open the Joints', durationSec: 120, presence: 'required',
      source: { book: PB, chapter: 5, section: 'Phase 4: Open the Joints (2 minutes)' },
      cue: 'Five slow circles each way, to the end of the range.',
      lines: [
        { t: 0, text: 'Left ankle circles, standing on the right foot.' },
        { t: 30, text: 'Right ankle circles.' },
        { t: 60, text: 'Left hip: knee to hip height, circles.' },
        { t: 90, text: 'Right hip.' },
      ],
      targets: [
        { t: 4, move: 'hold', limb: 'footR', holdSec: 24, label: 'LEFT ANKLE' },
        { t: 34, move: 'hold', limb: 'footL', holdSec: 24, label: 'RIGHT ANKLE' },
        { t: 64, move: 'knee', limb: 'kneeL', label: 'LEFT HIP' },
        { t: 94, move: 'knee', limb: 'kneeR', label: 'RIGHT HIP' },
      ],
      prompts: [
        { t: 0.5, id: 'coach.drill.go' }, { t: 30, id: 'coach.drill.switch' },
        { t: 60, id: 'coach.drill.go' }, { t: 90, id: 'coach.drill.switch' },
      ],
    },
    {
      id: 'build-the-rhythm', name: 'Build the Rhythm', durationSec: 120, presence: 'required',
      source: { book: PB, chapter: 5, section: 'Phase 5: Build the Rhythm (2 minutes)' },
      cue: 'Pogos: bounce on the balls of the feet, knees stiff, quick and quiet.',
      targets: [
        { t: 4, move: 'hold', limb: 'feet', holdSec: 3, label: 'FEET HIP-WIDTH' },
        ...repeat(10, POGO_WARMUP_COUNT, POGO_SEC, { move: 'jump', limb: 'feet', label: 'POGO' }),
        ...repeat(70, POGO_WARMUP_COUNT, POGO_SEC, { move: 'jump', limb: 'feet', label: 'POGO' }),
      ],
      prompts: [
        { t: 0.5, id: 'coach.drill.go' }, { t: 26, id: 'coach.drill.rest' },
        { t: 67, id: 'coach.drill.last' }, { t: 86, id: 'coach.drill.rest' },
      ],
    },
    {
      id: 'prime-the-launch', name: 'Prime the Launch', durationSec: 120, presence: 'required',
      source: {
        book: PB, chapter: 5, section: 'Phase 6: Prime the Launch (2 minutes)',
        adapted: 'Three rounds spread over the phase\'s two minutes, so the rest between rounds is longer than the book\'s five seconds.',
      },
      cue: 'Stance, dip, jump, land and pause. Then a low hop and a stomp: hold it.',
      targets: [...wakeUpRound(3), ...wakeUpRound(43), ...wakeUpRound(83)],
      prompts: [
        { t: 1, id: 'coach.drill.go' }, { t: 7, id: 'coach.drill.hold' }, { t: 14, id: 'coach.drill.rest' },
        { t: 41, id: 'coach.drill.go' }, { t: 47, id: 'coach.drill.hold' }, { t: 54, id: 'coach.drill.rest' },
        { t: 81, id: 'coach.drill.last' }, { t: 87, id: 'coach.drill.hold' }, { t: 114, id: 'coach.drill.done' },
      ],
    },
  ],
};

// ── chapter 6: jumping and landing ───────────────────────────────────────────────────────────────────────────────────

const GEOMETRY_REPS = 5;        // the book: "Five reps."
const GEOMETRY_REP_SEC = 11;    // 3 s down, 3 s hold, 3 s up, 2 s to reset: five fit the book's 60 seconds
const GEOMETRY_DOWN_SEC = 3;    // "drop slowly into the bottom"

export const COUNTERMOVEMENT_GEOMETRY: Drill = {
  id: 'countermovement-geometry',
  name: 'Countermovement Geometry Check',
  blurb: 'Slow into the bottom of the dip, hold three seconds, slow up. Five reps, no jump.',
  source: {
    book: PB, chapter: 6, section: 'Drill 1: The Countermovement Geometry Check (60 seconds)',
    adapted: 'The book films the bottom from the side; here the target is the pause at the bottom, and the knee-angle check belongs to the form read.',
  },
  checks: ['knee90', 'hipsBack', 'heelsDown', 'tripod'],
  phases: [{
    id: 'geometry', name: 'Geometry', durationSec: 60, presence: 'required',
    cue: 'Slow down to the bottom of your dip. Hold. Slow up. No jump.',
    targets: repeat(4 + GEOMETRY_DOWN_SEC, GEOMETRY_REPS, GEOMETRY_REP_SEC, { move: 'squat', holdSec: 3, label: 'BOTTOM · HOLD 3' }),
    prompts: [
      { t: 0, id: 'coach.drill.intro' }, { t: 4, id: 'coach.drill.go' },
      { t: 7, id: 'coach.drill.hold' }, { t: 18, id: 'coach.drill.hold' }, { t: 29, id: 'coach.drill.hold' },
      { t: 40, id: 'coach.drill.hold' }, { t: 46.5, id: 'coach.drill.last' }, { t: 51, id: 'coach.drill.hold' },
      { t: 55, id: 'coach.drill.done' },
    ],
  }],
};

const BILATERAL_CONTACTS = 20;  // the book: "three sets of about 20 contacts"
const POGO_REST_SEC = 60;       // the book: "Rest about 60 seconds between sets"

const pogoSet = (id: string, name: string, from: number, count: number, limb: 'feet' | 'footL' | 'footR',
  durationSec: number, prompts: DrillPhase['prompts']): DrillPhase => ({
  id, name, durationSec, presence: 'required',
  cue: limb === 'feet' ? 'Pogos: balls of the feet, knees stiff, quick and quiet.'
    : `Pogos on the ${limb === 'footL' ? 'left' : 'right'} foot: small, rapid, quiet.`,
  targets: repeat(from, count, POGO_SEC, { move: 'jump', limb, label: 'POGO' }),
  prompts,
});

const rest = (id: string, durationSec: number): DrillPhase => ({
  id, name: 'Rest', durationSec, presence: 'free', cue: 'Rest. Walk it off, come back into frame.',
  targets: [], prompts: [{ t: 0.5, id: 'coach.drill.rest' }],
});

export const POGO_BILATERAL: Drill = {
  id: 'pogo-bilateral',
  name: 'Pogo Progression: Both Feet',
  blurb: 'Weeks 1–2 of the pogo progression: three sets of 20 quick, stiff, quiet contacts.',
  source: { book: PB, chapter: 6, section: 'Drill 2: The Oscillatory Pogo Progression' },
  checks: ['kneeBend15', 'armsOpposition'],
  phases: [
    pogoSet('set-1', 'Set 1', FIRST_LEAD_IN_SEC, BILATERAL_CONTACTS, 'feet', 17,
      [{ t: 0, id: 'coach.drill.intro' }, { t: 4.5, id: 'coach.drill.go' }]),
    rest('rest-1', POGO_REST_SEC),
    pogoSet('set-2', 'Set 2', LEAD_IN_SEC, BILATERAL_CONTACTS, 'feet', 14, [{ t: 1, id: 'coach.drill.go' }]),
    rest('rest-2', POGO_REST_SEC),
    pogoSet('set-3', 'Set 3', LEAD_IN_SEC, BILATERAL_CONTACTS, 'feet', 18,
      [{ t: 0.5, id: 'coach.drill.last' }, { t: 13.5, id: 'coach.drill.done' }]),
  ],
};

/** The book: "about 15-second sets". Two sets a side is ours (the book gives the length, not the count). */
const UNILATERAL_CONTACTS = Math.round(15 / POGO_SEC);

export const POGO_UNILATERAL: Drill = {
  id: 'pogo-unilateral',
  name: 'Pogo Progression: One Foot',
  blurb: 'Weeks 3–4: the same spring on one foot. The weaker ankle shows itself.',
  source: {
    book: PB, chapter: 6, section: 'Weeks 3–4: Unilateral Pogos (One Foot)',
    adapted: 'The book gives 15-second sets; two a side is our count.',
  },
  checks: ['kneeBend15', 'pelvisLevel'],
  phases: [
    pogoSet('left-1', 'Left foot', FIRST_LEAD_IN_SEC, UNILATERAL_CONTACTS, 'footL', 22,
      [{ t: 0, id: 'coach.drill.intro' }, { t: 4.5, id: 'coach.drill.go' }]),
    pogoSet('right-1', 'Right foot', LEAD_IN_SEC, UNILATERAL_CONTACTS, 'footR', 19, [{ t: 0.5, id: 'coach.drill.switch' }]),
    rest('rest-1', POGO_REST_SEC),
    pogoSet('left-2', 'Left foot', LEAD_IN_SEC, UNILATERAL_CONTACTS, 'footL', 19, [{ t: 1, id: 'coach.drill.go' }]),
    pogoSet('right-2', 'Right foot', LEAD_IN_SEC, UNILATERAL_CONTACTS, 'footR', 23,
      [{ t: 0.5, id: 'coach.drill.last' }, { t: 18.5, id: 'coach.drill.done' }]),
  ],
};

const LANDING_REPS = 10;        // the book: "Ten reps."
const LANDING_HOLD_SEC = 3;     // the book: "Hold the landing for three seconds."
const LANDING_REP_SEC = 7;      // the hop, the 3-s hold, ~3 s to reset: ours

export const SAFE_LANDING: Drill = {
  id: 'safe-landing',
  name: 'Safe Landing Check',
  blurb: 'Ten quiet landings on both feet, each held three seconds. Boring landings are the goal.',
  source: {
    book: PB, chapter: 6, section: 'Drill 3: The Safe Landing Check',
    adapted: 'The book steps off a 12-inch box. The camera reads a box as floating 30 cm off the floor, so this is a low hop in place landing on both feet.',
  },
  checks: ['kneesAhead', 'hipsBack', 'feetTogether', 'tripod'],
  phases: [{
    id: 'landings', name: 'Landings', durationSec: 76, presence: 'required',
    cue: 'A low hop. Land on both feet at once, soft, and hold it.',
    targets: Array.from({ length: LANDING_REPS }, (_, k): DrillTarget[] => {
      const r = FIRST_LEAD_IN_SEC + k * LANDING_REP_SEC;
      return [
        { t: r, move: 'jump', limb: 'feet', label: 'LOW HOP' },
        { t: round3(r + HOP_FLIGHT_SEC), move: 'land', limb: 'feet', holdSec: LANDING_HOLD_SEC, label: 'LAND · HOLD 3' },
      ];
    }).flat(),
    prompts: [
      { t: 0, id: 'coach.drill.intro' as const }, { t: 4.5, id: 'coach.drill.go' as const },
      ...Array.from({ length: LANDING_REPS }, (_, k) => ({ t: round3(FIRST_LEAD_IN_SEC + k * LANDING_REP_SEC + 0.6), id: 'coach.drill.hold' as const })),
      { t: 67, id: 'coach.drill.last' as const }, { t: 73, id: 'coach.drill.done' as const },
    ].sort((a, b) => a.t - b.t),
  }],
};

// ── chapter 7: SAQ ───────────────────────────────────────────────────────────────────────────────────────────────────

/** The book's coach script: "two sets live". Ten drives a set (five a leg) is ours, the resisted march's 10 (Drill 5). */
const DRIVES_PER_SET = 10;
const WALL_REST_SEC = 45;   // ours: the script gives the wall drive two minutes for a demo and two sets

export const WALL_DRIVE: Drill = {
  id: 'wall-drive',
  name: 'The Wall Drive',
  blurb: 'The first step, isolated: lean from the ankles and drive the knee, one side then the other.',
  source: {
    book: PB, chapter: 7, section: 'Drill 1 — The Wall Drive',
    adapted: 'Stand side-on to the camera with both hands on a wall; the knee drive reads the same side-on.',
  },
  checks: ['bodyLine', 'kneeHeight'],
  phases: [
    {
      id: 'set-1', name: 'Set 1', durationSec: 17, presence: 'required',
      cue: 'A ramp from heels to head. Drive the knee up, fast and high.',
      targets: alternate(FIRST_LEAD_IN_SEC, DRIVES_PER_SET, DRIVE_SEC, 'L', 'knee', 'DRIVE'),
      prompts: [{ t: 0, id: 'coach.drill.intro' }, { t: 4.5, id: 'coach.drill.go' }],
    },
    rest('rest', WALL_REST_SEC),
    {
      id: 'set-2', name: 'Set 2', durationSec: 17, presence: 'required',
      cue: 'Same ramp. Crisp contacts.',
      targets: alternate(LEAD_IN_SEC, DRIVES_PER_SET, DRIVE_SEC, 'L', 'knee', 'DRIVE'),
      prompts: [{ t: 0.5, id: 'coach.drill.last' }, { t: 14, id: 'coach.drill.done' }],
    },
  ],
};

const DECEL_JOG_STEPS = 5;      // the book: "five quick jogging steps"
const DECEL_REPS = 5;           // the coach script: "five each way"
const DECEL_HOLD_SEC = 1;       // the fixes: "demand the one-second hold"
const DECEL_REP_SEC = 8;        // ours: the jog, the plant, the hold, a breath

function decelRep(r: number): DrillTarget[] {
  const iv = stepInterval(APPROACH_SPM);
  const plant = round3(r + DECEL_JOG_STEPS * iv);
  return [
    ...alternate(r, DECEL_JOG_STEPS, iv, 'L'),                       // L R L R L
    { t: plant, move: 'step', limb: 'footR', label: 'PLANT' },       // the outside foot, cutting to the left
    { t: round3(plant + 0.25), move: 'squat', holdSec: DECEL_HOLD_SEC, label: 'SINK · HOLD 1' },
  ];
}

const decelHolds = (from: number) => Array.from({ length: DECEL_REPS }, (_, k) =>
  ({ t: round3(from + k * DECEL_REP_SEC + 2.1), id: 'coach.drill.hold' as const }));

const CUT_LEFT: DrillPhase = {
  id: 'cut-left', name: 'Cut left', durationSec: 43, presence: 'required',
  cue: 'Five quick steps in place, then plant the right foot hard: knee bends, hips drop back. Hold one.',
  targets: Array.from({ length: DECEL_REPS }, (_, k) => decelRep(FIRST_LEAD_IN_SEC + k * DECEL_REP_SEC)).flat(),
  prompts: [
    { t: 0, id: 'coach.drill.intro' }, { t: 4.5, id: 'coach.drill.go' },
    ...decelHolds(FIRST_LEAD_IN_SEC),
  ],
};

export const THREE_STEP_DECEL: Drill = {
  id: 'three-step-decel',
  name: 'The 3-Step Decel',
  blurb: 'Five quick steps, then brake: foot, knee, hip. Five each way, one-second hold.',
  source: {
    book: PB, chapter: 7, section: 'Drill 2 — The 3-Step Decel',
    adapted: 'The jog is in place; the plant and the sink are the cut.',
  },
  checks: ['kneeOverFoot', 'hipBehindKnee', 'knee90'],
  phases: [
    CUT_LEFT,
    {
      // the other way: the same rep mirrored (R L R L R, plant the left foot), starting after the switch
      ...mirrorPhase({
        ...CUT_LEFT,
        targets: Array.from({ length: DECEL_REPS }, (_, k) => decelRep(LEAD_IN_SEC + k * DECEL_REP_SEC)).flat(),
      }),
      id: 'cut-right', name: 'Cut right', durationSec: 42,
      cue: 'Now the other way: plant the left foot.',
      prompts: [
        { t: 0.5, id: 'coach.drill.switch' },
        ...decelHolds(LEAD_IN_SEC).slice(0, DECEL_REPS - 1),
        { t: 33.5, id: 'coach.drill.last' }, { t: 37.1, id: 'coach.drill.hold' }, { t: 39.5, id: 'coach.drill.done' },
      ],
    },
  ],
};

const BOUNDS = 16;              // the book: "Complete 8 bounds each direction."
const BOUND_REP_SEC = 4;        // ours: the bound, the 2-s stick, a breath before pushing back
const BOUND_HOLD_SEC = 2;       // the book: "HOLD for two full seconds."

export const LATERAL_BOUND: Drill = {
  id: 'lateral-bound',
  name: 'Lateral Bound and Stick',
  blurb: 'Push off one foot, land on the other, stick it for two seconds. Eight each way.',
  source: {
    book: PB, chapter: 7, section: 'Drill 3 — The Lateral Bound and Stick',
    adapted: 'Short bounds: ~2 m of floor holds about 0.6 m each way, and the book adds distance only once the stick is silent.',
  },
  checks: ['kneeOverFoot', 'ankleStable'],
  phases: [{
    id: 'bounds', name: 'Bounds', durationSec: 75, presence: 'required',
    cue: 'On one foot, slight knee bend. Push sideways, land on the other foot, stick it.',
    targets: [
      { t: FIRST_LEAD_IN_SEC, move: 'hold', limb: 'footR', holdSec: 1.5, label: 'RIGHT FOOT' },
      ...Array.from({ length: BOUNDS }, (_, k): DrillTarget[] => {
        const r = FIRST_LEAD_IN_SEC + 3 + k * BOUND_REP_SEC;
        const from = k % 2 === 0 ? 'footR' : 'footL';                // push off the standing foot …
        const to = k % 2 === 0 ? 'footL' : 'footR';                  // … land on the other
        return [
          { t: r, move: 'jump', limb: from, label: 'BOUND' },
          { t: round3(r + BOUND_FLIGHT_SEC), move: 'land', limb: to, holdSec: BOUND_HOLD_SEC, label: 'STICK' },
        ];
      }).flat(),
    ],
    prompts: [
      { t: 0, id: 'coach.drill.intro' }, { t: 4.5, id: 'coach.drill.go' },
      { t: 9.6, id: 'coach.drill.hold' }, { t: 13.6, id: 'coach.drill.hold' },
      { t: 67, id: 'coach.drill.last' }, { t: 72, id: 'coach.drill.done' },
    ],
  }],
};

/** One T in place: sprint, touch the far cone, shuffle 2 left (touch), 4 right (touch), 2 left (touch), backpedal. */
function tRep(r: number): DrillTarget[] {
  return [
    ...alternate(r, 6, stepInterval(SPRINT_SPM), 'L', 'step', 'SPRINT'),
    { t: round3(r + 1.9), move: 'touch', limb: 'hands', zone: CONE_MID, label: 'FAR CONE' },
    ...alternate(r + 2.5, 2, SHUFFLE_SEC, 'L', 'step', 'SHUFFLE'),
    { t: round3(r + 3.4), move: 'touch', limb: 'handL', zone: CONE_LEFT, label: 'LEFT CONE' },
    ...alternate(r + 4.0, 4, SHUFFLE_SEC, 'R', 'step', 'SHUFFLE'),
    { t: round3(r + 5.7), move: 'touch', limb: 'handR', zone: CONE_RIGHT, label: 'RIGHT CONE' },
    ...alternate(r + 6.3, 2, SHUFFLE_SEC, 'L', 'step', 'SHUFFLE'),
    { t: round3(r + 7.2), move: 'touch', limb: 'hands', zone: CONE_MID, label: 'MIDDLE CONE' },
    ...alternate(r + 7.8, 4, 0.3, 'L', 'step', 'BACKPEDAL'),
  ];
}
const T_REST_SEC = 20;   // ours: the book times one T at under 20 s; about 1:2 work to rest between reps

const tPhase = (id: string, name: string, r: number, durationSec: number, prompts: DrillPhase['prompts']): DrillPhase => ({
  id, name, durationSec, presence: 'required',
  cue: 'Fast feet, touch the cone. Shuffle left, touch. Right, touch. Left, touch. Backpedal.',
  targets: tRep(r),
  cadence: { stepsPerMin: SPRINT_SPM, windows: [[r, r + 1.6]] },
  prompts,
});

export const T_DRILL: Drill = {
  id: 't-drill',
  name: 'T-Drill in Place',
  blurb: 'Sprint, shuffle, shuffle, backpedal: the T in two metres of floor, three times.',
  source: {
    book: PB, chapter: 7, section: 'Drill 4 — The T-Drill (No Cones Needed)',
    adapted: "The book's T is 10 yards up and 5 either side. Here the sprint is fast feet in place, the shuffles across its markers (5 yards, 10 across, 5 back) are two steps, four, two, and each cone is a hand touch low on that side.",
  },
  checks: ['lowPlant'],
  phases: [
    tPhase('rep-1', 'Rep 1', FIRST_LEAD_IN_SEC, 17, [{ t: 0, id: 'coach.drill.intro' }, { t: 4.5, id: 'coach.drill.go' }]),
    rest('rest-1', T_REST_SEC),
    tPhase('rep-2', 'Rep 2', LEAD_IN_SEC, 14, [{ t: 1, id: 'coach.drill.go' }]),
    rest('rest-2', T_REST_SEC),
    tPhase('rep-3', 'Rep 3', LEAD_IN_SEC, 17, [{ t: 0.5, id: 'coach.drill.last' }, { t: 12.5, id: 'coach.drill.done' }]),
  ],
};

// ── the approach rhythm (The Art of Dunking's push 1-2, in place) ────────────────────────────────────────────────────

const APPROACH_RUN_STEPS = 8;   // ours: long enough to settle a cadence (the reader's cadence needs 4, BodyReader CADENCE_STEPS)
const APPROACH_REPS = 5;        // ours
const APPROACH_REP_SEC = 9;     // the run, the push 1-2, the flight and ~5 s to walk back to the mark

/**
 * One approach in place. The run's 8 steps start on the right so the last one is the left and the penultimate lands on
 * the right; then the plant (left) and the take-off. Off one foot the take-off is the plant foot (the book's
 * right-handed convention in dunkTakeoff.ts: take-off Left, free knee Right); off two, both feet.
 */
function approachRep(r: number, takeoff: 'one' | 'two'): DrillTarget[] {
  const iv = stepInterval(APPROACH_SPM);
  const run = alternate(r, APPROACH_RUN_STEPS, iv, 'R', 'step', 'RUN');
  const last = run[run.length - 1].t;
  const pen = round3(last + iv * PENULT_STRETCH);
  const plant = round3(pen + iv * PLANT_QUICK);
  const off = round3(plant + (takeoff === 'one' ? PLANT_CONTACT_ONE_SEC : PLANT_CONTACT_TWO_SEC));
  return [
    ...run,
    { t: pen, move: 'penultimate', limb: 'footR', label: 'PENULTIMATE' },
    { t: plant, move: 'step', limb: 'footL', label: 'PLANT' },
    takeoff === 'one'
      ? { t: off, move: 'jump', limb: 'footL', label: 'TAKE OFF' }
      : { t: off, move: 'jump', limb: 'feet', label: 'TAKE OFF' },
  ];
}

function approachDrill(takeoff: 'one' | 'two'): Drill {
  const reps = Array.from({ length: APPROACH_REPS }, (_, k) => FIRST_LEAD_IN_SEC + k * APPROACH_REP_SEC);
  const lastRep = reps[reps.length - 1];
  return {
    id: takeoff === 'one' ? 'approach-one-foot' : 'approach-two-foot',
    name: takeoff === 'one' ? 'Approach Rhythm: Off One' : 'Approach Rhythm: Off Two',
    blurb: takeoff === 'one'
      ? 'Run in place, then push 1-2: a long, low penultimate, a quick plant, off the left foot with the right knee driving.'
      : 'Run in place, then push 1-2: a long, low penultimate, both feet close under a deeper gather, off two.',
    source: {
      book: 'art-of-dunking', chapter: 7, section: 'The penultimate step and the plant (chapters 7–8, as lib/babylon/anim/authored/dunkTakeoff.ts carries them)',
      adapted: 'The run-up is running in place: a living room has no runway. The plant\'s ~90° knee is the Playbook\'s (ch. 6, Concept 2).',
    },
    checks: takeoff === 'one'
      ? ['penultimateLong', 'armSwingTiming', 'kneeDrive', 'plantKnee90']
      : ['penultimateLong', 'armSwingTiming', 'deepGather', 'plantKnee90'],
    phases: [{
      id: 'approaches', name: 'Approaches', durationSec: 48, presence: 'required',
      cue: 'Run in place on the beat. Long and low on the penultimate, quick plant, up.',
      targets: reps.map((r) => approachRep(r, takeoff)).flat(),
      cadence: { stepsPerMin: APPROACH_SPM, windows: reps.map((r) => [r, round3(r + APPROACH_RUN_STEPS * stepInterval(APPROACH_SPM))] as [number, number]) },
      prompts: [
        { t: 0, id: 'coach.drill.intro' }, { t: 4.5, id: 'coach.drill.go' },
        ...reps.slice(1, -1).map((r) => ({ t: r - 1.5, id: 'coach.drill.go' as const })),
        { t: lastRep - 1.5, id: 'coach.drill.last' },
        { t: 46, id: 'coach.drill.done' },
      ],
    }],
  };
}

export const APPROACH_ONE_FOOT = approachDrill('one');
export const APPROACH_TWO_FOOT = approachDrill('two');

/** Every drill, in the order Train → Drills lists them: the wake-up first (it is offered after the space check). */
export const DRILLS: readonly Drill[] = [
  WAKE_UP,
  COUNTERMOVEMENT_GEOMETRY,
  POGO_BILATERAL,
  POGO_UNILATERAL,
  SAFE_LANDING,
  WALL_DRIVE,
  THREE_STEP_DECEL,
  LATERAL_BOUND,
  T_DRILL,
  APPROACH_ONE_FOOT,
  APPROACH_TWO_FOOT,
];

export function drillById(id: string): Drill | null {
  return DRILLS.find((d) => d.id === id) ?? null;
}
