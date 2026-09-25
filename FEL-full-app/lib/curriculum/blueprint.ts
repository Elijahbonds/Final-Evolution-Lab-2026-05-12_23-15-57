// The Neuro-Mechanic's Blueprint — the curriculum the Camp certifies against.
//
// Owner decision (2026-09-02): Claude authors real lesson bodies from the story
// spine and the PRQ pillars; the owner reviews and replaces text later. This
// file is CONTENT plus a pure resolver. It layers on lib/game-data.ts TRACKS
// (the two mode tracks keep their keys; their lessons gain bodies here) and adds
// the Blueprint track: eight lessons, one per PRQ attribute, in two modules.
//
// Versioned: a Credential and a CampTemplate record the version they were
// earned/built on. Bump CURRICULUM_VERSION when content changes meaning, not
// wording.
//
// HOTFIX (2026-09-24): THIS FILE SHIPS TO THE BROWSER, SO IT HOLDS NO QUESTIONS AND NO ANSWERS.
// components/camp/camp-view.tsx is a client component and imports allLessons() from here for the
// Session tab. Until today every lesson carried its `assessment` array — prompts, options AND the
// `answer` index — so the paid facilitator certification's whole answer key was in the client bundle
// for anyone who opened devtools. Removing only the `answer` field would not have been enough: every
// correct option was authored at index 1, so the questions in authored order ARE the key. The questions,
// the key and the grader now live in lib/curriculum/assessments.ts, which imports 'server-only' (a
// build error if a client component ever reaches it) and is held to that by
// lib/curriculum/answerKeyBoundary.test.ts, which walks the client import graph without a build.
// Nothing here changed meaning, so CURRICULUM_VERSION is not bumped and earned credentials stand.

// Bumped for Module 4 (the four mechanism lessons). Content changed MEANING, not wording, which is the
// documented trigger. Facilitator certification is unaffected: m4 is not required for it.
export const CURRICULUM_VERSION = '2026.09-draft2';
export const PASS_MARK = 80;

export interface LessonBody {
  /** "trackKey/moduleKey/lessonKey" */
  ref: string;
  title: string;
  /** Short paragraphs, plain text. */
  body: string[];
  keyPoints: string[];
  /** The in-game drill that proves it (a mode key + what to do). */
  drill: { modeKey: string; text: string };
  // No `assessment` here on purpose — see the HOTFIX note above and lib/curriculum/assessments.ts.
}

export interface BlueprintModule {
  key: string;
  title: string;
  summary: string;
  lessons: LessonBody[];
  /** Modules a facilitator must pass to certify. */
  requiredForCertification: boolean;
}

export interface BlueprintTrack {
  key: string;
  title: string;
  subtitle: string;
  modules: BlueprintModule[];
}

// ── The Blueprint track: eight pillars ──────────────────────────────────────

