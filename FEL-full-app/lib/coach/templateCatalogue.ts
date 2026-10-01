// lib/coach/templateCatalogue.ts — MIRROR-COACH P8 (2026-09-25 pass, built 2026-09-29): the exercises FEL's program
// templates (lib/coach/templates/) are written with, each with its cues, its common faults and its place on a
// VARIATION LADDER, as rows a coach's catalogue takes as they are.
//
// WHAT WAS MISSING. The crossref (crossref-wf_dfad67b3-209.json, matrix "Variation ladders per pattern" and "Programs for
// any schedule and equipment"): ProgramExercise.regressionOfId / progressionOfId were stored and nothing wrote them — the
// seed's knowledge base has no progressions, the owner's Playbook ch8 has three ladders as text only, and /workout picked
// from fixed pools with no ladder position. No schedule template shipped; a coach wrote every week by hand. So there was
// no "easier version" for Today to show (P2 renders one when the link exists), nothing for the protocol gate to step a
// jump DOWN to, and nothing for a later week to step UP to.
//
// WHAT THIS IS. One ladder per movement, easiest rung first (TEMPLATE_LADDERS). Every exercise sits on exactly one
// ladder; its easier version is the rung below and its harder one the rung above — the P2 catalogue's own reading of the
// two link columns (lib/coach/catalogue.ts: regressionOfId = "step down to", progressionOfId = "step up to"). A template
// uses middle rungs only, so every exercise it names has both (templates/index.test.ts holds that). When a coach clones a
// template (lib/coach/builderServer.ts 'clone_template'), EVERY rung of every ladder it uses is seeded into their own
// catalogue and linked both ways there, so a link never points outside the coach's rows (catalogueServer.ts linksOk's
// rule: a link names another row of THE SAME coach).
//
// IMPACT. `impact` marks what leaves the floor and lands: 'plyometric' (a jump, a hop, a bound) or 'depth_drop' (a step
// off a box into a landing). Three readers already decide "is this jump work" on their own terms, and this data agrees
// with all three (templateCatalogue checks in templates/index.test.ts): lib/coach/today.ts isJumpWork (skill layer
// Jump & Land or category plyometric — the warm-up's youth gate), lib/workout/plan-revision.ts isPlyometric and
// lib/workout/plan-generator.ts isDepthDrop (by name — /workout's revision). Every impact exercise has an impact-free rung
// below it (impactFreeStepDown): that is what the protocol gate (P8 rule (b)) puts in its place when the gate is shut,
// "the ladder's easier step", walked down past any rung that still lands (Box Jump → Countermovement Jump → Fast
// Bodyweight Squat). A depth drop exists ONLY as the top rung of the vertical-jump ladder: no FEL template programs one;
// it is there so the Box Jump has a harder version, and reaching it is a coach's call.
//
// WHOSE WORDS (owner decision #8, the IP rule). The names are the plain names strength coaches use for these movements.
// Where a rung, a ladder or a dose is the owner's, the row says so (`source`: the Neuro-Mechanic Playbook chapter) — the
// hinge, split-squat and bridge ladders are ch8's "Progressions Without a Weight Room" with one FEL rung added below
// each (Wall Hip Hinge, Supported Split Squat) so the youth templates' first rung still has an easier version; the pogo
// ladder is ch6's "Oscillatory Pogo Progression"; the push-up and the breathing plank are ch8's. Everything else — every
// other cue, fault and fix — is FEL's, written for this file. No book name, method name, table or program; the copy is
// linted by templates/index.test.ts (book words, claims words, lib/share/screen.ts, max-effort words, pins).
//
// HONESTY. Cues say what to do; faults say what a coach sees and what to do instead. Nothing here names a condition,
// promises an outcome or says an exercise lowers the chance of anything.
//
// MIRROR-COACH P9 (2026-09-30) — THE EXTERNAL-FOCUS POLICY (lib/coach/cueLint.ts; its test lints every cue and fix here).
// 35 lines were reworded in FEL's words, meaning kept: no line names a muscle ("squeeze your glutes", "glutes squeezed",
// "biceps finishing near the ears" are gone), "squeeze at the top" is "hold the top still", and every brace uses the
// owner's own Playbook image (taxonomy.ts 'light-punch', "brace for a light punch") instead of a bare "brace". A fault's
// fix — what the athlete thinks about mid-set — leads with the floor, the bar, the wall or the ceiling when it names a
// body part. Rung names ("Glute Bridge, 5-Second Squeeze") are the owner's ch8 names and are not cues; they stay.
//
// Pure data + lookups: no Prisma client value (types only), no DOM.
import type { BraceMode, MovementPattern } from '@/public/_prisma/client';
import type { CommonFault } from './catalogue';

// ── the row ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** What an exercise does on landing: nothing (null), a jump/hop/bound, or a drop off a box into a landing. */
export type TemplateImpact = 'plyometric' | 'depth_drop' | null;

/** The catalogue row a template exercise becomes (lib/coach/catalogue.ts CleanCatalogueItem, less the two links). */
export interface TemplateCatalogueRow {
  name: string;
  category: string;
  pattern: MovementPattern;
  braceMode: BraceMode;
  skillLayer: string;
  defaultTempo: string;
  equipment: string[];
  primaryCues: string[];
  commonFaults: CommonFault[];
}

export interface TemplateExercise {
  /** Stable slug; templates name exercises by it. */
  key: string;
  catalogue: TemplateCatalogueRow;
  impact: TemplateImpact;
  /** 'fel', or the owner's Playbook chapter where the rung, ladder or dose is the owner's. */
  source: string;
}

type Opts = Partial<Pick<TemplateCatalogueRow, 'equipment' | 'commonFaults' | 'braceMode' | 'skillLayer' | 'category'>> & { impact?: TemplateImpact; source?: string };

const LOWER = 'lower-body', PUSH = 'upper-push', PULL = 'upper-pull', CORE = 'core', PLYO = 'plyometric';
const f = (fault: string, correctionCue: string): CommonFault => ({ fault, correctionCue });

