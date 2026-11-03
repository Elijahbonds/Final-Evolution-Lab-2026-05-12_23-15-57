// hoopsDrills — ball-skill drills on the camera (BBS-03, platform phase 9, 2026-11-03).
//
// Twelve basketball drills for the /play/drills runner: form shooting, footwork and defense, each a body chart the
// DrillRunner judges from the pose (chart.ts), like the Playbook's drills in drills.ts. The camera reads the BODY here,
// not the ball: the release is a hand reaching up into a zone above the head, a pivot or a jab a foot strike, a closeout
// quick steps then a still stance with a hand up. The ball itself is read on /train/shots (lib/hoops-cam/**).
//
// These are FEL's own drills (no book has them: the Playbook covers jumping, landing and SAQ, not shooting or footwork),
// so each names source { book: 'fel' }. Every number is ours and says so. Done in place, in a room: no rim, no court,
// a ball optional ("hold a ball if you have one").
//
// Words follow docs/CUE-STYLE.md: target labels are short labels, phase cues are prompts (≤ 14 words, plain).
// Demos: DRILL_DEMO_LOOPS (lib/library/surfaceDemo.ts, demo-loops') has no loop for these yet, so the drill page shows the
// start position, still — never a borrowed movement. The loops are queued for demo-loops in the phase report.
//
// Pure: no DOM, no camera.
import type { Limb, MoveKind } from '../babylon/core/bodyTargets';
import { MOVE_WINDOW_SCALE, lateGraceFor } from '../babylon/core/bodyTargets';
import { bodyWindows } from '../babylon/core/DanceCore';
import { type Drill, type DrillPhase, type DrillSource, type DrillTarget, FIRST_LEAD_IN_SEC, LEAD_IN_SEC, round3 } from './chart';

// ── where the hands go, on the self-view (0..1, y down, mirrored: the player's right is the view's right) ────────────

/** Above the head, on the shooting side: a right-handed release. Ours (the head is near y 0.2 at the play fill). */
const RELEASE_R = { x: 0.6, y: 0.1 };
/** Both hands high, over the middle: a closeout's hand, a rebound's high point, a finish. Ours. */
const HIGH = { x: 0.5, y: 0.1 };
/** Low and across to the left, near the knee: a rip-through. Ours (knees near y 0.75). */
const RIP_LOW_L = { x: 0.32, y: 0.72 };

// ── timings (s), all ours ────────────────────────────────────────────────────────────────────────────────────────────

/** A shot's dip to its release: about 0.6 s for a set shot from a still start. Ours. */
const DIP_TO_RELEASE_SEC = 0.6;
/** Release to a still follow-through (the hand stays up). Ours. */
const RELEASE_TO_FINISH_SEC = 0.4;
/** A 1-2 step's two foot strikes, and a chop step's quick feet. Ours. */
const ONE_TWO_SEC = 0.4;
const CHOP_SEC = 0.25;
/** A defensive slide step: the T-drill's shuffle pace (drills.ts SHUFFLE_SEC). */
const SLIDE_SEC = 0.4;
/** Run in place into a jump stop: steps at the approach's cadence, 180 a minute (drills.ts APPROACH_SPM). */
const RUN_SEC = 60 / 180;
/** A low hop's flight (drills.ts HOP_FLIGHT_SEC: 15 cm). */
const HOP_SEC = 0.35;
/** Rest between sets. Ours. */
const SET_REST_SEC = 20;

const FEL = (section: string, adapted?: string): DrillSource => ({ book: 'fel', chapter: 0, section, ...(adapted ? { adapted } : {}) });

// ── the builder ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** One move inside a rep: `dt` seconds after the rep starts. */
interface Beat { dt: number; move: MoveKind; limb?: Limb; zone?: { x: number; y: number }; holdSec?: number; label: string }

/** How long after its beat a target can still be answered (its window, the late event, a hold's length). */
const tailOf = (b: Beat): number =>
  Math.max(b.holdSec ?? 0, bodyWindows(MOVE_WINDOW_SCALE[b.move]).missAfter + lateGraceFor(b.move, b.holdSec));

