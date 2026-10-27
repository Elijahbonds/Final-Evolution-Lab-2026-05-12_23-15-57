// scripts/library/seedFamilies.ts — EXERCISE-LIBRARY (2026-10-25): FEL's words for the seed list's exercises.
//
// The seed (free-exercise-db, Unlicense — data/library/seed/SOURCE.json) gives FACTS: a name, a level, equipment,
// muscles, a category. Its instruction prose is NOT imported: its provenance is not documented upstream, and it is
// written in body-part cues ("contract your biceps") that FEL's external-focus policy (lib/coach/cueLint.ts) refuses.
// Every seed entry instead takes its set-up line, cues and faults from one of the movement families below, written
// for this library in the owner's style — the floor, the wall, the handle first; the body part only as the fallback.
//
// A family is matched by the seed row's name (and category / muscles where the name is not enough). The first match
// wins, so the specific families come before the general ones. `scripts/library/import-seed.ts` reports how many rows
// each family took, and the validator lints every line.

import type { LibraryDosage, LibraryFault } from '../../lib/library/types';
import type { CategoryId, GoalId, Joint, MovementPattern, MuscleId } from '../../lib/library/vocab';
import type { ClipKey } from '../../lib/library/demo';

export interface SeedRow {
  id: string; name: string; force: string | null; level: string; mechanic: string | null; equipment: string | null;
  primaryMuscles: string[]; secondaryMuscles: string[]; category: string; images: string[];
}

export interface SeedFamily {
  id: string;
  match: (n: string, r: SeedRow) => boolean;
  pattern: MovementPattern | ((n: string, r: SeedRow) => MovementPattern);
  category?: CategoryId;
  plane?: 'sagittal' | 'frontal' | 'transverse' | 'multi';
  skillLayer: string | null;
  braceMode: 'set' | 'reflex' | 'none' | null;
  goals: GoalId[];
  lowLoad?: Joint[];
  clip?: ClipKey;
  /** where to stand, what to hold: `{eq}` is replaced with the row's equipment phrase ("the dumbbells") */
  setup: string;
  cues: string[];
  faults: LibraryFault[];
  dosage: LibraryDosage;
  cautions?: string[];
  youthOk?: boolean;
  /** muscles to use when the seed row lists none */
  muscles?: MuscleId[];
}

const has = (n: string, re: RegExp) => re.test(n);
const S = (sets: number, reps: string, restSec: number, tempo?: string): LibraryDosage => ({ sets, reps, restSec, ...(tempo ? { tempo } : {}) });
const T = (sets: number, seconds: number, restSec: number): LibraryDosage => ({ sets, seconds, restSec });
const C = (sets: number, contacts: number, restSec: number): LibraryDosage => ({ sets, contacts, restSec });

const BACK_OFF = 'Pick the easier version if the range or the load stops being smooth.';
const OVERHEAD_RANGE = 'Needs good overhead reach. If the weight drifts forward, press at an angle with a landmine instead.';
const BEHIND_NECK = 'Behind-the-neck positions ask for a lot of shoulder range: the in-front version is the default.';
const LANDING = 'Plyometric: only once landings are quiet and stable. Count contacts, not sets.';