/** One exercise. Category and brace follow the pattern unless the row says otherwise; strength is the default layer. */
function x(key: string, name: string, pattern: MovementPattern, defaultTempo: string, primaryCues: string[], o: Opts = {}): TemplateExercise {
  const category = o.category ?? (o.impact ? PLYO
    : pattern === 'push' ? PUSH : pattern === 'pull' ? PULL : pattern === 'carry' || pattern === 'other' || pattern === 'rotation' ? CORE : LOWER);
  return {
    key,
    catalogue: {
      name, category, pattern, braceMode: o.braceMode ?? (o.impact ? 'reflex' : 'set'), skillLayer: o.skillLayer ?? (o.impact ? 'jump-land' : 'strength'),
      defaultTempo, equipment: o.equipment ?? [], primaryCues, commonFaults: o.commonFaults ?? [],
    },
    impact: o.impact ?? null,
    source: o.source ?? 'fel',
  };
}

// ── the ladders, easiest rung first ──────────────────────────────────────────────────────────────────────────────────

export interface TemplateLadder {
  id: string;
  /** Every rung trains this pattern (a step up or down never changes what the week covers). */
  pattern: MovementPattern;
  rungs: readonly TemplateExercise[];
  /** 'fel', or where the owner wrote the ladder. */
  source: string;
}

const L = (id: string, pattern: MovementPattern, rungs: TemplateExercise[], source = 'fel'): TemplateLadder => ({ id, pattern, rungs, source });

const CH8 = 'playbook ch8 (Progressions Without a Weight Room)';
const CH6_POGO = 'playbook ch6 (The Oscillatory Pogo Progression)';