/**
 * A phase of `reps` identical reps, `repSec` apart, after the lead-in (the drill's first phase waits for the intro).
 * Its length is the last rep's last tail plus room for the closing prompt; its prompts are the coach's own lines: the
 * intro (first phase), go, last one, and done (last phase).
 */
function repPhase(o: {
  id: string; name: string; cue: string; reps: number; repSec: number; beats: Beat[]; first: boolean; last: boolean;
}): DrillPhase {
  const lead = o.first ? FIRST_LEAD_IN_SEC : LEAD_IN_SEC;
  const targets: DrillTarget[] = [];
  for (let k = 0; k < o.reps; k++) {
    for (const b of o.beats) {
      targets.push({
        t: round3(lead + k * o.repSec + b.dt), move: b.move, label: b.label,
        ...(b.limb ? { limb: b.limb } : {}), ...(b.zone ? { zone: b.zone } : {}), ...(b.holdSec ? { holdSec: b.holdSec } : {}),
      });
    }
  }
  targets.sort((a, b) => a.t - b.t);
  const lastRep = lead + (o.reps - 1) * o.repSec;
  const end = Math.max(...o.beats.map((b) => b.dt + tailOf(b)));
  const durationSec = Math.ceil(lastRep + end + (o.last ? 3 : 1.5));
  const prompts: DrillPhase['prompts'] = o.first ? [{ t: 0, id: 'coach.drill.intro' }, { t: 4.5, id: 'coach.drill.go' }] : [{ t: 0.5, id: 'coach.drill.go' }];
  if (o.reps >= 3) prompts.push({ t: round3(lastRep - 1.5), id: 'coach.drill.last' });
  if (o.last) prompts.push({ t: durationSec - 2, id: 'coach.drill.done' });
  return { id: o.id, name: o.name, durationSec, presence: 'required', cue: o.cue, targets, prompts };
}

const rest = (id: string): DrillPhase => ({
  id, name: 'Rest', durationSec: SET_REST_SEC, presence: 'free', cue: 'Shake it out. Breathe.', targets: [], prompts: [{ t: 0, id: 'coach.drill.rest' }],
});

/** A drill of `sets` sets of the same reps, with rests between. */
function setsOf(sets: number, o: { id: string; name: string; cue: string; reps: number; repSec: number; beats: Beat[] }): DrillPhase[] {
  const out: DrillPhase[] = [];
  for (let s = 0; s < sets; s++) {
    out.push(repPhase({ ...o, id: `${o.id}-${s + 1}`, name: sets > 1 ? `${o.name} · set ${s + 1}` : o.name, first: s === 0, last: s === sets - 1 }));
    if (s < sets - 1) out.push(rest(`rest-${s + 1}`));
  }
  return out;
}

// ── shooting ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const SHOT: Beat[] = [
  { dt: 0, move: 'squat', label: 'DIP' },
  { dt: DIP_TO_RELEASE_SEC, move: 'touch', limb: 'handR', zone: RELEASE_R, label: 'RELEASE' },
  { dt: DIP_TO_RELEASE_SEC + RELEASE_TO_FINISH_SEC, move: 'hold', holdSec: 1.2, label: 'HOLD THE FINISH' },
];

export const FORM_SHOOTING: Drill = {
  id: 'hoops-form-shooting',
  name: 'Form Shooting',
  blurb: 'Ten set shots in place: dip, release up high, hold the finish.',
  source: FEL('Shooting: form shots', 'In place, facing the camera, a ball if you have one. Right-handed; the other side is a mirror away.'),
  checks: [],
  phases: setsOf(2, { id: 'form', name: 'Form shots', cue: 'Small dip. Ball up past your eyes. Hold the finish.', reps: 5, repSec: 4, beats: SHOT }),
};