const pillars: BlueprintTrack = {
  key: 'blueprint',
  title: "The Neuro-Mechanic's Blueprint",
  subtitle: 'Eight pillars · how a body learns to move well, and how a mentor sees it',
  modules: [
    {
      key: 'm1', title: 'Module 1 — The Engine', requiredForCertification: true,
      summary: 'Strength, power, speed and endurance: the four outputs a body produces, why they are measured separately, and what a mentor watches for in each.',
      lessons: [
        {
          ref: 'blueprint/m1/strength', title: 'Strength — force you can hold',
          body: [
            'Strength is the force a body can produce against something that does not move fast: a heavy bar, the ground under a squat, a rival leaning into a box-out. It is trained slowly and lost slowly. In the lab it is read from load-bearing drills and from the strength attribute on the PRQ card.',
            'The mentor\'s job is not to make an athlete lift more this week. It is to notice when strength is the limiting pillar — when the jump is short because the legs cannot load, not because the timing is off — and to say so plainly, with the number.',
            'Mara Vane\'s tablet on the Blacktop fence holds old numbers. The first honest act of a mentor is to read the current ones without flinching.',
          ],
          keyPoints: ['Strength = force against slow or immovable resistance.', 'It changes over weeks, not sessions; judge trends, not days.', 'Name it as the limiter only when the data says so.'],
          drill: { modeKey: 'onevone', text: 'Hold BOX OUT for three straight rebounds against the rival. The PRQ strength read moves the contest.' },
        },
        {
          ref: 'blueprint/m1/power', title: 'Power — force in a hurry',
          body: [
            'Power is strength delivered fast: the jump, the first step, the swing through the zone. It depends on strength but is not the same thing — two athletes with equal squats can differ wildly in vertical.',
            'In every FEL mode power is a timing read as much as a physical one. The dunk\'s gather step, the derby\'s contact point, the karate special\'s commitment: each is power spent at one instant. A mentor watches the instant, not the run-up.',
          ],
          keyPoints: ['Power = strength × speed of delivery.', 'It shows at one instant; watch the instant.', 'Equal strength does not mean equal power.'],
          drill: { modeKey: 'dunk', text: 'Land a dunk with a PERFECT timing bonus twice in one contest.' },
        },
        {
          ref: 'blueprint/m1/speed', title: 'Speed — covering ground',
          body: [
            'Speed is how fast a body crosses space once it is moving. It is the pillar players feel most and mentors overrate most: a fast athlete with poor reads arrives early to the wrong place.',
            'The lab measures speed from movement drills and from mode telemetry — the sprint to a loose ball, the recovery slide on defence. Pair the number with a read: where did they go, and was it right?',
          ],
          keyPoints: ['Speed is movement rate once moving.', 'Pair every speed number with a decision read.', 'Fast to the wrong place is not speed.'],
          drill: { modeKey: 'threevthree', text: 'Win three loose-ball races in one game while your team keeps its matchups.' },
        },
        {
          ref: 'blueprint/m1/endurance', title: 'Endurance — the last minute',
          body: [
            'Endurance is the ability to keep the other three pillars honest when the easy energy is gone — the Streetlight Session on the Blacktop: last light, tired legs, hold your form.',
            'It is the pillar most visible in the final minute and least visible in the first. A mentor reads endurance by comparing the same skill early and late in a session, not by counting minutes played.',
          ],
          keyPoints: ['Endurance = form held when tired.', 'Compare the same skill early vs late.', 'Minutes played is not the measure.'],
          drill: { modeKey: 'karate', text: 'Reach wave 5 in The Hundred with your chain length in wave 5 no worse than in wave 2.' },
        },
      ],
    },
    {
      key: 'm2', title: 'Module 2 — The Governor', requiredForCertification: true,
      summary: 'Agility, flexibility, recovery and the mental pillar: the systems that decide whether the engine is usable, and how a mentor protects them.',
      lessons: [
        {
          ref: 'blueprint/m2/agility', title: 'Agility — changing your mind in motion',
          body: [
            'Agility is a change of direction the body did not plan a second ago: the crossover that answers a slide, the sidestep off an attack line, the cutback on a wave. It is where the nervous system shows.',
            'The mentor watches the half-step before the change. Late agility looks like a stumble; early agility looks like a read. Reward the read.',
          ],
          keyPoints: ['Agility = unplanned direction change.', 'Watch the half-step before it.', 'Reward the read, not the recovery.'],
          drill: { modeKey: 'mixedcombat', text: 'Step three verticals in one round. The banner says STEPPED IT.' },
        },
        {
          ref: 'blueprint/m2/flexibility', title: 'Flexibility — range you own',
          body: [
            'Flexibility is the range a joint can move through with control. Range without control is a liability; the movement screen measures both — depth, asymmetry, valgus — and turns them into the mobility and symmetry pillars.',
            'A mentor never coaches range in isolation. Every range cue is paired with a load cue: "deeper" always comes with "and hold it".',
          ],
          keyPoints: ['Flexibility = range with control.', 'The movement screen reads depth, asymmetry, valgus.', 'Pair every range cue with a load cue.'],
          drill: { modeKey: 'freerun', text: 'Land two big drops clean in a row (B as you touch down rolls it). A rolled landing is range under load.' },
        },
        {
          ref: 'blueprint/m2/recovery', title: 'Recovery — the pillar that decides the others',
          body: [
            'Recovery is how fast a body returns to baseline after load: between reps, between sessions, after a loss. It decides whether the other seven pillars can be trained at all.',
            'The Camp measures recovery two ways: the PRQ recovery attribute, and the resiliency log — the rate at which a mentee retries after a failed attempt and returns after a losing session. A mentee who stops retrying is not lazy; something in the plan is too heavy.',
          ],
          keyPoints: ['Recovery = return to baseline after load.', 'Resiliency = retry rate after failure + return after a loss.', 'A collapse in retries is a plan problem first.'],
          drill: { modeKey: 'derby', text: 'After a whiff, swing again within the next pitch. Three retries after fails in one derby.' },
        },
        {
          ref: 'blueprint/m2/mental', title: 'Mental — the read under pressure',
          body: [
            'The mental pillar is the quality of a decision when it costs something: the last dunk when trailing, the block read at 10-10, the parry with the guard gauge flashing. It is trained by facing those moments often, with the stakes real and the consequences survivable.',
            'The mentor builds the ladder of survivable stakes: story rail, then boss, then a rival, then a person. Every goal plan should say which rung the mentee is on.',
          ],
          keyPoints: ['Mental = decision quality when it costs something.', 'Train it with real, survivable stakes.', 'Every plan names the current rung of the stakes ladder.'],
          drill: { modeKey: 'volleyball', text: 'At 10-10 or later, win the point with a read: a stuff block or a dig into an attack.' },
        },
      ],
    },
    {
      key: 'm3', title: 'Module 3 — Facilitating', requiredForCertification: true,
      summary: 'The four Camp flows: onboarding, the goal-set intake, the ongoing session and replication — and the consent and safety rules that sit under all of them.',
      lessons: [
        {
          ref: 'blueprint/m3/intake', title: 'The intake — locking a goal',
          body: [
            'The first session asks one question — what do you want to be when you grow up — and then listens. The AI coach offers follow-ups; the facilitator decides which to ask. The goal is locked only when the mentee can say it back in their own words.',
            'From a locked goal the plan drafts itself: milestones as blocks, sessions inside them, the curriculum modules each one leans on. The facilitator edits the draft; the mentee approves it.',
            'If the mentee is under 18 the plan cannot go active until a guardian has accepted the consent request. No exceptions, no verbal approvals.',
          ],
          keyPoints: ['Lock the goal only when the mentee can say it back.', 'The draft plan comes from the goal; the facilitator edits, the mentee approves.', 'Under 18: no active plan without accepted guardian consent.'],
          drill: { modeKey: 'onevone', text: 'Play one game with a mentee and write their goal in one sentence they agree with.' },
        },
        {
          ref: 'blueprint/m3/session', title: 'The session — curriculum beside the game',
          body: [
            'An ongoing session runs the curriculum and a game mode side by side: a module\'s key points, then the drill that proves them, then the numbers. The session record captures the modules covered, the games played, the PRQ and movement deltas and the resiliency log.',
            'The facilitator writes one honest note per session. Not a summary — the one thing that changed or did not.',
          ],
          keyPoints: ['Module → drill → numbers, in that order.', 'The record captures modules, games, deltas, resiliency.', 'One honest note per session.'],
          drill: { modeKey: 'threepoint', text: 'Run a module drill and record the session with its deltas.' },
        },
        {
          ref: 'blueprint/m3/replication', title: 'Replication — exporting a camp',
          body: [
            'A camp that worked once should run again without its author in the room. The template captures the blocks, sessions, modules and modes — and the curriculum version it was built on. A template built on one curriculum never silently imports into another; the facilitator reconciles the differences first.',
            'Forking is encouraged. Credit stays with the author; the fork records where it came from.',
          ],
          keyPoints: ['Templates capture structure and curriculum version.', 'Version mismatch is reconciled, never silent.', 'Forks keep the author\'s credit.'],
          drill: { modeKey: 'carnival', text: 'Export one working plan as a template and import it for a second mentee.' },
        },
      ],
    },
    {
      // MODULE 4 — THE MECHANISMS (2026-09-13). The Coaching brief calls for a 12-module Academy and names
      // the topics: movement mechanics, vertical explosion, neuromuscular control, breathwork, force
      // absorption. The eight PILLAR lessons in m1 and m2 cover WHAT a body produces (one per PRQ
      // attribute); these four cover HOW it produces it, which is the stated goal of movement autonomy —
      // an athlete learning why their body makes power, not only what to follow. Eight plus four is twelve.
      //
      // A NEW MODULE KEY RATHER THAN A RENUMBER, deliberately: `Credential.moduleKey` and
      // `LessonProgress.lessonKey` are persisted, so inserting these as "m3" and pushing Facilitating to m4
      // would orphan every credential already earned. m3 stays exactly where it is.
      //
      // requiredForCertification is FALSE. These are athlete-facing mechanics; a facilitator certified
      // against the previous version stays certified, which is the other half of not breaking earned work.
      key: 'm4', title: 'Module 4 — The Mechanisms', requiredForCertification: false,
      summary: 'How the body actually produces what the pillars measure: absorbing force, the step that sets a jump, elastic control, and the breath underneath all of it.',
      lessons: [
        {
          ref: 'blueprint/m4/absorption', title: 'Force absorption — landing is a skill',
          body: [
            'Everyone trains the jump. Almost nobody trains the landing, and the landing is where the larger forces are: coming down from height, a body meets several times its own weight in a fraction of a second, and it either distributes that through ankle, knee and hip together or it sends it somewhere that was not ready.',
            'Absorption is a SKILL, which means it is learnable and it is visible. A good landing is quiet, the joints share the work, and the athlete is already balanced at the bottom. A poor one is loud, lands stiff, and needs a second step to recover. The Mirror reads the difference as drift at the lumbo-pelvic and posterior-chain zones.',
            'This is why the depth drop is the most gated protocol in the catalogue. It is not that it is dangerous to think about — it is that it asks for absorption at its limit, and asking for that before the pattern exists teaches the pattern wrong.',
          ],
          keyPoints: [
            'The landing carries more force than the take-off.',
            'Quiet, shared across three joints, balanced at the bottom — that is the whole read.',
            'Train absorption before height; height only proves what absorption already built.',
          ],
          drill: { modeKey: 'freerun', text: 'Take six drops from the mid rail and land each one balanced enough to keep moving without a recovery step.' },
        },
        {
          ref: 'blueprint/m4/vertical', title: 'Vertical explosion — the step before the step',
          body: [
            'A vertical jump is decided before the foot that jumps ever lands. The PENULTIMATE step — the second to last — is where an athlete lowers their centre of mass and sets the angle everything after it inherits. Long and low, and the final plant has something to push against. Short and tall, and the jump is whatever the legs can produce from standing.',
            'This is the most coachable centimetre in the sport, and it is almost never coached, because it happens too fast to see and too early to feel. It is why Flight Night scores the run-up at all: the charge and the approach angle are not decoration, they are the jump.',
            'A mentor watching for it is not watching the jump. They are watching two steps earlier, and they are watching height of hips rather than speed of feet.',
          ],
          keyPoints: [
            'The penultimate step sets the plant; the plant only spends what it was given.',
            'Long and low beats short and tall.',
            'Watch the hips two steps out, not the feet at take-off.',
          ],
          drill: { modeKey: 'dunk', text: 'Run the approach three times watching only the second-to-last step. Land the charge on a long, low penultimate and compare the card.' },
        },
        {
          ref: 'blueprint/m4/neuromuscular', title: 'Neuromuscular control — elasticity, not effort',
          body: [
            'Some movement is produced by pushing harder. Some is produced by the tissue itself returning energy it just stored — the stretch-shortening cycle, where a rapid load is immediately reversed and the body gets some of that load back for free. Short ground contacts, small amplitudes, repeated: that is oscillatory work, and it trains timing rather than force.',
            'The mistake is to do it hard. Oscillatory work done with maximum effort stops being elastic and becomes a set of small heavy repetitions, which trains the opposite of what it is for. The instruction is rhythm and quickness off the floor, not height.',
            'This is the pillar the PRQ agility and power axes read together, and it is the clearest example of why the lab measures separately: an athlete can be strong and slow to react, or quick and unable to hold the position they react into.',
          ],
          keyPoints: [
            'Elastic return is energy you already paid for — the skill is not losing it.',
            'Short contacts, small amplitude, rhythm over height.',
            'Done at maximum effort it stops being elastic work at all.',
          ],
          drill: { modeKey: 'threepoint', text: 'Run a rack keeping the feet quick and the release rhythm identical on every shot — the timing is the drill, not the power.' },
        },
        {
          ref: 'blueprint/m4/breath', title: 'Breathwork — the brace underneath everything',
          body: [
            'Breath is not a warm-up ritual. It is the mechanism that sets rib position over the pelvis, and rib position is what decides whether a brace has anything to brace against. An athlete stacked and exhaled can transmit force through the middle; an athlete holding air high in a lifted chest is producing force into a section that gives.',
            'The practical version is short: a full exhale to empty, ribs settling down rather than flaring, and the effort happening on that exhale. Every corrective in the Mirror pairs with a breath for this reason — the position is not held by trying harder, it is held by breathing in a way that makes the position available.',
            'It is also the only lesson here an athlete can practise with no equipment, no readiness threshold and no supervision, which is why the breathing reset is the one protocol in the catalogue that is never gated.',
          ],
          keyPoints: [
            'Rib position over the pelvis is what a brace braces against.',
            'Full exhale, ribs down, effort on the exhale.',
            'Never gated — it is the one thing always available on any day.',
          ],
          drill: { modeKey: 'karate', text: 'Run a full wave exhaling on every strike and inhaling only on the reset. The rhythm should feel slower and the guard should hold longer.' },
        },
      ],
    },
  ],
};