export const TEMPLATE_LADDERS: readonly TemplateLadder[] = [
  // ── bodyweight (a backpack, two bags, a chair or step, a sturdy door frame, a towel: what a home has) ──
  L('bw-squat', 'squat', [
    x('chair-box-squat', 'Chair Box Squat', 'squat', '3-0-1-0', [
      'Sit back to a chair, touch it lightly, stand straight back up.',
      'Feet a little wider than hips, the whole foot pressing down.',
    ], { equipment: ['chair'], commonFaults: [f('Dropping onto the chair', 'Lower slow enough to stop just above it.')] }),
    x('tempo-bw-squat', 'Tempo Bodyweight Squat', 'squat', '3-0-1-0', [
      'Three seconds down, stand up at a normal speed.',
      'Knees travel out over your laces.',
      'Reach toward the wall in front of you as you sit, for balance.',
    ], { commonFaults: [
      f('Heels lift at the bottom', 'Sit a little less deep and keep the whole foot pressing into the floor.'),
      f('Knees drift in on the way up', 'Spread the floor apart with your feet as you stand.'),
    ] }),
    x('backpack-hug-squat', 'Backpack Hug Squat', 'squat', '3-0-1-0', [
      'Hug a loaded backpack to your chest, elbows down.',
      'Sit down between your heels, chest tall, then stand by pushing the floor away.',
    ], { equipment: ['backpack'], commonFaults: [f('The chest folds forward', 'Squeeze the bag tighter and lead the stand with your chest.')] }),
    x('backpack-hug-squat-pause', 'Backpack Hug Squat, 3-Second Pause', 'squat', '2-3-1-0', [
      'The hug squat, then hold still at the bottom for three seconds.',
      'Stay braced for a light punch through the pause, then drive up.',
    ], { equipment: ['backpack'] }),
  ]),
  L('bw-hinge', 'hinge', [
    x('wall-hip-hinge', 'Wall Hip Hinge', 'hinge', '2-1-1-0', [
      'Stand a foot in front of a wall, your back to it.',
      'Push your hips back until they touch the wall, back long, then stand tall.',
    ]),
    x('bw-rdl-hold', 'Bodyweight RDL, 3-Second Hold', 'hinge', '2-3-1-0', [
      'Push the wall behind you with your hips, hands sliding down the fronts of your thighs.',
      'Stop at the depth where the back stays long, hold three seconds, then stand tall.',
    ], { source: CH8, commonFaults: [f('The back rounds to reach lower', 'Stop higher: the depth comes from the hips moving back, not the hands going down.')] }),
    x('backpack-rdl', 'Backpack RDL', 'hinge', '3-0-1-0', [
      'Hold a loaded backpack in front of your thighs.',
      'Push the hips back toward the wall behind you with a long back, then stand tall.',
    ], { source: CH8, equipment: ['backpack'], commonFaults: [f('The knees bend into a squat', 'Soft knees that stay put: the hips do the travelling.')] }),
    x('sl-rdl-supported', 'Single-Leg RDL Toe Touch, Supported', 'hinge', '3-0-1-0', [
      'One hand on a wall or chair, your weight on the standing leg.',
      'Reach the free leg back as the chest comes down, hips square to the floor.',
    ], { source: CH8, equipment: ['chair'], commonFaults: [f('The free leg\'s hip opens toward the ceiling', 'Point the back toes at the floor the whole rep.')] }),
    x('sl-rdl-free', 'Single-Leg RDL, Free Stand', 'hinge', '3-0-1-0', [
      'No support: reach for the wall ahead with your hands and the wall behind with your back heel.',
      'Press the floor with the standing foot\'s heel, big toe and little toe.',
    ], { source: CH8 }),
  ], CH8),
  L('bw-bridge', 'hinge', [
    x('glute-bridge-squeeze', 'Glute Bridge, 5-Second Squeeze', 'hinge', '2-0-1-5', [
      'On your back, knees bent, feet flat and close enough to brush your heels.',
      'Breathe out as the hips rise, then hold the top still for five seconds.',
    ], { source: CH8 }),
    x('glute-bridge-close', 'Glute Bridge, Feet Close', 'hinge', '2-0-1-3', [
      'Walk the feet in closer to the hips than a normal bridge.',
      'Push the floor away through your heels until knees, hips and shoulders make one straight line.',
    ], { source: CH8, commonFaults: [f('The lower back arches at the top', 'Stop rising at a straight line, and breathe out.')] }),
    x('sl-bridge-squeeze', 'Single-Leg Bridge, 5-Second Squeeze', 'hinge', '2-0-1-5', [
      'One foot down, the other knee pulled toward your chest.',
      'Drive the floor away through the heel, hips level, and hold the top still for five seconds.',
    ], { source: CH8, commonFaults: [f('One hip drops at the top', 'Lift less high, until the belt line stays level.')] }),
    x('sl-bridge-backpack', 'Single-Leg Bridge with a Backpack', 'hinge', '2-0-1-5', [
      'A loaded backpack across the hips, held with both hands.',
      'The same single-leg bridge and the same five-second hold at the top.',
    ], { source: CH8, equipment: ['backpack'] }),
  ], CH8),
  L('bw-split', 'lunge', [
    x('supported-split-squat', 'Supported Split Squat', 'lunge', '2-1-1-0', [
      'One hand on a wall or chair, feet about two shoulder-widths apart front to back.',
      'Lower the back knee straight down, then drive up through the front heel.',
    ], { equipment: ['chair'] }),
    x('split-squat-hold', 'Split Squat, 3-Second Hold', 'lunge', '2-3-1-0', [
      'The back knee hovers just above the floor for three seconds.',
      'Drive the floor away through the front heel; the front shin stays close to upright.',
    ], { source: CH8, commonFaults: [f('The body drifts forward over the front foot', 'Think straight down and straight up, like an elevator.')] }),
    x('rfe-split-squat', 'Rear-Foot Elevated Split Squat', 'lunge', '3-0-1-0', [
      'Back foot laces-down on a step or chair behind you.',
      'Lower until the back knee nearly touches the floor, then drive the floor away through the front heel.',
    ], { source: CH8, equipment: ['step or chair'], commonFaults: [f('The front heel lifts', 'Set the front foot a little further from the step.')] }),
    x('rfe-split-squat-slow', 'Rear-Foot Elevated Split Squat, 4-Second Lower', 'lunge', '4-0-1-0', [
      'Four seconds on the way down, a normal speed up.',
      'When every rep is steady, the next step is light dumbbells.',
    ], { source: CH8, equipment: ['step or chair'] }),
  ], CH8),
  L('bw-reverse-lunge', 'lunge', [
    x('supported-reverse-lunge', 'Supported Reverse Lunge', 'lunge', '2-0-1-0', [
      'A hand on a wall; step back into a lunge, then step forward to stand.',
      'Most of your weight stays on the front foot.',
    ]),
    x('reverse-lunge', 'Reverse Lunge', 'lunge', '2-0-1-0', [
      'Step back softly, the back knee toward the floor.',
      'Drive the floor down through your front heel to come back up.',
    ], { commonFaults: [f('Short steps that tip you forward', 'Step back a longer way along the floor, so the front shin can stay near upright.')] }),
    x('backpack-reverse-lunge', 'Backpack Reverse Lunge', 'lunge', '2-0-1-0', [
      'Hug a loaded backpack to your chest.',
      'The same step back, then drive the floor away through the front heel.',
    ], { equipment: ['backpack'] }),
  ]),
  L('bw-push', 'push', [
    x('wall-push-up', 'Wall Push-Up', 'push', '3-0-1-0', [
      'Hands on a wall at chest height, the body in one straight line.',
      'Lower the chest to the wall, then push the wall away.',
    ]),
    x('incline-push-up', 'Incline Push-Up', 'push', '3-0-1-0', [
      'Hands on a bench, a table edge or a stair, the body in one straight line.',
      'Three seconds down, then push the floor away.',
    ], { equipment: ['bench or sturdy table'], commonFaults: [f('The hips sag toward the floor', 'Brace for a light punch and hold one straight line from the bench to your heels.')] }),
    x('push-up', 'Push-Up', 'push', '3-0-1-0', [
      'Spread the shoulder blades apart before you lower: push the floor away.',
      'Three seconds down toward the floor, elbows about 45 degrees from your body.',
    ], { source: 'playbook ch8 (Scapular-Controlled Push-Up)', commonFaults: [f('The elbows flare out wide', 'Screw the hands into the floor and bring the elbows in toward your sides.')] }),
    x('feet-elevated-push-up', 'Feet-Elevated Push-Up', 'push', '3-0-1-0', [
      'Feet on a step or chair, hands on the floor.',
      'The same straight line and the same three seconds down.',
    ], { equipment: ['step or chair'] }),
  ]),
  L('bw-pike', 'push', [
    x('hands-elevated-pike', 'Hands-Elevated Pike Push-Up', 'push', '2-0-1-0', [
      'Hands on a bench, hips high so the body makes an upside-down V.',
      'Lower the top of your head toward the bench, then press back up.',
    ], { equipment: ['bench or sturdy table'] }),
    x('pike-push-up', 'Pike Push-Up', 'push', '2-0-1-0', [
      'Hands on the floor, hips high, heels lifted.',
      'Lower your head toward a spot just in front of your hands, then press away.',
    ], { commonFaults: [f('The hips drop and it turns into a push-up', 'Walk the feet in along the floor, closer to the hands, so the hips stay high.')] }),
    x('feet-elevated-pike', 'Feet-Elevated Pike Push-Up', 'push', '2-0-1-0', [
      'Feet on a step or chair, hips stacked high over the hands.',
      'Lower slow, then press up.',
    ], { equipment: ['step or chair'] }),
  ]),
  L('bw-door-row', 'pull', [
    x('door-row-upright', 'Door Frame Row, Upright', 'pull', '2-0-1-1', [
      'Hold both sides of a sturdy door frame, feet close to it, lean back a little.',
      'Pull your chest to the frame, elbows toward your back pockets.',
    ], { equipment: ['sturdy door frame'] }),
    x('door-row', 'Door Frame Row', 'pull', '2-0-1-1', [
      'Hold both sides of a sturdy door frame, walk the feet in and lean back with a straight body.',
      'Pull your chest to the door frame fast, lower slow.',
    ], { equipment: ['sturdy door frame'], commonFaults: [f('The hips sag as you pull', 'Stay one straight plank from the door frame to your heels as you pull.')] }),
    x('door-row-single', 'Single-Arm Door Frame Row', 'pull', '2-0-1-1', [
      'One hand on the frame, feet in, lean back.',
      'Pull straight toward the door frame without letting the body turn toward the free arm.',
    ], { equipment: ['sturdy door frame'], commonFaults: [f('The body twists open', 'Lean back less until you can pull square.')] }),
    x('door-row-single-slow', 'Single-Arm Door Frame Row, 3-Second Lower', 'pull', '3-0-1-1', [
      'The same one-arm row, three seconds on the way back out.',
    ], { equipment: ['sturdy door frame'] }),
  ]),
  L('bw-backpack-row', 'pull', [
    x('supported-backpack-row', 'Supported One-Arm Backpack Row', 'pull', '2-0-1-1', [
      'One hand on a chair, back long, the backpack hanging from the other hand.',
      'Pull the bag toward your hip, lower slow.',
    ], { equipment: ['backpack', 'chair'] }),
    x('backpack-row', 'Bent-Over Backpack Row', 'pull', '2-0-1-1', [
      'Hinge forward with a long back, both hands on a loaded backpack.',
      'Pull the bag to your lower chest, elbows toward your back pockets.',
    ], { equipment: ['backpack'], commonFaults: [f('The chest rises to help the pull', 'Keep the hinge frozen and move only the bag.')] }),
    x('backpack-row-squeeze', 'Bent-Over Backpack Row, 3-Second Squeeze', 'pull', '2-0-1-3', [
      'The same row; hold the bag in for three seconds each rep.',
    ], { equipment: ['backpack'] }),
  ]),
  L('bw-prone', 'pull', [
    x('prone-t', 'Prone T Raise', 'pull', '1-1-1-1', [
      'Face down, arms out to the sides like a T, thumbs up.',
      'Lift the arms a little way off the floor, lower slow.',
    ]),
    x('prone-yt', 'Prone Y-T Raise', 'pull', '1-1-1-1', [
      'Face down, forehead on a folded towel.',
      'Lift the arms off the floor in a Y and lower, then in a T and lower. That is one rep.',
    ], { equipment: ['towel'], commonFaults: [f('The head lifts with the arms', 'Keep the forehead on the towel and let only the arms move.')] }),
    x('prone-yt-hold', 'Prone Y-T Raise, 3-Second Holds', 'pull', '1-0-1-3', [
      'The same Y and T, each held up for three seconds.',
    ], { equipment: ['towel'] }),
  ]),
  L('bw-carry-side', 'carry', [
    x('farmer-hold-bags', 'Two-Bag Farmer Hold', 'carry', '0-0-0-0', [
      'A loaded bag in each hand; stand tall and still.',
      'Stay ready for a light punch, and keep breathing.',
    ], { equipment: ['two bags'] }),
    x('farmer-carry-bags', 'Two-Bag Farmer Carry', 'carry', '0-0-0-0', [
      'A loaded bag or a water jug in each hand.',
      'Walk tall with short, quiet steps.',
    ], { equipment: ['two bags'], commonFaults: [f('The shoulders creep up toward the ears', 'Let the bags pull the shoulders down and grow tall.')] }),
    x('suitcase-carry', 'Suitcase Carry', 'carry', '0-0-0-0', [
      'One loaded bag in one hand, like a suitcase.',
      'Walk without leaning toward or away from the bag.',
    ], { equipment: ['one bag'], commonFaults: [f('Leaning away from the bag', 'Grow tall toward the ceiling and keep both shoulders level.')] }),
    x('suitcase-march', 'Suitcase March', 'carry', '0-0-0-0', [
      'One bag in one hand; march slowly, the knee up to hip height.',
      'Stay level each time a foot leaves the floor.',
    ], { equipment: ['one bag'] }),
  ]),
  L('bw-carry-front', 'carry', [
    x('backpack-hug-hold', 'Backpack Hug Hold', 'carry', '0-0-0-0', [
      'Hug a loaded backpack high on your chest and stand tall.',
      'Stay ready for a light punch, and keep breathing.',
    ], { equipment: ['backpack'] }),
    x('backpack-hug-carry', 'Backpack Hug Carry', 'carry', '0-0-0-0', [
      'Hug a loaded backpack high on your chest.',
      'Walk tall; do not lean back to hold it.',
    ], { equipment: ['backpack'], commonFaults: [f('Leaning back to hold the bag', 'Pull the bag in closer and stand tall over your hips.')] }),
    x('backpack-hug-march', 'Backpack Hug March', 'carry', '0-0-0-0', [
      'The same hug; march slowly, each knee rising toward the backpack.',
      'Stay tall each time a foot leaves the floor.',
    ], { equipment: ['backpack'] }),
  ]),
  L('plank', 'other', [
    x('incline-breathing-plank', 'Incline Breathing Plank', 'other', '0-0-0-0', [
      'Forearms on a bench, the body in one straight line.',
      'Breathe in for 4 and out for 6, ready for a light punch the whole time.',
    ], { skillLayer: 'cylinder', equipment: ['bench or sturdy table'] }),
    x('breathing-plank', 'Breathing Plank', 'other', '0-0-0-0', [
      'Forearm plank, elbows under the shoulders, the body in one straight line.',
      'Brace for a light punch, then breathe: in for 4, out for 6. No breath holding.',
    ], { skillLayer: 'cylinder', source: 'playbook ch8 (Breathing Plank)', commonFaults: [f('Holding the breath to stay still', 'Shorten the set and keep breathing; the time comes back.')] }),
    x('breathing-plank-taps', 'Breathing Plank with Shoulder Taps', 'other', '0-0-0-0', [
      'High plank, feet wide; tap one shoulder, then the other.',
      'Keep breathing and hold still: the taps should not rock the hips.',
    ], { skillLayer: 'cylinder' }),
  ]),

  // ── jumps (adult templates only, in Prime, behind the protocol gate) ──
  L('jump-vertical', 'squat', [
    x('fast-bw-squat', 'Fast Bodyweight Squat', 'squat', '2-0-0-0', [
      'Sit down under control, then stand up as fast as you can.',
      'Heels stay on the floor the whole time.',
    ], { skillLayer: 'wake-up' }),
    x('cmj-stick', 'Countermovement Jump and Stick', 'squat', '0-0-0-0', [
      'Dip fast to a comfortable depth and jump straight up.',
      'Land quiet on both feet and stick it still for a two-count.',
    ], { impact: 'plyometric', source: 'playbook ch6 (The Countermovement Is Where the Jump Is Won)', commonFaults: [
      f('A loud, stiff landing', 'Land quiet on the balls of the feet — ankles, knees and hips bend together.'),
      f('The knees cave in on the landing', 'Jump lower and land with the knees over your laces.'),
    ] }),
    x('box-jump-stick', 'Box Jump and Stick', 'squat', '0-0-0-0', [
      'A low box, knee height or lower. Dip, jump up onto it, land quiet.',
      'Stand up tall on the box, then step down. Never jump down.',
    ], { impact: 'plyometric', equipment: ['plyo box'], commonFaults: [f('Landing in a deep squat on the box', 'Use a lower box: land about as high as you took off.')] }),
    x('low-box-depth-drop', 'Low Box Depth Drop and Stick', 'squat', '0-0-0-0', [
      'Step off a low box, about shin height. Step, do not jump.',
      'Land quiet on both feet and hold the landing still for three seconds.',
    ], { impact: 'depth_drop', equipment: ['plyo box'], source: 'playbook ch6 (Drill 3: The Safe Landing Check)' }),
  ]),
  L('pogo', 'locomotion', [
    x('fast-heel-raise', 'Fast Heel Raise', 'locomotion', '1-0-0-0', [
      'Push the floor away to rise onto the balls of your feet quickly, then lower under control.',
      'The feet never leave the floor.',
    ], { skillLayer: 'wake-up', braceMode: 'reflex' }),
    x('pogo-hops', 'Pogo Hops', 'locomotion', '0-0-0-0', [
      'Small, quick bounces off the floor on the balls of the feet, knees nearly straight.',
      'Crisp and quiet: no heel slap, arms swinging in opposition.',
    ], { impact: 'plyometric', source: CH6_POGO, commonFaults: [f('The knees bend a lot on each contact', 'Make the bounce smaller and quieter, springing off the floor from the ankles.')] }),
    x('single-leg-pogo', 'Single-Leg Pogo Hops', 'locomotion', '0-0-0-0', [
      'The same small bounces off the floor on one foot, about 15 seconds a set.',
      'Quiet contacts, standing tall.',
    ], { impact: 'plyometric', source: CH6_POGO }),
  ], CH6_POGO),
  L('broad', 'hinge', [
    x('hip-snap', 'Hip Snap', 'hinge', '1-0-0-0', [
      'Push your hips back toward the wall behind you, hands resting on them.',
      'Snap up tall, fast. The feet stay pressed into the floor.',
    ], { skillLayer: 'wake-up' }),
    x('broad-jump-stick', 'Broad Jump and Stick', 'hinge', '0-0-0-0', [
      'Swing the arms and jump forward to a spot a short way ahead.',
      'Land quiet on both feet and stick it for a two-count. Walk back and reset.',
    ], { impact: 'plyometric', commonFaults: [f('Falling forward out of the landing', 'Jump shorter until every landing sticks.')] }),
    x('double-broad-jump', 'Double Broad Jump and Stick', 'hinge', '0-0-0-0', [
      'Two short broad jumps in a row, the second straight off the first landing.',
      'Stick the last landing for a two-count.',
    ], { impact: 'plyometric' }),
  ]),
  L('lateral', 'lunge', [
    x('lateral-step-stick', 'Lateral Step and Stick', 'lunge', '1-2-0-0', [
      'A big step to the side; land on that foot and hold still for a two-count.',
      'Knee over the laces, hips back a little.',
    ], { skillLayer: 'speed', braceMode: 'reflex' }),
    x('lateral-bound-stick', 'Lateral Bound and Stick', 'lunge', '0-0-0-0', [
      'Push off one leg, bound sideways a short way and land on the other.',
      'Stick it still and silent for a two-count, then go back.',
    ], { impact: 'plyometric', commonFaults: [f('The landing knee drops in', 'Bound shorter and land with the knee over your laces.')] }),
    x('lateral-bounds-continuous', 'Continuous Lateral Bounds', 'lunge', '0-0-0-0', [
      'Bound side to side without the stick, quick and quiet.',
      'End the set when a landing gets loud.',
    ], { impact: 'plyometric' }),
  ]),

  // ── full gym ──
  L('g-squat', 'squat', [
    x('box-squat', 'Box Squat', 'squat', '3-1-1-0', [
      'Sit back to a box at about knee height, touch it, stand up.',
      'Hold the weight at your chest, chest tall.',
    ], { equipment: ['box', 'dumbbell or kettlebell'] }),
    x('goblet-squat', 'Goblet Squat', 'squat', '3-0-1-0', [
      'Hold a dumbbell or kettlebell at your chest, elbows down.',
      'Sit down between your heels, then push the floor away.',
    ], { equipment: ['dumbbell or kettlebell'], commonFaults: [f('The heels come up at the bottom', 'Widen the stance a little and sit less deep.')] }),
    x('back-squat', 'Barbell Back Squat', 'squat', '3-0-1-0', [
      'Bar across the upper back, hands snug; brace for a light punch before you unrack.',
      'Sit down between the heels, then drive the floor away.',
    ], { equipment: ['barbell', 'squat rack'], commonFaults: [
      f('The hips shoot up first out of the bottom', 'Push the floor away with chest and hips rising together; take weight off the bar.'),
      f('The knees drift in on the way up', 'Spread the floor apart with your feet.'),
    ] }),
    x('back-squat-pause', 'Paused Barbell Back Squat', 'squat', '3-2-1-0', [
      'The same squat with two seconds still at the bottom, still braced for the punch.',
      'Drive up from the stop.',
    ], { equipment: ['barbell', 'squat rack'] }),
  ]),
  L('g-deadlift', 'hinge', [
    x('kb-deadlift', 'Kettlebell Deadlift', 'hinge', '2-0-1-0', [
      'Kettlebell between the feet; hinge down with a long back.',
      'Push the floor away and stand tall.',
    ], { equipment: ['kettlebell'] }),
    x('trap-bar-deadlift', 'Trap Bar Deadlift', 'hinge', '2-0-1-0', [
      'Stand in the middle of the bar, grip the handles, chest tall.',
      'Brace for a light punch, then push the floor away until you stand tall.',
    ], { equipment: ['trap bar'], commonFaults: [f('The back rounds as the bar leaves the floor', 'Take the slack out of the bar and brace for a light punch before it moves; take weight off.')] }),
    x('barbell-deadlift', 'Barbell Deadlift', 'hinge', '2-0-1-0', [
      'Bar over the middle of the foot, shins close to it.',
      'Brace, squeeze the bar and push the floor away.',
    ], { equipment: ['barbell'] }),
  ]),
  L('g-rdl', 'hinge', [
    x('db-rdl', 'Dumbbell RDL', 'hinge', '2-0-1-0', [
      'Dumbbells in front of the thighs, soft knees.',
      'Push the wall behind you with your hips, back long, then stand tall.',
    ], { equipment: ['dumbbells'] }),
    x('barbell-rdl', 'Barbell RDL', 'hinge', '2-0-1-0', [
      'Bar in front of the thighs, soft knees that stay put.',
      'Push the wall behind you with your hips; stop before the back rounds.',
    ], { equipment: ['barbell'], commonFaults: [f('The bar drifts away from the legs', 'Keep the bar close enough to brush your thighs the whole way.')] }),
    x('barbell-rdl-slow', 'Barbell RDL, 3-Second Lower', 'hinge', '3-0-1-0', [
      'The same RDL, three seconds on the way down.',
    ], { equipment: ['barbell'] }),
  ]),
  L('g-split', 'lunge', [
    x('db-split-squat', 'Dumbbell Split Squat', 'lunge', '2-0-1-0', [
      'Dumbbells at your sides, feet about two shoulder-widths apart front to back.',
      'Back knee straight down, then drive up through the front heel.',
    ], { equipment: ['dumbbells'] }),
    x('db-rfe-split-squat', 'Dumbbell Rear-Foot Elevated Split Squat', 'lunge', '3-0-1-0', [
      'Back foot laces-down on a bench, dumbbells at your sides.',
      'Lower until the back knee nearly touches the floor, then drive the floor away through the front heel.',
    ], { equipment: ['dumbbells', 'bench'], commonFaults: [f('The front heel lifts', 'Move the front foot a little further from the bench.')] }),
    x('bb-rfe-split-squat', 'Barbell Rear-Foot Elevated Split Squat', 'lunge', '3-0-1-0', [
      'Bar across the upper back, back foot on a bench.',
      'The same straight-down lower, then drive the floor away through the front heel.',
    ], { equipment: ['barbell', 'squat rack', 'bench'] }),
  ]),
  L('g-step', 'lunge', [
    x('db-step-up-low', 'Dumbbell Step-Up, Low Box', 'lunge', '2-0-1-0', [
      'A box below knee height, dumbbells at your sides.',
      'Push the box away through the whole front foot to stand up, then step down slow.',
    ], { equipment: ['dumbbells', 'box'] }),
    x('db-step-up', 'Dumbbell Step-Up', 'lunge', '2-0-1-0', [
      'A box about knee height, the whole foot on it.',
      'Stand up with the top leg; the back foot only follows.',
    ], { equipment: ['dumbbells', 'box'], commonFaults: [f('Pushing off the back foot', 'Lift the back toes off the floor before you drive up.')] }),
    x('db-step-up-slow', 'Dumbbell Step-Up, 3-Second Lower', 'lunge', '3-0-1-0', [
      'The same step-up, three seconds to step back down to the floor.',
    ], { equipment: ['dumbbells', 'box'] }),
  ]),
  L('g-bench', 'push', [
    x('db-floor-press', 'Dumbbell Floor Press', 'push', '2-1-1-0', [
      'On your back, knees bent, dumbbells over the chest.',
      'Lower until the upper arms touch the floor, then press up.',
    ], { equipment: ['dumbbells'] }),
    x('db-bench', 'Dumbbell Bench Press', 'push', '3-0-1-0', [
      'Feet planted, shoulder blades pulled together on the bench.',
      'Lower with control, then push the dumbbells up and slightly together.',
    ], { equipment: ['dumbbells', 'bench'], commonFaults: [f('The elbows flare straight out', 'Press the dumbbells up with the elbows about 45 degrees from your sides.')] }),
    x('bb-bench', 'Barbell Bench Press', 'push', '3-0-1-0', [
      'Eyes under the bar, feet planted, shoulder blades pulled together.',
      'Lower the bar to the lower chest, then press it back up over the shoulders.',
    ], { equipment: ['barbell', 'bench', 'spotter or safeties'], commonFaults: [f('The bar bounces off the chest', 'Touch softly and press from the touch.')] }),
    x('bb-bench-pause', 'Paused Barbell Bench Press', 'push', '3-1-1-0', [
      'The same press with the bar paused still for one second on the chest.',
    ], { equipment: ['barbell', 'bench', 'spotter or safeties'] }),
  ]),
  L('g-overhead', 'push', [
    x('landmine-press', 'Half-Kneeling Landmine Press', 'push', '2-0-1-0', [
      'Half-kneeling, the end of the bar at your shoulder.',
      'Press up and forward; the body stays tall and still.',
    ], { equipment: ['barbell', 'landmine'] }),
    x('db-overhead-press', 'Standing Dumbbell Press', 'push', '2-0-1-0', [
      'Stand tall, dumbbells at the shoulders, feet screwed into the floor.',
      'Press straight up toward the ceiling, finishing with the arms near the ears.',
    ], { equipment: ['dumbbells'], commonFaults: [f('Leaning back to finish the press', 'Grow tall toward the ceiling, ready for a light punch; use lighter dumbbells.')] }),
    x('bb-overhead-press', 'Barbell Overhead Press', 'push', '2-0-1-0', [
      'Bar on the front of the shoulders, grip just outside them.',
      'Press up, and move the head through once the bar passes it.',
    ], { equipment: ['barbell', 'squat rack'] }),
  ]),
  L('g-row', 'pull', [
    x('chest-supported-row', 'Chest-Supported Dumbbell Row', 'pull', '2-0-1-1', [
      'Chest on an incline bench, dumbbells hanging.',
      'Pull the elbows toward your back pockets, lower slow.',
    ], { equipment: ['dumbbells', 'bench'] }),
    x('one-arm-db-row', 'One-Arm Dumbbell Row', 'pull', '2-0-1-1', [
      'One hand and one knee on a bench, back long.',
      'Pull the dumbbell toward your hip, lower slow.',
    ], { equipment: ['dumbbell', 'bench'], commonFaults: [f('The body twists to lift the weight', 'Keep the chest square to the bench; use a lighter dumbbell.')] }),
    x('bb-row', 'Barbell Bent-Over Row', 'pull', '2-0-1-1', [
      'Hinge forward with a long back, the bar hanging at the knees.',
      'Pull the bar to your lower chest, lower with control.',
    ], { equipment: ['barbell'], commonFaults: [f('Standing up to heave the bar', 'Hold the hinge still; take weight off the bar.')] }),
    x('bb-row-squeeze', 'Barbell Bent-Over Row, 2-Second Squeeze', 'pull', '2-0-1-2', [
      'The same row; hold the bar in for two seconds each rep.',
    ], { equipment: ['barbell'] }),
  ]),
  L('g-vertical-pull', 'pull', [
    x('hk-single-pulldown', 'Half-Kneeling Single-Arm Pulldown', 'pull', '2-0-1-1', [
      'Half-kneeling at a cable, one handle overhead.',
      'Pull the elbow down toward your back pocket.',
    ], { equipment: ['cable'] }),
    x('lat-pulldown', 'Lat Pulldown', 'pull', '2-0-1-1', [
      'Thighs under the pad, hands just outside the shoulders.',
      'Pull the bar to the top of your chest, elbows toward your back pockets.',
    ], { equipment: ['lat pulldown'], commonFaults: [f('Leaning far back to pull', 'Sit tall and use a weight you can pull without the lean.')] }),
    x('band-pull-up', 'Band-Assisted Pull-Up', 'pull', '2-0-1-0', [
      'A band looped over the bar and under one knee or both feet.',
      'Pull your chest toward the bar, then lower all the way down.',
    ], { equipment: ['pull-up bar', 'band'], commonFaults: [f('Half reps at the bottom', 'Start each rep hanging long from the bar; use a thicker band.')] }),
    x('pull-up', 'Pull-Up', 'pull', '2-0-1-0', [
      'Hang from the bar, hands just outside the shoulders.',
      'Pull until your chin clears the bar, then lower all the way.',
    ], { equipment: ['pull-up bar'] }),
  ]),
  L('g-face-pull', 'pull', [
    x('band-pull-apart', 'Band Pull-Apart', 'pull', '1-0-1-1', [
      'Arms straight out in front, a light band in both hands.',
      'Pull the band apart to your chest, return slow.',
    ], { equipment: ['band'] }),
    x('face-pull', 'Cable Face Pull', 'pull', '2-0-1-1', [
      'Rope at face height, thumbs toward you.',
      'Pull the rope toward your eyes, hands finishing beside your ears.',
    ], { equipment: ['cable', 'rope'], commonFaults: [f('The shoulders shrug up', 'Use a lighter weight and let the shoulders stay down.')] }),
    x('face-pull-hold', 'Cable Face Pull, 2-Second Hold', 'pull', '2-0-1-2', [
      'The same face pull with a two-second hold at the finish.',
    ], { equipment: ['cable', 'rope'] }),
  ]),
  L('g-carry-side', 'carry', [
    x('db-farmer-hold', 'Dumbbell Farmer Hold', 'carry', '0-0-0-0', [
      'A heavy dumbbell in each hand; stand tall and still.',
      'Crush the handles, stay ready for a light punch, and keep breathing.',
    ], { equipment: ['dumbbells'] }),
    x('db-farmer-carry', 'Dumbbell Farmer Carry', 'carry', '0-0-0-0', [
      'A heavy dumbbell in each hand.',
      'Walk tall with short, quiet steps; crush the handles.',
    ], { equipment: ['dumbbells'], commonFaults: [f('The shoulders creep up toward the ears', 'Let the weight pull the shoulders down and grow tall.')] }),
    x('db-suitcase-carry', 'Dumbbell Suitcase Carry', 'carry', '0-0-0-0', [
      'One heavy dumbbell in one hand.',
      'Walk without leaning toward or away from the weight.',
    ], { equipment: ['dumbbell'], commonFaults: [f('Leaning away from the weight', 'Grow tall toward the ceiling and keep both shoulders level.')] }),
    x('db-suitcase-march', 'Dumbbell Suitcase March', 'carry', '0-0-0-0', [
      'One dumbbell in one hand; march slowly, the knee up to hip height.',
      'Stay level each time a foot leaves the floor.',
    ], { equipment: ['dumbbell'] }),
  ]),
  L('g-carry-front', 'carry', [
    x('goblet-hold', 'Goblet Hold', 'carry', '0-0-0-0', [
      'A kettlebell or dumbbell held at your chest; stand tall.',
      'Stay ready for a light punch, and keep breathing.',
    ], { equipment: ['kettlebell or dumbbell'] }),
    x('goblet-carry', 'Goblet Carry', 'carry', '0-0-0-0', [
      'Hold the weight at your chest, elbows in.',
      'Walk tall; do not lean back to hold it.',
    ], { equipment: ['kettlebell or dumbbell'], commonFaults: [f('Leaning back under the weight', 'Pull the weight in closer and stand tall over your hips.')] }),
    x('front-rack-carry', 'Front-Rack Kettlebell Carry', 'carry', '0-0-0-0', [
      'Two kettlebells racked at the shoulders.',
      'Walk tall with short steps, ready for a light punch, breathing the whole way.',
    ], { equipment: ['kettlebells'] }),
  ]),
  L('g-pallof', 'rotation', [
    x('tall-kneeling-pallof', 'Tall-Kneeling Pallof Press', 'rotation', '1-2-1-0', [
      'Kneel tall side-on to a cable or band at chest height.',
      'Press the handle straight out and do not let it turn you.',
    ], { equipment: ['cable or band'] }),
    x('pallof-press', 'Standing Pallof Press', 'rotation', '1-2-1-0', [
      'Stand side-on to the cable, feet hip-width, handle at your chest.',
      'Press out, hold two seconds, bring it back. The body stays square.',
    ], { equipment: ['cable or band'], commonFaults: [f('The body turns toward the cable', 'Step in closer to the cable or use less weight.')] }),
    x('split-pallof-hold', 'Split-Stance Pallof Press with a Hold', 'rotation', '1-5-1-0', [
      'Split stance side-on to the cable; press out and hold for five seconds.',
    ], { equipment: ['cable or band'] }),
  ]),
];