export const FREE_THROW_ROUTINE: Drill = {
  id: 'hoops-free-throw',
  name: 'Free-Throw Routine',
  blurb: 'The same routine every time: set, dip, release, hold until it lands.',
  source: FEL('Shooting: the free-throw routine', 'In place, facing the camera; the line is wherever you stand.'),
  checks: [],
  phases: setsOf(1, {
    id: 'routine', name: 'Routine', cue: 'Feet set. Breathe. Dip, release, hold it.', reps: 8, repSec: 7,
    beats: [
      { dt: 0, move: 'hold', holdSec: 1.5, label: 'SET YOUR FEET' },
      { dt: 2.2, move: 'squat', label: 'DIP' },
      { dt: 2.2 + DIP_TO_RELEASE_SEC, move: 'touch', limb: 'handR', zone: RELEASE_R, label: 'RELEASE' },
      { dt: 2.2 + DIP_TO_RELEASE_SEC + RELEASE_TO_FINISH_SEC, move: 'hold', holdSec: 2, label: 'HOLD TILL IT LANDS' },
    ],
  }),
};

export const CATCH_AND_SHOOT: Drill = {
  id: 'hoops-catch-and-shoot',
  name: 'Catch and Shoot',
  blurb: 'A 1-2 step into your shot: left, right, dip, release.',
  source: FEL('Shooting: the 1-2 step', 'The two steps are taken in place; the catch is imagined or a ball held.'),
  checks: [],
  phases: setsOf(2, {
    id: 'catch', name: 'Catch and shoot', cue: 'Left, right, then straight up into the shot.', reps: 4, repSec: 5,
    beats: [
      { dt: 0, move: 'step', limb: 'footL', label: 'ONE' },
      { dt: ONE_TWO_SEC, move: 'step', limb: 'footR', label: 'TWO' },
      { dt: ONE_TWO_SEC + 0.5, move: 'squat', label: 'DIP' },
      { dt: ONE_TWO_SEC + 0.5 + DIP_TO_RELEASE_SEC, move: 'touch', limb: 'handR', zone: RELEASE_R, label: 'RELEASE' },
      { dt: ONE_TWO_SEC + 0.5 + DIP_TO_RELEASE_SEC + RELEASE_TO_FINISH_SEC, move: 'hold', holdSec: 1, label: 'HOLD THE FINISH' },
    ],
  }),
};

// ── footwork ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const JAB_SERIES: Drill = {
  id: 'hoops-jab-series',
  name: 'Triple-Threat Jab',
  blurb: 'Stay low with the ball at your hip, jab with the right foot, bring it back.',
  source: FEL('Footwork: triple threat and the jab', 'The left foot is the pivot foot and stays down.'),
  checks: [],
  phases: setsOf(2, {
    id: 'jab', name: 'Jab', cue: 'Low and still. Quick jab, quick back.', reps: 5, repSec: 5,
    beats: [
      { dt: 0, move: 'hold', holdSec: 1.5, label: 'TRIPLE THREAT' },
      { dt: 2.2, move: 'step', limb: 'footR', label: 'JAB' },
      { dt: 3.2, move: 'step', limb: 'footR', label: 'BACK' },
    ],
  }),
};

export const JUMP_STOP: Drill = {
  id: 'hoops-jump-stop',
  name: 'Jump Stop',
  blurb: 'Run in place, then a low two-foot stop you hold: balanced, ready to shoot or pass.',
  source: FEL('Footwork: the jump stop', 'The run is in place; the stop is a low hop landing on both feet.'),
  checks: [],
  phases: setsOf(1, {
    id: 'stops', name: 'Jump stops', cue: 'Quick feet, then stop on both feet, low and still.', reps: 6, repSec: 6,
    beats: [
      { dt: 0, move: 'step', limb: 'footL', label: 'RUN' },
      { dt: RUN_SEC, move: 'step', limb: 'footR', label: 'RUN' },
      { dt: 2 * RUN_SEC, move: 'step', limb: 'footL', label: 'RUN' },
      { dt: 3 * RUN_SEC, move: 'step', limb: 'footR', label: 'RUN' },
      { dt: 4 * RUN_SEC + 0.3, move: 'jump', limb: 'feet', label: 'HOP' },
      { dt: 4 * RUN_SEC + 0.3 + HOP_SEC, move: 'land', limb: 'feet', holdSec: 2, label: 'STOP · HOLD' },
    ],
  }),
};