const FAMILY_DEFS: readonly SeedFamily[] = [
  // ── recovery and range ───────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'roll', match: (n, r) => has(n, /smr\b/) || r.equipment === 'foam roll', pattern: 'mobility', category: 'recovery', skillLayer: 'reset', braceMode: 'none',
    goals: ['cooldown', 'mobility'], lowLoad: ['knee', 'ankle', 'back', 'shoulder', 'wrist', 'elbow', 'hip'], clip: 'stretch',
    setup: 'Set the foam roller on the floor and lower onto it, hands or feet down to take weight off.',
    cues: ['Roll slow: one inch a second along the roller.', 'Breathe out long whenever you find a spot worth staying on.', 'Keep the pressure where you can still breathe smoothly.'],
    faults: [{ fault: 'Rolling fast back and forth', fix: 'Slow the roll right down: one inch a second along the roller.' }, { fault: 'Holding the breath on a tender spot', fix: 'Take some weight back onto the floor and let the air out slowly.' }],
    dosage: T(1, 60, 15),
  },
  {
    id: 'stretch-hamstring', match: (n, r) => (r.category === 'stretching' || has(n, /stretch/)) && r.primaryMuscles.includes('hamstrings'),
    pattern: 'mobility', category: 'mobility', skillLayer: 'joints', braceMode: 'none', goals: ['mobility', 'cooldown', 'hip'], lowLoad: ['knee', 'ankle', 'shoulder', 'wrist', 'elbow'], clip: 'stretch',
    setup: 'Set up with one leg long and the knee soft, toes pointing to the ceiling.',
    cues: ['Fold from the belt line toward the floor and stop at the first firm pull.', 'Breathe out long and let the floor come a little closer each exhale.', 'Keep the reach smooth: no bouncing at the end of the range.'],
    faults: [{ fault: 'Rounding the upper back to reach further', fix: 'Reach your belt buckle toward the floor, not your nose.' }, { fault: 'Bouncing at the end of the range', fix: 'Hold still at the first firm pull and breathe out.' }],
    dosage: T(2, 30, 15),
  },
  {
    id: 'stretch-quad-hip', match: (n, r) => (r.category === 'stretching' || has(n, /stretch|hip flexor/)) && (r.primaryMuscles.includes('quadriceps') || has(n, /hip flexor/)),
    pattern: 'mobility', category: 'mobility', skillLayer: 'joints', braceMode: 'none', goals: ['mobility', 'hip', 'cooldown'], lowLoad: ['ankle', 'shoulder', 'wrist', 'elbow', 'back'], clip: 'stretch',
    setup: 'Set up so the front of your hip can open: kneeling, lying on your side, or standing with a hand on a wall.',
    cues: ['Tuck the belt buckle up toward your chin before you reach for more range.', 'Push the back knee gently toward the floor and hold still.', 'Let the air out long and stay at a firm pull, never a sharp one.'],
    faults: [{ fault: 'Arching the lower back to fake the range', fix: 'Tuck the belt buckle up first; the range you keep is the real one.' }, { fault: 'Yanking the foot toward the seat', fix: 'Ease the heel toward the seat over a slow count of three.' }],
    dosage: T(2, 30, 15),
  },
  {
    id: 'stretch-hip', match: (n, r) => (r.category === 'stretching' || has(n, /stretch|groin|piriformis|it band/)) && r.primaryMuscles.some((m) => ['glutes', 'adductors', 'abductors'].includes(m)),
    pattern: 'mobility', category: 'mobility', skillLayer: 'joints', braceMode: 'none', goals: ['mobility', 'hip', 'cooldown'], lowLoad: ['knee', 'ankle', 'shoulder', 'wrist', 'elbow'], clip: 'stretch',
    setup: 'Set up seated or lying on the floor with the working hip turned out and the other leg resting easy.',
    cues: ['Sit tall toward the ceiling, then lean forward from the hips to the first firm pull.', 'Breathe out long and let the floor take more of your weight.', 'Ease out of the stretch as slowly as you eased in.'],
    faults: [{ fault: 'Forcing the knee down with the hands', fix: 'Let the floor do the work: hold still and breathe out.' }, { fault: 'Slumping into the stretch', fix: 'Grow tall toward the ceiling first, then fold.' }],
    dosage: T(2, 30, 15),
  },
  {
    id: 'stretch-calf', match: (n, r) => (r.category === 'stretching' || has(n, /stretch/)) && r.primaryMuscles.includes('calves'),
    pattern: 'mobility', category: 'mobility', skillLayer: 'joints', braceMode: 'none', goals: ['mobility', 'ankle', 'cooldown'], lowLoad: ['knee', 'back', 'shoulder', 'wrist', 'elbow', 'hip'], clip: 'stretch',
    setup: 'Hands on a wall, one foot back, heel down and toes pointing at the wall.',
    cues: ['Press the back heel into the floor and lean the hips toward the wall.', 'Bend the back knee a touch toward the wall to move the pull lower.', 'Hold still and breathe out long.'],
    faults: [{ fault: 'Back heel lifting off the floor', fix: 'Shorten the stance until the heel stays heavy on the floor.' }, { fault: 'Back foot turned out', fix: 'Point the laces of the back shoe straight at the wall.' }],
    dosage: T(2, 30, 15),
  },
  {
    id: 'stretch-upper', match: (n, r) => r.category === 'stretching' || has(n, /stretch|child'?s pose/),
    pattern: 'mobility', category: 'mobility', skillLayer: 'joints', braceMode: 'none', goals: ['mobility', 'shoulder', 'posture', 'cooldown'], lowLoad: ['knee', 'ankle', 'hip'], clip: 'stretch',
    setup: 'Stand, sit or kneel tall with room to reach; use a wall, door frame or the floor for support.',
    cues: ['Reach long toward the wall or the ceiling and stop at the first firm pull.', 'Breathe out long and let the range open a little each exhale.', 'Move in and out of the position smoothly, never with a jerk.'],
    faults: [{ fault: 'Shrugging into the stretch', fix: 'Reach long toward the wall, away from your ears.' }, { fault: 'Holding the breath', fix: 'Let the air out slowly while you hold still.' }],
    dosage: T(2, 30, 15),
  },

  // ── Olympic lifts and kettlebell ballistics ──────────────────────────────────────────────────────────────────────
  {
    id: 'snatch', match: (n) => has(n, /snatch/) && !has(n, /kettlebell/), pattern: 'hinge', category: 'power', plane: 'sagittal', skillLayer: 'jump-land', braceMode: 'set',
    goals: ['power', 'vertical'], clip: 'jump', youthOk: false,
    setup: 'Feet under the hips, hands wide on {eq}, shins close to it, chest over the bar.',
    cues: ['Push the floor away and keep the bar brushing close all the way up.', 'Jump straight up, then pull yourself under to catch it overhead.', 'Land the catch quiet, with the bar stacked over the middle of your feet.'],
    faults: [{ fault: 'Bar swinging out in front', fix: 'Keep the bar brushing your thighs: a close path, straight up.' }, { fault: 'Pulling with the arms early', fix: 'Jump straight up first, then pull under the bar to finish.' }],
    dosage: S(5, '2-3', 120), cautions: ['Technical lift: learn it with a coach and an empty bar first.', OVERHEAD_RANGE],
  },
  {
    id: 'clean', match: (n) => (has(n, /\bclean\b/) && !has(n, /kettlebell|squat/)) || has(n, /rack delivery/), pattern: 'hinge', category: 'power', plane: 'sagittal', skillLayer: 'jump-land', braceMode: 'set',
    goals: ['power', 'vertical'], clip: 'jump', youthOk: false,
    setup: 'Feet under the hips, hands just outside the legs on {eq}, shins close to it.',
    cues: ['Push the floor away, then jump straight up with the bar close.', 'Meet the bar on the front of the shoulders with the elbows ripping forward fast.', 'Land the catch quiet and stand up tall.'],
    faults: [{ fault: 'Bar looping away from the body', fix: 'Keep the bar brushing your thighs on a straight path.' }, { fault: 'Catching with the elbows down', fix: 'Whip the elbows forward to point at the wall ahead.' }],
    dosage: S(5, '2-3', 120), cautions: ['Technical lift: learn it with a coach and an empty bar first.'],
  },
  {
    id: 'jerk-press', match: (n) => has(n, /jerk|push press|thruster/) && !has(n, /kettlebell/), pattern: 'push', category: 'power', plane: 'sagittal', skillLayer: 'jump-land', braceMode: 'set',
    goals: ['power', 'shoulder'], clip: 'push', youthOk: false,
    setup: 'Hold {eq} on the front of the shoulders, feet under the hips, elbows a little forward.',
    cues: ['Dip straight down a few inches, then drive the floor away fast.', 'Punch the weight straight up toward the ceiling.', 'Finish with the weight stacked over the middle of your feet and hold still.'],
    faults: [{ fault: 'Dipping forward onto the toes', fix: 'Dip straight down like an elevator, heels heavy.' }, { fault: 'Pressing the weight forward', fix: 'Drive it straight up toward the ceiling, close to your face.' }],
    dosage: S(4, '3-5', 120), cautions: [OVERHEAD_RANGE],
  },
  {
    id: 'kb-swing', match: (n) => has(n, /swing|pass between|figure 8|vertical swing|sledgehammer/), pattern: 'hinge', category: 'power', plane: 'sagittal', skillLayer: 'strength', braceMode: 'reflex',
    goals: ['power', 'conditioning', 'hip'], clip: 'hinge', lowLoad: ['knee'],
    setup: 'Stand with {eq} a foot in front of you, feet a little wider than the hips, hinge back and grip the handle.',
    cues: ['Hike the bell back high between your legs, like a football snap.', 'Snap the hips forward and let the bell float to chest height.', 'Stand tall at the top: hips through, still for a beat.'],
    faults: [{ fault: 'Squatting the swing', fix: 'Push the wall behind you with your hips; the knees bend only a little.' }, { fault: 'Lifting the bell with the arms', fix: 'Let the hip snap float the bell; the arms are ropes.' }],
    dosage: S(5, '10-15', 60),
  },
  {
    id: 'kb-clean-snatch', match: (n, r) => (has(n, /kettlebell/) || r.equipment === 'kettlebells') && has(n, /clean|snatch|jerk|push press|thruster|high pull/), pattern: 'hinge', category: 'power', plane: 'sagittal', skillLayer: 'strength', braceMode: 'reflex',
    goals: ['power', 'conditioning'], clip: 'hinge', youthOk: false,
    setup: 'Stand over {eq} with feet hip-width, hinge back and take the handle with a loose hook grip.',
    cues: ['Hike the bell back, then snap the hips through to float it up close.', 'Keep the bell on a tight path, close to your zipper.', 'Let the bell land soft in the rack or overhead, no bang on the forearm.'],
    faults: [{ fault: 'Bell flipping over and banging the forearm', fix: 'Keep the bell close and punch your hand through the handle early.' }, { fault: 'Arm curling the bell up', fix: 'Let the hips float the bell; the arm only guides the path.' }],
    dosage: S(5, '5 each side', 75), cautions: ['Technical lift: learn the swing first.'],
  },
  {
    id: 'get-up-windmill', match: (n) => has(n, /get up|windmill|halo|bottoms up|pirate|spell caster/), pattern: 'rotation', category: 'core', plane: 'multi', skillLayer: 'strength', braceMode: 'set',
    goals: ['shoulder', 'trunk', 'mobility'], clip: 'rotate',
    setup: 'Start light: hold {eq} with a straight wrist, the arm long and stacked over the shoulder where the move is overhead.',
    cues: ['Keep your eyes on the bell and the knuckles pointing at the ceiling.', 'Move slow and smooth: every position should be one you could pause in.', 'Push the floor away with the free hand or foot as you rise.'],
    faults: [{ fault: 'Bell drifting off the stack', fix: 'Keep the knuckles pointing straight at the ceiling the whole time.' }, { fault: 'Rushing between positions', fix: 'Pause for a count in each position before the next one.' }],
    dosage: S(3, '3 each side', 60), cautions: [OVERHEAD_RANGE],
  },

  // ── hinge ────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'good-morning', match: (n) => has(n, /good morning|jefferson/), pattern: 'hinge', category: 'strength', skillLayer: 'strength', braceMode: 'set', goals: ['strength', 'hip'], clip: 'hinge',
    setup: 'Feet hip-width, {eq} across the upper back or held in front, knees soft.',
    cues: ['Push the wall behind you with your hips until the shins are near vertical.', 'Keep the belt line and the collar moving as one long piece.', 'Drive the hips forward to stand tall at the top.'],
    faults: [{ fault: 'Back rounding at the bottom', fix: 'Push the wall behind you with your hips; stop while your back stays long.' }, { fault: 'Knees bending into a squat', fix: 'Push the wall behind you with your hips; the shins stay nearly still.' }],
    dosage: S(3, '8-10', 90, '3-0-1-0'), cautions: [BACK_OFF],
  },
  {
    id: 'rdl', match: (n) => has(n, /romanian|stiff[- ]?leg|one[- ]?legged deadlift|single leg deadlift|kettlebell one legged|stiff legs/), pattern: 'hinge', category: 'strength', skillLayer: 'strength', braceMode: 'set', goals: ['strength', 'hip', 'speed'], clip: 'hinge', lowLoad: ['knee'],
    setup: 'Stand tall holding {eq} in front of the thighs, feet hip-width, knees soft.',
    cues: ['Push the wall behind you with your hips and slide the weight down your thighs.', 'Stop when the hips stop travelling back, then stand tall.', 'Keep the weight brushing your legs the whole way.'],
    faults: [{ fault: 'Weight drifting away from the legs', fix: 'Slide the weight down your thighs; keep it brushing close.' }, { fault: 'Chasing depth by rounding', fix: 'Stop where your hips stop moving back toward the wall; that is your range today.' }],
    dosage: S(3, '8-10', 90, '3-0-1-0'),
  },
  {
    id: 'deadlift', match: (n) => has(n, /deadlift|rack pull|clean pull|snatch pull|pull through|car deadlift|axle/), pattern: 'hinge', category: 'strength', skillLayer: 'strength', braceMode: 'set', goals: ['strength', 'hip', 'grip'], clip: 'hinge',
    setup: 'Stand with {eq} over the middle of your feet, hinge down, grip it just outside the legs and pull the slack out.',
    cues: ['Push the floor away and keep the weight brushing your legs.', 'Brace for a light punch before the weight leaves the floor.', 'Stand tall and still at the top, then lower it on the same path, hips back.'],
    faults: [{ fault: 'Hips shooting up first', fix: 'Push the floor away so the hips and the shoulders rise together.' }, { fault: 'Weight drifting forward off the legs', fix: 'Keep the bar brushing your shins and thighs the whole way.' }],
    dosage: S(4, '4-6', 150), cautions: [BACK_OFF],
  },
  {
    id: 'bridge-thrust', match: (n) => has(n, /bridge|hip thrust|hip raise|hip lift|butt lift|pelvic tilt|butt ups/) && !has(n, /side bridge|parallel bars/), pattern: 'hinge', category: 'strength', skillLayer: 'strength', braceMode: 'set', goals: ['strength', 'hip', 'speed'], clip: 'hinge', lowLoad: ['knee', 'back', 'shoulder', 'wrist'],
    setup: 'Back on the floor or a bench, feet flat and hip-width, shins close to vertical at the top.',
    cues: ['Push the floor away through your heels and lift the belt buckle to the ceiling.', 'Hold the top still for a two-count.', 'Lower slow until the hips nearly touch the floor.'],
    faults: [{ fault: 'Arching the lower back at the top', fix: 'Tuck the belt buckle toward your chin and stop at a straight line.' }, { fault: 'Pushing through the toes', fix: 'Lift the toes inside the shoes and drive through the heels into the floor.' }],
    dosage: S(3, '10-12', 60, '2-2-1-0'),
  },
  {
    id: 'back-extension', match: (n) => has(n, /hyperextension|back extension|superman|reverse hyper|glute ham|lower back curl/), pattern: 'hinge', category: 'strength', skillLayer: 'strength', braceMode: 'set', goals: ['strength', 'hip', 'posture'], clip: 'hinge',
    setup: 'Set the pad just below the belt line (or lie face down on the floor), feet anchored, arms crossed or reaching.',
    cues: ['Lower toward the floor slowly, then lift until you make a straight line to the wall.', 'Stop at the straight line: no swinging past it.', 'Move smooth both ways, like a slow nod from the hips.'],
    faults: [{ fault: 'Swinging up past straight', fix: 'Stop the lift when your head lines up with the wall behind your feet.' }, { fault: 'Dropping fast', fix: 'Lower on a slow three-count toward the floor.' }],
    dosage: S(3, '10-12', 60),
  },
  {
    id: 'leg-curl', match: (n) => has(n, /leg curl|hamstring curl|ball leg curl|hamstring slides|nordic|manual hamstring/), pattern: 'hinge', category: 'strength', skillLayer: 'strength', braceMode: 'none', goals: ['strength', 'speed', 'knee'], clip: 'idle', lowLoad: ['back'],
    setup: 'Set the pad, ball or sliders just above your heels, hips steady, knees lined up with the machine pivot.',
    cues: ['Pull the heels toward the seat on a smooth path.', 'Lower slow over three seconds to the bottom of the range.', 'Keep the hips still on the bench or the floor.'],
    faults: [{ fault: 'Hips lifting off the pad to finish', fix: 'Keep the hips heavy on the bench and stop where the range ends.' }, { fault: 'Dropping the weight on the way down', fix: 'Lower over a slow three-count.' }],
    dosage: S(3, '10-12', 60, '1-0-1-3'),
  },

  // ── squat and lunge ─────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'step-up', match: (n) => has(n, /step[ -]?up|power stairs/), pattern: 'lunge', category: 'strength', skillLayer: 'strength', braceMode: 'set', goals: ['strength', 'knee', 'balance'], clip: 'lunge',
    setup: 'Face a box or step at a height where your thigh is no higher than level, one whole foot on top[, holding {eq}].',
    cues: ['Drive the floor down through your front heel and stand tall on the box.', 'Let the back foot float up off the floor; it is along for the ride.', 'Lower slow, back toe first, to the floor.'],
    faults: [{ fault: 'Pushing off the back foot', fix: 'Lift the back toes so the front heel does the work against the box.' }, { fault: 'Knee caving in on the way up', fix: 'Keep the knee travelling out over your laces.' }],
    dosage: S(3, '8 each side', 60),
  },
  {
    id: 'lunge', match: (n) => has(n, /lunge|split squat|bulgarian|elevated back/) && !has(n, /sprint|jump/), pattern: 'lunge', category: 'strength', skillLayer: 'strength', braceMode: 'set', goals: ['strength', 'balance', 'knee', 'hip'], clip: 'lunge',
    setup: 'Split stance, feet hip-width apart side to side[, holding {eq}].',
    cues: ['Drive the floor down through your front heel.', 'Drop the back knee straight down toward the floor like an elevator.', 'Knees travel out over your laces.'],
    faults: [{ fault: 'Front knee caving in', fix: 'Push the front knee out over your laces.' }, { fault: 'Stance on a tightrope', fix: 'Set the feet on two train tracks on the floor, hip-width apart.' }],
    dosage: S(3, '8 each side', 75),
  },
  {
    id: 'single-leg-squat', match: (n) => has(n, /pistol|single leg high box|one leg barbell squat|single leg.*squat|skater squat|sissy/), pattern: 'squat', category: 'strength', skillLayer: 'strength', braceMode: 'set', goals: ['strength', 'balance', 'knee'], clip: 'squat',
    setup: 'Stand on one leg in front of a box or bench, the other leg reaching forward or back, arms out for balance.',
    cues: ['Sit back toward the box slowly and touch it without dropping.', 'Keep the standing knee travelling out over your laces.', 'Drive the floor away to stand tall.'],
    faults: [{ fault: 'Dropping onto the box', fix: 'Lower on a slow three-count and kiss the box.' }, { fault: 'Knee caving in', fix: 'Push the knee out over your laces the whole rep.' }],
    dosage: S(3, '5 each side', 75), cautions: ['Raise the box until every rep is controlled.'],
  },
  {
    id: 'leg-press-hack', match: (n) => has(n, /leg press|hack squat|machine squat|smith machine squat|smith machine leg press/) && !has(n, /calf/), pattern: 'squat', category: 'strength', skillLayer: 'strength', braceMode: 'set', goals: ['strength', 'hypertrophy'], clip: 'squat', lowLoad: ['back'],
    setup: 'Back flat against the pad, feet hip-width on the platform, toes turned out a little.',
    cues: ['Push the platform away through the whole foot, like pushing the floor away.', 'Lower to the depth where the back stays flat on the pad, then drive back up.', 'Knees travel out over your laces.'],
    faults: [{ fault: 'Hips curling off the pad at the bottom', fix: 'Stop the depth where the back stays flat against the pad.' }, { fault: 'Locking out hard at the top', fix: 'Stop just short of a hard lock; keep the platform moving smooth.' }],
    dosage: S(3, '10-12', 90),
  },
  {
    id: 'squat', match: (n) => has(n, /squat|zercher|frankenstein|plie/) && !has(n, /jump/), pattern: 'squat', category: 'strength', skillLayer: 'strength', braceMode: 'set', goals: ['strength', 'knee', 'hip'], clip: 'squat',
    setup: 'Feet about shoulder-width, toes turned out a little[, {eq} held where the variation says].',
    cues: ['Heel, big toe, little toe: press all three into the floor.', 'Sit down between your heels and push the floor away to stand.', 'Knees travel out over your laces.'],
    faults: [{ fault: 'Heels lifting off the floor', fix: 'Press the heels into the floor; sit to a box if the depth costs the heels.' }, { fault: 'Knees caving in on the way up', fix: 'Push the floor apart: knees out over your laces.' }],
    dosage: S(4, '5-8', 120),
  },
  {
    id: 'leg-extension', match: (n) => has(n, /leg extension|terminal knee/), pattern: 'squat', category: 'strength', skillLayer: 'strength', braceMode: 'none', goals: ['strength', 'knee'], clip: 'idle', lowLoad: ['back', 'hip'],
    setup: 'Sit with the knee lined up with the machine pivot and the pad on the front of the shins.',
    cues: ['Kick the pad up to the top and hold still for a beat.', 'Lower over three seconds back to the start.', 'Hold the handles and keep the seat under you the whole set.'],
    faults: [{ fault: 'Swinging the pad up', fix: 'Lift on a steady two-count and pause at the top.' }, { fault: 'Hips lifting off the seat', fix: 'Hold the handles and keep the hips heavy on the seat.' }],
    dosage: S(3, '10-15', 60, '1-1-2-3'),
  },
  {
    id: 'hip-machine', match: (n) => has(n, /abductor|adductor|adduction|abduction|monster walk|kickback|clam|hip extension|hip flexion/) && !has(n, /tricep/), pattern: 'other', category: 'strength', skillLayer: 'strength', braceMode: 'none', goals: ['hip', 'knee', 'balance'], clip: 'idle', lowLoad: ['back', 'knee', 'shoulder'],
    setup: 'Set up with the hips square and the band, cable or pad where the variation says.',
    cues: ['Push the band or pad out on a slow, smooth path.', 'Pause at the end of the range for a beat.', 'Let the band or pad back in slow, without rocking.'],
    faults: [{ fault: 'Rocking the trunk to move the pad', fix: 'Hold the handles or the floor and keep the belt line still.' }, { fault: 'Snapping back to the start', fix: 'Let the band or pad back in on a slow three-count.' }],
    dosage: S(3, '12-15', 45),
  },
  {
    id: 'calf-raise', match: (n) => has(n, /calf raise|calf press|calf machine|donkey calf|rocking standing calf/) && !has(n, /shrug/), pattern: 'other', category: 'strength', skillLayer: 'tripod', braceMode: 'none', goals: ['ankle', 'vertical', 'speed'], clip: 'idle', lowLoad: ['knee', 'back', 'hip'],
    setup: 'Balls of the feet on a step or plate, heels free, holding a rail[ or {eq}] for balance.',
    cues: ['Push the floor away through the big-toe joint and rise as tall as you can.', 'Hold the top still for a beat.', 'Lower slow until the heels drop below the step: full range.'],
    faults: [{ fault: 'Rolling out to the little toe', fix: 'Keep the big-toe joint heavy on the step as you rise.' }, { fault: 'Bouncing at the bottom', fix: 'Pause for a beat with the heels low, then rise.' }],
    dosage: S(3, '12-15', 45, '1-1-1-3'),
  },

  // ── upper body ────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'push-up', match: (n) => has(n, /push[- ]?ups?\b|push up|pushups|clock push|drop push|plyo push/), pattern: 'push', category: 'strength', skillLayer: 'strength', braceMode: 'set', goals: ['strength', 'shoulder', 'trunk'], clip: 'push', lowLoad: ['knee', 'back'],
    setup: 'Hands a little wider than the shoulders, body in one long line from head to heels.',
    cues: ['Push the floor away.', 'Lower as one plank until your chest is a fist from the floor.', 'Keep the elbows angled back toward your pockets, not out to the walls.'],
    faults: [{ fault: 'Hips sagging toward the floor', fix: 'Brace for a light punch and keep one long line to the floor.' }, { fault: 'Elbows flaring straight out', fix: 'Angle the elbows back toward your pockets.' }],
    dosage: S(3, '8-12', 60),
  },
  {
    id: 'dip', match: (n) => has(n, /\bdips?\b|dip machine|body up|body tricep/), pattern: 'push', category: 'strength', skillLayer: 'strength', braceMode: 'set', goals: ['strength', 'hypertrophy'], clip: 'push',
    setup: 'Hands on the bars or the bench edge, arms straight, body upright.',
    cues: ['Lower slowly until your upper arm is about level, then push the bars down to the floor.', 'Keep the bars close to your sides.', 'Stand tall at the top without shrugging toward your ears.'],
    faults: [{ fault: 'Dropping too deep', fix: 'Stop the depth where the upper arm is level with the bar.' }, { fault: 'Shrugging at the bottom', fix: 'Push the bars down toward the floor to start each rep.' }],
    dosage: S(3, '6-10', 90), cautions: ['Needs comfortable shoulder range at the bottom: a push-up is the easier start.'],
  },
  {
    id: 'bench-press', match: (n) => has(n, /bench press|floor press|chest press|board press|pin press|guillotine|close grip.*press|reverse triceps bench|chain press|leverage.*press|smith.*press|smith machine bench|dumbbell bench/) && !has(n, /shoulder|military|overhead|tricep/), pattern: 'push', category: 'strength', skillLayer: 'strength', braceMode: 'set', goals: ['strength', 'hypertrophy'], clip: 'push', lowLoad: ['knee', 'back'],
    setup: 'Lie on the bench with eyes under the bar or the handles over the chest, feet flat on the floor.',
    cues: ['Bend the bar: try to snap it in half as you lower it.', 'Lower to the middle of the chest, then push the bar back up toward the rack.', 'Keep the feet heavy on the floor the whole set.'],
    faults: [{ fault: 'Bar bouncing off the chest', fix: 'Lower on a two-count and pause the bar a hair above the shirt.' }, { fault: 'Elbows flaring straight out', fix: 'Bend the bar and tuck the elbows slightly toward the pockets.' }],
    dosage: S(4, '5-8', 120), cautions: ['Use a spotter or safety pins when the bar is heavy.'],
  },
  {
    id: 'fly', match: (n) => has(n, /fly|flye|crossover|cross over|iron cross|butterfly|svend|pullover/) && !has(n, /reverse|rear|back fly|jump/), pattern: 'push', category: 'strength', plane: 'transverse', skillLayer: 'strength', braceMode: 'none', goals: ['hypertrophy', 'shoulder'], clip: 'push', lowLoad: ['knee', 'back', 'wrist'],
    setup: 'Hold {eq} with the arms long and a soft bend at the elbows, the bench or stance steady.',
    cues: ['Open the arms wide like hugging a big tree, and stop before the range runs out.', 'Bring the handles together on a smooth arc.', 'Lower slower than you lift.'],
    faults: [{ fault: 'Elbows bending into a press', fix: 'Keep the same soft bend and move the handles on an arc.' }, { fault: 'Dropping too low at the bottom', fix: 'Stop the arc where the handles are level with the bench.' }],
    dosage: S(3, '10-12', 60),
  },
  {
    id: 'overhead-press', match: (n) => has(n, /shoulder press|military|overhead press|arnold|bradford|rocky press|seesaw|see saw|landmine linear|jammer|bent press|para press|anti gravity|neck press|kettlebell.*press|dumbbell press|standing.*press|seated.*press|handstand/) && !has(n, /triceps|bench|chest|floor/), pattern: 'push', category: 'strength', skillLayer: 'strength', braceMode: 'set', goals: ['strength', 'shoulder'], clip: 'push',
    setup: 'Hold {eq} at the front of the shoulders, feet hip-width, ribs stacked over the hips.',
    cues: ['Press the weight straight up toward the ceiling.', 'Finish with the weight stacked over the middle of your feet.', 'Lower slow on the same path back to the start.'],
    faults: [{ fault: 'Leaning back to finish the press', fix: 'Brace for a light punch and press straight up to the ceiling.' }, { fault: 'Weight drifting forward', fix: 'Keep the weight close and finish it over the middle of your feet.' }],
    dosage: S(4, '6-8', 90), cautions: [OVERHEAD_RANGE],
  },
  {
    id: 'raise', match: (n) => has(n, /lateral|front raise|raise|scaption|deltoid|laterals|cuban|crucifix|front.*raise|plate raise|shoulder raise|y raise|power partials/) && !has(n, /calf|leg raise|knee raise|bound|jump|hop/), pattern: 'push', category: 'strength', plane: 'frontal', skillLayer: 'strength', braceMode: 'none', goals: ['shoulder', 'hypertrophy'], clip: 'push', lowLoad: ['knee', 'back'],
    setup: 'Stand or sit tall holding {eq} light, arms long with a soft bend at the elbows.',
    cues: ['Lift the weights out toward the walls on a smooth arc, to about shoulder height.', 'Pause for a beat at the top.', 'Lower slower than you lift.'],
    faults: [{ fault: 'Swinging the weights up', fix: 'Go lighter and lift on a slow two-count.' }, { fault: 'Shrugging toward the ears', fix: 'Reach the weights long toward the walls, away from your ears.' }],
    dosage: S(3, '12-15', 45),
  },
  {
    id: 'rear-delt-face-pull', match: (n) => has(n, /rear delt|reverse fly|back flyes|face pull|band pull apart|reverse machine fly|sled reverse/), pattern: 'pull', category: 'strength', plane: 'transverse', skillLayer: 'strength', braceMode: 'none', goals: ['shoulder', 'posture'], clip: 'pull', lowLoad: ['knee', 'back'],
    setup: 'Hold {eq} with the arms long in front at chest height, stance steady.',
    cues: ['Pull the band apart toward the walls on either side.', 'Pause with the hands level with your shoulders for a beat.', 'Let it back in slow.'],
    faults: [{ fault: 'Shrugging the weight up', fix: 'Reach the hands out toward the walls, away from your ears.' }, { fault: 'Leaning back to finish', fix: 'Stand tall and stop the band where it touches your shirt.' }],
    dosage: S(3, '12-15', 45),
  },
  {
    id: 'rotator', match: (n) => has(n, /external rotation|internal rotation|elbows back/), pattern: 'pull', category: 'prehab', plane: 'transverse', skillLayer: 'joints', braceMode: 'none', goals: ['shoulder', 'posture'], clip: 'pull', lowLoad: ['knee', 'back', 'hip'],
    setup: 'Elbow at your side with a rolled towel under it. Hold the band or cable handle across your front.',
    cues: ['Turn the handle out toward the wall like a gate swinging open.', 'Keep the towel pinned in place the whole rep.', 'Return slow on a three-count.'],
    faults: [{ fault: 'Towel dropping as the elbow drifts', fix: 'Keep the towel in place; the hand travels, the elbow stays.' }, { fault: 'Twisting the trunk to turn further', fix: 'Face the wall ahead and stop the handle where the turn ends.' }],
    dosage: S(2, '12-15', 30, '1-1-1-3'),
  },
  {
    id: 'pull-up', match: (n) => has(n, /\bpull[- ]?ups?\b|\bpullups\b|\bchins?\b|\bchin[- ]?ups?\b|muscle up|rope climb|otis|scapular pull/) && !has(n, /pulldown/), pattern: 'pull', category: 'strength', skillLayer: 'strength', braceMode: 'set', goals: ['strength', 'grip', 'shoulder'], clip: 'pull',
    setup: 'Hang from the bar with straight arms, hands a little wider than the shoulders.',
    cues: ['Pull the bar down to your chest.', 'Drive your elbows toward your back pockets.', 'Lower all the way to a dead hang, slow.'],
    faults: [{ fault: 'Kicking to get over the bar', fix: 'Hold still at the bottom and pull the bar down to your chest.' }, { fault: 'Half reps at the bottom', fix: 'Lower all the way to a dead hang under the bar every rep.' }],
    dosage: S(4, '4-8', 120),
  },
  {
    id: 'pulldown', match: (n) => has(n, /pulldown|pull down|straight arm|overhead lat|v bar pull/), pattern: 'pull', category: 'strength', skillLayer: 'strength', braceMode: 'none', goals: ['strength', 'shoulder'], clip: 'pull', lowLoad: ['knee', 'back'],
    setup: 'Sit with the thighs under the pad, arms long overhead on the bar or the handles.',
    cues: ['Pull the bar down to your upper chest.', 'Drive your elbows toward your back pockets.', 'Let the bar back up slow until the arms are long.'],
    faults: [{ fault: 'Leaning way back to finish', fix: 'Sit tall and pull the bar down to the top of your chest.' }, { fault: 'Pulling behind the head', fix: 'Pull the bar down in front, to your chest.' }],
    dosage: S(3, '8-12', 75),
  },
  {
    id: 'row', match: (n) => has(n, /\brows?\b|t bar|renegade|shotgun|incline bench pull|sled row|mid row/) && !has(n, /upright/), pattern: 'pull', category: 'strength', skillLayer: 'strength', braceMode: 'set', goals: ['strength', 'posture', 'grip'], clip: 'pull',
    setup: 'Set up with the back long and steady[, {eq} hanging at arm\'s length].',
    cues: ['Drive your elbows toward your back pockets.', 'Pull the weight to the bottom of your ribs and hold still for a beat.', 'Lower the weight slow until it hangs at full range.'],
    faults: [{ fault: 'Heaving the trunk to move the weight', fix: 'Go lighter and keep the back still as a table.' }, { fault: 'Shrugging the weight up', fix: 'Pull toward your back pockets, not your ears.' }],
    dosage: S(3, '8-12', 75),
  },
  {
    id: 'upright-row-shrug', match: (n) => has(n, /upright|shrug|\bhigh pull\b/), pattern: 'pull', category: 'strength', skillLayer: 'strength', braceMode: 'none', goals: ['grip', 'hypertrophy'], clip: 'pull',
    setup: 'Stand tall holding {eq} in front of the thighs with straight arms.',
    cues: ['Lift the weight straight up on a close path.', 'Pause for a beat at the top.', 'Lower slow back to the start.'],
    faults: [{ fault: 'Rolling the shoulders in circles', fix: 'Lift straight up toward the ceiling and straight back down.' }, { fault: 'Jerking the weight', fix: 'Go lighter and lift on a two-count.' }],
    dosage: S(3, '10-12', 60), cautions: ['Keep the upright row below shoulder height if the top of the range pinches.'],
  },
  {
    id: 'curl', match: (n) => has(n, /curl/) && !has(n, /leg curl|wrist|finger|reverse plate/), pattern: 'pull', category: 'strength', skillLayer: 'strength', braceMode: 'none', goals: ['hypertrophy', 'grip'], clip: 'pull', lowLoad: ['knee', 'back'],
    setup: 'Hold {eq} with the arms long, elbows at your sides, standing or seated tall.',
    cues: ['Bring the handle up toward your shoulder on a smooth arc.', 'Pause at the top for a beat.', 'Lower the handle slower than you lift it, all the way to the bottom.'],
    faults: [{ fault: 'Swinging the weight up', fix: 'Go lighter and stand still as a post while the handle travels.' }, { fault: 'Elbows drifting forward', fix: 'Keep the elbows by your pockets; only the handle travels.' }],
    dosage: S(3, '10-12', 45, '1-1-1-3'),
  },
  {
    id: 'triceps', match: (n) => has(n, /tricep|pushdown|skull|kickback|extension|jm press|tate press|overhead triceps/) && !has(n, /leg extension|hip extension|back extension|hyperextension/), pattern: 'push', category: 'strength', skillLayer: 'strength', braceMode: 'none', goals: ['hypertrophy'], clip: 'push', lowLoad: ['knee', 'back'],
    setup: 'Hold {eq} with the elbows pointing where the variation says and steady through the set.',
    cues: ['Straighten the arm fully and push the handle toward the floor (or the ceiling).', 'Pause with the arm straight for a beat.', 'Let the handle back slow while the elbow stays parked.'],
    faults: [{ fault: 'Elbows drifting as the weight moves', fix: 'Only the handle travels: park the elbows where they started.' }, { fault: 'Half reps', fix: 'Finish every rep with the arm straight and still.' }],
    dosage: S(3, '10-12', 45),
  },
  {
    id: 'grip', match: (n) => has(n, /wrist|finger|plate pinch|hand squeeze|pronation|supination|reverse plate|one handed hang/), pattern: 'other', category: 'strength', skillLayer: 'strength', braceMode: 'none', goals: ['grip'], clip: 'idle', lowLoad: ['knee', 'back', 'hip', 'shoulder'],
    setup: 'Forearms supported on a bench or the thighs, hands just past the edge, holding {eq}.',
    cues: ['Crush the handle.', 'Move the weight through the full range on a slow, smooth path.', 'Pause at the top for a beat.'],
    faults: [{ fault: 'Lifting the forearms off the bench', fix: 'Keep the forearms heavy on the bench; only the hand travels.' }, { fault: 'Rushing the reps', fix: 'Lower on a slow three-count.' }],
    dosage: S(3, '12-15', 45),
  },
  {
    id: 'neck', match: (n) => has(n, /neck/) && !has(n, /behind the neck|stretch/), pattern: 'other', category: 'strength', skillLayer: 'strength', braceMode: 'none', goals: ['posture'], clip: 'idle',
    setup: 'Sit or lie with the head supported and the hand, plate or harness in place; start very light.',
    cues: ['Press gently into the hand or the plate and hold still.', 'Move slow and small, through a range that stays easy.', 'Breathe smoothly the whole time.'],
    faults: [{ fault: 'Jerking the head through the range', fix: 'Move slow and small, like a nod in slow motion.' }, { fault: 'Going heavy too soon', fix: 'Start with the hand only and hold still for the count.' }],
    dosage: S(2, '10-12', 45), youthOk: false, cautions: ['Start with hand pressure only; add load slowly and only with a coach.'],
  },

  // ── trunk ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'rollout', match: (n) => has(n, /rollout|ab roller|fallout|wheel/), pattern: 'other', category: 'core', skillLayer: 'cylinder', braceMode: 'set', goals: ['trunk'], clip: 'brace',
    setup: 'Kneel (or stand, advanced) with the hands on the wheel, bar or straps under the shoulders.',
    cues: ['Brace for a light punch, then roll the wheel out only as far as your line holds.', 'Pull the wheel back toward the start with the arms long, smooth and slow.', 'Keep the belt buckle tucked toward your chin.'],
    faults: [{ fault: 'Lower back sagging toward the floor', fix: 'Roll out less and keep the belt buckle tucked.' }, { fault: 'Hips leading the return', fix: 'Pull the wheel back on the same path, long arms first, hips following.' }],
    dosage: S(3, '6-10', 60), cautions: [BACK_OFF],
  },
  {
    id: 'plank', match: (n) => has(n, /plank|side bridge|dead bug|bird dog|stomach vacuum|pallof|body saw|hollow/) && !has(n, /push/), pattern: 'rotation', category: 'core', skillLayer: 'cylinder', braceMode: 'set', goals: ['trunk', 'posture'], clip: 'brace', lowLoad: ['knee', 'ankle'],
    setup: 'Set the position the variation names, body in one long line, and start breathing before the clock starts.',
    cues: ['Brace for a light punch, then keep breathing behind it.', 'Hold still: nothing moves but the air.', 'Push the floor away.'],
    faults: [{ fault: 'Hips sagging toward the floor', fix: 'Tuck the belt buckle toward your chin and push the floor away.' }, { fault: 'Holding the breath', fix: 'Breathe in through the nose, out long, without the line moving.' }],
    dosage: T(3, 30, 45),
  },
  {
    id: 'rotation', match: (n) => has(n, /twist|wood ?chop|cable lift|judo|landmine 180|rotation|side bend|wipers|car drivers|plate twist|full twist/) && !has(n, /external|internal|fly|flye|torso rotation|wrist/), pattern: 'rotation', category: 'core', plane: 'transverse', skillLayer: 'cylinder', braceMode: 'set', goals: ['trunk', 'power'], clip: 'rotate',
    setup: 'Stand or sit tall[ holding {eq} in front], feet set wide enough to stay still.',
    cues: ['Turn the weight across from hip to opposite shoulder on a smooth path.', 'Let your hips and upper body turn together, like a door swinging.', 'Control the return: slower back than out.'],
    faults: [{ fault: 'Whipping the weight around', fix: 'Go lighter and move on a smooth two-count.' }, { fault: 'Feet shuffling', fix: 'Root the feet into the floor and turn from the middle.' }],
    dosage: S(3, '8 each side', 45),
  },
  {
    id: 'flexion', match: (n) => has(n, /crunch|sit[- ]?up|leg raise|knee raise|knee hip raise|tuck|jackknife|v up|flutter|scissor kick|pull[- ]?in|heel touch|toe touchers|leg lift|elbow to knee|hanging pike|cocoons|leg tucks|bottoms up|hip raise on parallel|gorilla|frog sit|janda|reverse crunch|leg pull in/) && !has(n, /jump|standing toe/), pattern: 'other', category: 'core', skillLayer: 'cylinder', braceMode: 'set', goals: ['trunk'], clip: 'brace', lowLoad: ['knee', 'ankle'],
    setup: 'Set up on the floor, a bench or the bar the variation names, lower back steady.',
    cues: ['Curl the belt buckle toward your ribs on a slow, smooth path.', 'Breathe out as you curl.', 'Lower slow until you are back at the start.'],
    faults: [{ fault: 'Yanking on the head or swinging the legs', fix: 'Move on a slow two-count; hands light behind the ears or across the chest.' }, { fault: 'Lower back arching off the floor', fix: 'Shorten the range so the lower back stays heavy on the floor.' }],
    dosage: S(3, '10-15', 45),
  },

  // ── carries and strongman ────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'carry', match: (n) => has(n, /walk|carry|yoke|farmer|rickshaw|drag|sled push|prowler|keg|load|atlas|stone|tire|circus|conan|log lift|car deadlift/) && !has(n, /lunge|treadmill|trail/), pattern: 'carry', category: 'strength', skillLayer: 'strength', braceMode: 'set', goals: ['grip', 'trunk', 'strength', 'conditioning'], clip: 'carry',
    setup: 'Pick up (or set up behind) {eq} with a flat back, then stand tall before the first step.',
    cues: ['Grow tall toward the ceiling.', 'Crush the handle.', 'Take short, quiet steps and keep the load still.'],
    faults: [{ fault: 'Leaning toward the heavy side', fix: 'Grow tall toward the ceiling; the load hangs, you stay straight.' }, { fault: 'Long stomping steps', fix: 'Short, quiet steps under the load.' }],
    dosage: { sets: 4, meters: 30, restSec: 75 }, cautions: ['Strongman implements need a coach and a clear space.'],
  },

  // ── plyometrics, throws, speed and conditioning ───────────────────────────────────────────────────────────────────
  {
    id: 'throw', match: (n, r) => has(n, /medicine ball|throw|slam|chest push|chest pass|return push|scoop|heavy bag thrust|catch and overhead/) || (r.category === 'plyometrics' && r.equipment === 'medicine ball'), pattern: 'push', category: 'power', skillLayer: 'wake-up', braceMode: 'reflex', goals: ['power'], clip: 'throw', lowLoad: ['knee'],
    setup: 'Hold the med ball at your chest, overhead or at your hip, with a wall, partner or open ground ahead.',
    cues: ['Throw it through the wall: full speed every rep.', 'Push the floor away and let the throw start from the ground.', 'Reset still between reps so every throw is fast.'],
    faults: [{ fault: 'Arms-only throws', fix: 'Push the floor away first; the arms finish the throw.' }, { fault: 'Slow, tired reps', fix: 'Rest longer: every throw should be the fastest one yet.' }],
    dosage: S(4, '5', 60),
  },
  {
    id: 'depth-jump', match: (n) => has(n, /depth jump|depth leap|drop push|incline push up depth/), pattern: 'locomotion', category: 'plyometric', skillLayer: 'jump-land', braceMode: 'reflex', goals: ['vertical', 'power', 'landing'], clip: 'jump', youthOk: false,
    setup: 'Stand on a low box, toes at the edge, with open floor in front.',
    cues: ['Step off, do not jump off.', 'Touch the floor and leave it fast, like the floor is hot.', 'Land quiet: as little sound as you can.'],
    faults: [{ fault: 'Sinking deep on the contact', fix: 'Lower the box until the contact is short and springy.' }, { fault: 'Loud landings', fix: 'Land quiet, on the whole foot, knees over the laces.' }],
    dosage: C(4, 5, 90), cautions: [LANDING, 'Advanced: drop landings stick first, for weeks, before depth jumps.'],
  },
  {
    id: 'jump', match: (n, r) => (r.category === 'plyometrics' || has(n, /jump|hop|bound|leap|skip|star jump|scissors|frog hops|skating|push off|split jump|burpee|rocket/)) && !has(n, /push[- ]?up|isometric/), pattern: 'locomotion', category: 'plyometric', skillLayer: 'jump-land', braceMode: 'reflex', goals: ['vertical', 'power', 'landing'], clip: 'jump', lowLoad: ['back'],
    setup: 'Stand in an athletic stance with open floor (and the box or cones the variation names) in front.',
    cues: ['Push the floor away hard and fast.', 'Land quiet: as little sound as you can.', 'Stick it still and silent for a two-count before the next rep.'],
    faults: [{ fault: 'Knees caving in on the landing', fix: 'Land with the knees out over your laces and stick it.' }, { fault: 'Loud, heavy landings', fix: 'Land quiet, like a cat; shorten the jump until you can.' }],
    dosage: C(4, 5, 75), cautions: [LANDING],
  },
  {
    id: 'sprint-drill', match: (n) => has(n, /sprint|start technique|acceleration|wall drill|butt kick|carioca|fast skipping|arm drill|single cone|side hop|claw/), pattern: 'locomotion', category: 'speed-agility', skillLayer: 'speed', braceMode: 'reflex', goals: ['speed', 'agility'], clip: 'sprint',
    setup: 'Mark out the distance with cones on a flat, dry surface; start from a two-point stance.',
    cues: ['Push the ground back behind you.', 'Lean into the run like you are falling forward, then catch yourself.', 'Quick, quiet contacts under you.'],
    faults: [{ fault: 'Standing straight up in the first steps', fix: 'Stay low and push the ground back for the first five steps.' }, { fault: 'Reaching out with the foot', fix: 'Strike the ground under you, not out in front.' }],
    dosage: { sets: 6, meters: 20, restSec: 90 },
  },
  {
    id: 'cardio', match: (n, r) => r.category === 'cardio' || has(n, /bike|bicycling|rowing|treadmill|elliptical|stairmaster|step mill|jogging|running|trail|battling ropes|rope jumping|mountain climber/), pattern: 'locomotion', category: 'conditioning', skillLayer: null, braceMode: 'none', goals: ['conditioning'], clip: 'sprint', lowLoad: ['back'],
    setup: 'Set the machine or the space up so you can move at a steady pace from the first minute.',
    cues: ['Find a rhythm you can hold, then hold it.', 'Breathe out long every few strides or strokes.', 'Stay smooth: the same tempo at the end as at the start.'],
    faults: [{ fault: 'Going out too fast', fix: 'Start at a pace you could talk at, then build.' }, { fault: 'Form falling apart late', fix: 'Shorten the effort or slow the tempo until it stays smooth.' }],
    dosage: { sets: 1, seconds: 600, restSec: 0 },
  },
  {
    id: 'dynamic-warmup', match: (n, r) => (has(n, /inchworm|groiner|world'?s greatest|crawl|circles|leg swings|torso rotation|standing toe touches|balance board|downward facing balance|windmills|iron crosses|crossover reverse lunge|frog hops/) && !has(n, /sled/)) || (r.category === 'stretching' && has(n, /leg raises/)), pattern: 'mobility', category: 'mobility', skillLayer: 'wake-up', braceMode: 'none', goals: ['warmup', 'mobility'], clip: 'stretch',
    setup: 'Clear a few metres of floor; move through the drill at an easy pace first.',
    cues: ['Move smooth and slow at first, then let the range grow.', 'Breathe out long at the end of each reach.', 'Keep the rhythm steady, like a slow beat.'],
    faults: [{ fault: 'Rushing the reps', fix: 'Slow the rhythm and own the end of each range.' }, { fault: 'Forcing the range', fix: 'Stop at the first firm pull; it opens over the set.' }],
    dosage: S(1, '6-8 each side', 0),
  },
];

/**
 * The order families are tried in: the first match wins, so a name-specific family (a crawl, a sprint drill, a
 * crunch) comes before the broad ones (any row the seed filed under "stretching", any row with "raise" in its name).
 */
const ORDER = [
  'roll', 'dynamic-warmup', 'sprint-drill', 'cardio', 'depth-jump', 'kb-swing', 'kb-clean-snatch', 'snatch', 'clean', 'jerk-press',
  'back-extension', 'rollout', 'plank', 'rotation', 'flexion', 'get-up-windmill',
  'stretch-hamstring', 'stretch-quad-hip', 'stretch-hip', 'stretch-calf', 'stretch-upper',
  'good-morning', 'rdl', 'deadlift', 'bridge-thrust', 'leg-curl', 'step-up', 'lunge', 'single-leg-squat', 'leg-press-hack', 'squat',
  'leg-extension', 'hip-machine', 'calf-raise', 'throw', 'jump', 'push-up', 'dip', 'bench-press', 'fly', 'overhead-press', 'raise',
  'rear-delt-face-pull', 'rotator', 'pull-up', 'pulldown', 'row', 'upright-row-shrug', 'curl', 'triceps', 'grip', 'neck', 'carry',
] as const;

export const SEED_FAMILIES: readonly SeedFamily[] = ORDER.map((id) => {
  const f = FAMILY_DEFS.find((x) => x.id === id);
  if (!f) throw new Error(`seed family ${id} is not defined`);
  return f;
});
if (SEED_FAMILIES.length !== FAMILY_DEFS.length) throw new Error('every seed family must be placed in ORDER');

/** The fallback for a row no family matched: honest, general words; the validator still lints them. */
export const GENERAL_FAMILY: SeedFamily = {
  id: 'general', match: () => true, pattern: 'other', category: 'strength', skillLayer: null, braceMode: null, goals: ['strength'], clip: 'idle',
  setup: 'Set up the way the exercise name describes[, with {eq}] and enough space to move.',
  cues: ['Move on a smooth path at a steady tempo.', 'Breathe out on the hardest part of the rep.', 'Stop the set when the path stops being smooth.'],
  faults: [{ fault: 'Rushing the reps', fix: 'Slow to a steady tempo: two counts up, two counts down.' }, { fault: 'Losing the start position', fix: 'Reset still between reps.' }],
  dosage: S(3, '8-12', 60),
};