// ── lookups ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Every exercise, ladder by ladder, easiest rung first. */
export const TEMPLATE_EXERCISES: readonly TemplateExercise[] = TEMPLATE_LADDERS.flatMap((l) => l.rungs);

const BY_KEY = new Map(TEMPLATE_EXERCISES.map((e) => [e.key, e]));
const LADDER_OF = new Map(TEMPLATE_LADDERS.flatMap((l) => l.rungs.map((r, i) => [r.key, { ladder: l, at: i }] as const)));

export const templateExercise = (key: string): TemplateExercise | null => BY_KEY.get(key) ?? null;
export const ladderOf = (key: string): TemplateLadder | null => LADDER_OF.get(key)?.ladder ?? null;
/** Its place on its ladder, 0 = the easiest rung; -1 for an unknown key. */
export const rungOf = (key: string): number => LADDER_OF.get(key)?.at ?? -1;

/** The easier version (the rung below), or null at the bottom of the ladder. */
export function easierKey(key: string): string | null {
  const at = LADDER_OF.get(key);
  return at && at.at > 0 ? at.ladder.rungs[at.at - 1].key : null;
}
/** The harder version (the rung above), or null at the top. */
export function harderKey(key: string): string | null {
  const at = LADDER_OF.get(key);
  return at && at.at < at.ladder.rungs.length - 1 ? at.ladder.rungs[at.at + 1].key : null;
}
/** `n` rungs up (n ≥ 0), stopping at the top of the ladder. */
export function stepUp(key: string, n: number): string {
  let k = key;
  for (let i = 0; i < n; i++) k = harderKey(k) ?? k;
  return k;
}