export const PIVOTS: Drill = {
  id: 'hoops-pivots',
  name: 'Front and Reverse Pivots',
  blurb: 'Left foot down, swing the right foot forward, then back around the other way.',
  source: FEL('Footwork: front and reverse pivots', 'The left foot is the pivot foot; each swing of the right foot is one step.'),
  checks: [],
  phases: setsOf(2, {
    id: 'pivots', name: 'Pivots', cue: 'Left heel up, left foot stays put. Stay low.', reps: 5, repSec: 5,
    beats: [
      { dt: 0, move: 'hold', holdSec: 1.2, label: 'PIVOT FOOT DOWN' },
      { dt: 2, move: 'step', limb: 'footR', label: 'FRONT PIVOT' },
      { dt: 3.2, move: 'step', limb: 'footR', label: 'REVERSE PIVOT' },
    ],
  }),
};

export const DROP_STEP: Drill = {
  id: 'hoops-drop-step',
  name: 'Drop Step',
  blurb: 'Back to the basket: drop the left foot, sit low, finish high.',
  source: FEL('Footwork: the drop step', 'Facing the camera as if it were the defender behind you; the finish is a reach up, no jump.'),
  checks: [],
  phases: setsOf(2, {
    id: 'drop', name: 'Drop step', cue: 'Sit low, drop the foot, then finish up high.', reps: 4, repSec: 6,
    beats: [
      { dt: 0, move: 'hold', holdSec: 1.5, label: 'POST UP' },
      { dt: 2.2, move: 'step', limb: 'footL', label: 'DROP STEP' },
      { dt: 2.8, move: 'squat', label: 'SIT LOW' },
      { dt: 3.5, move: 'touch', limb: 'hands', zone: HIGH, label: 'FINISH HIGH' },
    ],
  }),
};

export const LAYUP_FOOTWORK: Drill = {
  id: 'hoops-layup-footwork',
  name: 'Layup Footwork',
  blurb: 'Right, left, right knee up and reach: the right-hand layup, in place.',
  source: FEL('Footwork: the right-hand layup', 'In place, no jump: the last step drives the knee and the hand reaches up.'),
  checks: [],
  phases: setsOf(2, {
    id: 'layup', name: 'Layups', cue: 'Right, left, then right knee up and reach high.', reps: 5, repSec: 4.5,
    beats: [
      { dt: 0, move: 'step', limb: 'footR', label: 'RIGHT' },
      { dt: 0.45, move: 'step', limb: 'footL', label: 'LEFT' },
      { dt: 0.95, move: 'knee', limb: 'kneeR', label: 'KNEE UP' },
      { dt: 1.05, move: 'touch', limb: 'handR', zone: RELEASE_R, label: 'REACH' },
    ],
  }),
};

export const EURO_STEP: Drill = {
  id: 'hoops-euro-step',
  name: 'Euro Step',
  blurb: 'One step right, a long step left, then knee up and finish.',
  source: FEL('Footwork: the euro step', 'In place: the second step goes wide to the left; no jump.'),
  checks: [],
  phases: setsOf(2, {
    id: 'euro', name: 'Euro steps', cue: 'Right, then long to the left. Knee up, reach high.', reps: 5, repSec: 4.5,
    beats: [
      { dt: 0, move: 'step', limb: 'footR', label: 'ONE' },
      { dt: 0.5, move: 'step', limb: 'footL', label: 'LONG LEFT' },
      { dt: 1.0, move: 'knee', limb: 'kneeR', label: 'KNEE UP' },
      { dt: 1.1, move: 'touch', limb: 'hands', zone: HIGH, label: 'FINISH' },
    ],
  }),
};