// ── Bodies for the two existing mode tracks (lib/game-data.ts TRACKS) ──────

const modeTrackBodies: LessonBody[] = [
  { ref: 'dunk-fundamentals/m1/l1', title: 'Charge Mechanics', body: ['Jump power scales with charge time up to a sweet spot; past it, control falls off faster than height rises. The bar shows the band — release inside it.'], keyPoints: ['Charge to the band, not the top.', 'Overcharge costs control.'], drill: { modeKey: 'dunk', text: 'Land three jumps with 80%+ charge.' } },
  { ref: 'dunk-fundamentals/m1/l2', title: 'Hang Time Physics', body: ['In hang time gravity scales to 0.65 — the slow-motion window. PRQ grade adds hang: more hang is more time to execute.'], keyPoints: ['Hang time is a window, not a bonus.', 'PRQ grade lengthens it.'], drill: { modeKey: 'dunk', text: 'Score two hang-time points in one dunk.' } },
  { ref: 'dunk-fundamentals/m1/l3', title: 'The Gather Step', body: ['The gather turns approach speed into lift. Your Speed attribute multiplies the approach; the gather instant decides the jump.'], keyPoints: ['Horizontal speed becomes vertical lift at the gather.'], drill: { modeKey: 'dunk', text: 'Win a round with a PERFECT timing bonus.' } },
  { ref: 'dunk-fundamentals/m2/l1', title: 'Trick Complexity', body: ['POWER is safe; FLASHY raises complexity and tightens the window; SIGNATURE is maximum — reserve it for full-charge jumps.'], keyPoints: ['Complexity buys points and costs window.'], drill: { modeKey: 'dunk', text: 'Execute one of each style in a contest.' } },
  { ref: 'dunk-fundamentals/m2/l2', title: 'Timing Windows', body: ['The apex tap grades PERFECT, GREAT, GOOD; a MISS costs a point. The window shrinks as complexity rises.'], keyPoints: ['The window shrinks with complexity.'], drill: { modeKey: 'dunk', text: 'Chain two PERFECT dunks.' } },
  { ref: 'dunk-fundamentals/m2/l3', title: 'Reading the Scoreboard', body: ['Bank safe POWER dunks when leading; go SIGNATURE when trailing. The NEED chip tells you the number.'], keyPoints: ['Lead: bank. Trail: swing.'], drill: { modeKey: 'dunk', text: 'Beat the rival in a full contest.' } },
  { ref: 'karate-fundamentals/m1/l1', title: 'The Jab', body: ['Fastest strike, one point, and the start of every chain — its short recovery keeps the combo window alive.'], keyPoints: ['Speed opens the chain.'], drill: { modeKey: 'karate', text: 'Land a 5-hit chain.' } },
  { ref: 'karate-fundamentals/m1/l2', title: 'The Kick', body: ['Slower, two points, longer reach: the finisher. Cash the multiplier before the window closes.'], keyPoints: ['Kicks finish chains.'], drill: { modeKey: 'karate', text: 'Finish a 3+ chain with a kick.' } },
  { ref: 'karate-fundamentals/m1/l3', title: 'The Special', body: ['Three points and a big commitment. A whiff drops the chain and leaves you open — land it on staggered opponents only.'], keyPoints: ['Specials punish staggers, nothing else.'], drill: { modeKey: 'karate', text: 'Land three specials in a session.' } },
  { ref: 'karate-fundamentals/m2/l1', title: 'Block Cone', body: ['Holding block covers a frontal cone. A blocked hit opens a short counter window — strike inside it.'], keyPoints: ['Block, then counter inside the window.'], drill: { modeKey: 'karate', text: 'Execute three counter-hits after blocks.' } },
  { ref: 'karate-fundamentals/m2/l2', title: 'Neural Burst', body: ['Clean hits build the meter; at 80+ the burst multiplies damage. Spend it on dense waves.'], keyPoints: ['Save the burst for density.'], drill: { modeKey: 'karate', text: 'Trigger a burst in a session.' } },
  { ref: 'karate-fundamentals/m2/l3', title: 'Wave Scaling', body: ['Later waves add opponents, aggression and speed. Survive by rotating — never let them flank.'], keyPoints: ['Rotate; deny the flank.'], drill: { modeKey: 'karate', text: 'Reach wave 5.' } },
];

export const CURRICULUM: { version: string; tracks: BlueprintTrack[]; modeLessons: LessonBody[] } = {
  version: CURRICULUM_VERSION,
  tracks: [pillars],
  modeLessons: modeTrackBodies,
};

// ── pure resolvers ─────────────────────────────────────────────────────────

export function allLessons(): LessonBody[] {
  return [...CURRICULUM.tracks.flatMap((t) => t.modules.flatMap((m) => m.lessons)), ...CURRICULUM.modeLessons];
}

export function lessonByRef(ref: string): LessonBody | undefined {
  return allLessons().find((l) => l.ref === ref);
}

/** Modules a facilitator must pass, as "trackKey/moduleKey". */
export function requiredModules(): string[] {
  return CURRICULUM.tracks.flatMap((t) => t.modules.filter((m) => m.requiredForCertification).map((m) => `${t.key}/${m.key}`));
}

// HOTFIX (2026-09-24): gradeModule moved to lib/curriculum/assessments.ts (server-only) with the answer
// key it needs. A grader in this file would drag the key back into the browser with it.