/** Does it leave the floor and land? */
export const isImpact = (key: string): boolean => (BY_KEY.get(key)?.impact ?? null) !== null;

/**
 * The rungs worked one side at a time (one leg, one arm, one hand's load, one direction) — their dose is per side.
 * MIRROR-COACH P8 FIX (2026-09-30, code review): a wave's step-up kept the rung below's reps text, so Door Frame Row
 * "10" became Single-Arm Door Frame Row "10" (half the work per side?), Two-Bag Farmer Carry "40 s" became Suitcase Carry
 * "40 s" beside the same week's "40 s each side" — and One-Arm Dumbbell Row "10 each side" became Barbell Bent-Over Row
 * "10 each side". templates/index.ts sidedReps reads this list across a step; templates/index.test.ts holds every
 * prescription in every wave to it.
 */
export const UNILATERAL_KEYS: ReadonlySet<string> = new Set([
  'sl-rdl-supported', 'sl-rdl-free', 'sl-bridge-squeeze', 'sl-bridge-backpack',
  'supported-split-squat', 'split-squat-hold', 'rfe-split-squat', 'rfe-split-squat-slow',
  'supported-reverse-lunge', 'reverse-lunge', 'backpack-reverse-lunge',
  'door-row-single', 'door-row-single-slow', 'supported-backpack-row',
  'suitcase-carry', 'suitcase-march',
  'single-leg-pogo', 'lateral-step-stick', 'lateral-bound-stick', 'lateral-bounds-continuous',
  'db-split-squat', 'db-rfe-split-squat', 'bb-rfe-split-squat', 'db-step-up-low', 'db-step-up', 'db-step-up-slow',
  'landmine-press', 'one-arm-db-row', 'hk-single-pulldown', 'db-suitcase-carry', 'db-suitcase-march',
  'tall-kneeling-pallof', 'pallof-press', 'split-pallof-hold',
]);
export const isUnilateral = (key: string): boolean => UNILATERAL_KEYS.has(key);