export const RIP_THROUGH: Drill = {
  id: 'hoops-rip-through',
  name: 'Rip-Through',
  blurb: 'From triple threat, sweep the ball low across your knees and go.',
  source: FEL('Footwork: the rip-through', 'The sweep is the hands going low to the left knee; the go is one step with the right foot.'),
  checks: [],
  phases: setsOf(2, {
    id: 'rip', name: 'Rip-throughs', cue: 'Low and still, sweep it low, then step through.', reps: 5, repSec: 5,
    beats: [
      { dt: 0, move: 'hold', holdSec: 1.5, label: 'TRIPLE THREAT' },
      { dt: 2.2, move: 'touch', limb: 'hands', zone: RIP_LOW_L, label: 'RIP LOW' },
      { dt: 2.7, move: 'step', limb: 'footR', label: 'GO' },
    ],
  }),
};

// ── defense ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export const CLOSEOUT: Drill = {
  id: 'hoops-closeout',
  name: 'Closeout',
  blurb: 'Quick chop steps, then a still stance with one hand high.',
  source: FEL('Defense: the closeout', 'The sprint is in place; the chop steps slow you down before the stance.'),
  checks: [],
  phases: setsOf(2, {
    id: 'closeout', name: 'Closeouts', cue: 'Chop your feet, hand up high, sit in your stance.', reps: 4, repSec: 6,
    beats: [
      { dt: 0, move: 'step', limb: 'footL', label: 'CHOP' },
      { dt: CHOP_SEC, move: 'step', limb: 'footR', label: 'CHOP' },
      { dt: 2 * CHOP_SEC, move: 'step', limb: 'footL', label: 'CHOP' },
      { dt: 3 * CHOP_SEC, move: 'step', limb: 'footR', label: 'CHOP' },
      { dt: 4 * CHOP_SEC + 0.4, move: 'touch', limb: 'hands', zone: HIGH, label: 'HAND UP' },
      { dt: 4 * CHOP_SEC + 0.9, move: 'hold', holdSec: 1.5, label: 'STANCE' },
    ],
  }),
};

export const DEFENSIVE_SLIDE: Drill = {
  id: 'hoops-defensive-slide',
  name: 'Defensive Slide',
  blurb: 'Sit in your stance, then slide: short, quick steps, feet never cross.',
  source: FEL('Defense: the slide', 'The slide is quick steps in place, side-on to nothing: about 2 m of floor is enough.'),
  checks: [],
  phases: setsOf(3, {
    id: 'slide', name: 'Slides', cue: 'Low stance. Quick short steps. Feet stay apart.', reps: 2, repSec: 6.5,
    beats: [
      { dt: 0, move: 'hold', holdSec: 1.2, label: 'STANCE' },
      ...Array.from({ length: 8 }, (_, k): Beat => ({ dt: round3(2 + k * SLIDE_SEC), move: 'step', limb: k % 2 ? 'footR' : 'footL', label: 'SLIDE' })),
    ],
  }),
};

export const REBOUND_AND_CHIN: Drill = {
  id: 'hoops-rebound',
  name: 'Rebound and Chin',
  blurb: 'Load, go up with both hands, land on both feet and hold the ball at your chin.',
  source: FEL('Rebounding: high point and chin it', 'A low hop in place; the high point is both hands up.'),
  checks: [],
  phases: setsOf(1, {
    id: 'boards', name: 'Rebounds', cue: 'Load, both hands up, land wide and hold it.', reps: 6, repSec: 6,
    beats: [
      { dt: 0, move: 'squat', label: 'LOAD' },
      { dt: 0.3, move: 'jump', limb: 'feet', label: 'UP' },
      { dt: 0.5, move: 'touch', limb: 'hands', zone: HIGH, label: 'HIGH POINT' },
      { dt: 0.3 + HOP_SEC, move: 'land', limb: 'feet', holdSec: 1.5, label: 'CHIN IT' },
    ],
  }),
};

/** The ball-skill shelf, in the order the page lists it: shooting, footwork, defense, rebounding. */
export const HOOPS_DRILLS: readonly Drill[] = [
  FORM_SHOOTING, FREE_THROW_ROUTINE, CATCH_AND_SHOOT,
  JAB_SERIES, JUMP_STOP, PIVOTS, DROP_STEP, LAYUP_FOOTWORK, EURO_STEP, RIP_THROUGH,
  CLOSEOUT, DEFENSIVE_SLIDE, REBOUND_AND_CHIN,
];