/**
 * What an impact exercise becomes when the protocol gate is shut: the first rung BELOW it that does not land (Box Jump
 * and Stick → Fast Bodyweight Squat, past the Countermovement Jump, which still lands). An exercise that does not land is
 * its own answer. null only for an impact exercise with no impact-free rung below it — templates/index.test.ts holds
 * that there is none.
 */
export function impactFreeStepDown(key: string): string | null {
  if (!BY_KEY.has(key)) return null;
  let k: string | null = key;
  while (k && isImpact(k)) k = easierKey(k);
  return k;
}

/**
 * Every rung of every ladder the given exercises sit on, in ladder order: what a clone seeds into the coach's catalogue,
 * so each easier/harder link it writes names a row the coach has.
 */
export function ladderKeysFor(keys: Iterable<string>): string[] {
  const ladders = new Set<string>();
  for (const k of keys) { const l = ladderOf(k); if (l) ladders.add(l.id); }
  return TEMPLATE_LADDERS.filter((l) => ladders.has(l.id)).flatMap((l) => l.rungs.map((r) => r.key));
}

/** The catalogue create body for one exercise (lib/coach/catalogue.ts validateCatalogueCreate's input), links left out. */
export function catalogueCreateInput(key: string): Record<string, unknown> {
  const e = BY_KEY.get(key);
  if (!e) throw new Error(`unknown template exercise ${key}`);
  return { ...e.catalogue, primaryCues: [...e.catalogue.primaryCues], commonFaults: e.catalogue.commonFaults.map((x) => ({ ...x })), equipment: [...e.catalogue.equipment] };
}
