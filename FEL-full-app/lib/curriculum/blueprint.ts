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

export const CURRICULUM_VERSION = '2026.09-draft1';
export const PASS_MARK = 80;

export interface AssessmentQuestion {
  key: string;
  prompt: string;
  options: string[];
  /** index into options */
  answer: number;
}

export interface LessonBody {
  /** "trackKey/moduleKey/lessonKey" */
  ref: string;
  title: string;
  /** Short paragraphs, plain text. */
  body: string[];
  keyPoints: string[];
  /** The in-game drill that proves it (a mode key + what to do). */
  drill: { modeKey: string; text: string };
  assessment: AssessmentQuestion[];
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

const q = (key: string, prompt: string, options: string[], answer: number): AssessmentQuestion => ({ key, prompt, options, answer });

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
          assessment: [
            q('s1', 'Which observation most likely points to strength as the limiting pillar?', ['A dunk attempt released too early', 'A jump that stays short even with perfect charge timing', 'A rally lost on footwork', 'A missed parry window'], 1),
            q('s2', 'How fast does strength move, and how should a mentor judge it?', ['Session to session; judge daily', 'Over weeks; judge the trend', 'It does not change after 18', 'Only in the gym, never in play'], 1),
            q('s3', 'What is the mentor\'s first honest act with a returning athlete?', ['Set a bigger goal', 'Read the current numbers without flinching', 'Compare them to a pro', 'Skip the numbers and start playing'], 1),
          ],
        },
        {
          ref: 'blueprint/m1/power', title: 'Power — force in a hurry',
          body: [
            'Power is strength delivered fast: the jump, the first step, the swing through the zone. It depends on strength but is not the same thing — two athletes with equal squats can differ wildly in vertical.',
            'In every FEL mode power is a timing read as much as a physical one. The dunk\'s gather step, the derby\'s contact point, the karate special\'s commitment: each is power spent at one instant. A mentor watches the instant, not the run-up.',
          ],
          keyPoints: ['Power = strength × speed of delivery.', 'It shows at one instant; watch the instant.', 'Equal strength does not mean equal power.'],
          drill: { modeKey: 'dunk', text: 'Land a dunk with a PERFECT timing bonus twice in one contest.' },
          assessment: [
            q('p1', 'Power differs from strength because…', ['it is measured in kilograms', 'it is force delivered fast', 'it only exists in the legs', 'it cannot be trained'], 1),
            q('p2', 'Where does a mentor look to judge power in the dunk contest?', ['The run-up speed', 'The gather and release instant', 'The crowd meter', 'The landing'], 1),
            q('p3', 'Two athletes squat the same. Their verticals differ. The likely pillar is…', ['strength', 'power', 'recovery', 'mental'], 1),
          ],
        },
        {
          ref: 'blueprint/m1/speed', title: 'Speed — covering ground',
          body: [
            'Speed is how fast a body crosses space once it is moving. It is the pillar players feel most and mentors overrate most: a fast athlete with poor reads arrives early to the wrong place.',
            'The lab measures speed from movement drills and from mode telemetry — the sprint to a loose ball, the recovery slide on defence. Pair the number with a read: where did they go, and was it right?',
          ],
          keyPoints: ['Speed is movement rate once moving.', 'Pair every speed number with a decision read.', 'Fast to the wrong place is not speed.'],
          drill: { modeKey: 'threevthree', text: 'Win three loose-ball races in one game while your team keeps its matchups.' },
          assessment: [
            q('sp1', 'Why is speed the most overrated pillar for a mentor?', ['It cannot be measured', 'Fast to the wrong place is still wrong', 'It never changes', 'It only matters in sprinting'], 1),
            q('sp2', 'What should always sit next to a speed number?', ['A strength number', 'A decision read: where they went and whether it was right', 'A highlight clip', 'A rest day'], 1),
          ],
        },
        {
          ref: 'blueprint/m1/endurance', title: 'Endurance — the last minute',
          body: [
            'Endurance is the ability to keep the other three pillars honest when the easy energy is gone — the Streetlight Session on the Blacktop: last light, tired legs, hold your form.',
            'It is the pillar most visible in the final minute and least visible in the first. A mentor reads endurance by comparing the same skill early and late in a session, not by counting minutes played.',
          ],
          keyPoints: ['Endurance = form held when tired.', 'Compare the same skill early vs late.', 'Minutes played is not the measure.'],
          drill: { modeKey: 'karate', text: 'Reach wave 5 in The Hundred with your chain length in wave 5 no worse than in wave 2.' },
          assessment: [
            q('e1', 'How does a mentor read endurance?', ['Total minutes played', 'The same skill compared early and late in a session', 'The final score', 'Heart rate only'], 1),
            q('e2', 'The Streetlight Session teaches…', ['speed under lights', 'holding form when the easy energy is gone', 'night vision', 'shooting form'], 1),
          ],
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
          assessment: [
            q('a1', 'Agility is best described as…', ['top speed in a straight line', 'an unplanned change of direction', 'flexibility in the hips', 'reaction to a whistle'], 1),
            q('a2', 'What separates a stumble from a read?', ['Speed', 'The half-step before the change', 'Shoe grip', 'The score'], 1),
          ],
        },
        {
          ref: 'blueprint/m2/flexibility', title: 'Flexibility — range you own',
          body: [
            'Flexibility is the range a joint can move through with control. Range without control is a liability; the movement screen measures both — depth, asymmetry, valgus — and turns them into the mobility and symmetry pillars.',
            'A mentor never coaches range in isolation. Every range cue is paired with a load cue: "deeper" always comes with "and hold it".',
          ],
          keyPoints: ['Flexibility = range with control.', 'The movement screen reads depth, asymmetry, valgus.', 'Pair every range cue with a load cue.'],
          drill: { modeKey: 'freerun', text: 'Land two big drops clean in a row (B as you touch down rolls it). A rolled landing is range under load.' },
          assessment: [
            q('f1', 'Range without control is…', ['the goal', 'a liability', 'strength', 'endurance'], 1),
            q('f2', 'Which movement-screen reads feed the flexibility picture?', ['Score and combo', 'Depth, asymmetry, valgus', 'Speed and power', 'Wins and losses'], 1),
          ],
        },
        {
          ref: 'blueprint/m2/recovery', title: 'Recovery — the pillar that decides the others',
          body: [
            'Recovery is how fast a body returns to baseline after load: between reps, between sessions, after a loss. It decides whether the other seven pillars can be trained at all.',
            'The Camp measures recovery two ways: the PRQ recovery attribute, and the resiliency log — the rate at which a mentee retries after a failed attempt and returns after a losing session. A mentee who stops retrying is not lazy; something in the plan is too heavy.',
          ],
          keyPoints: ['Recovery = return to baseline after load.', 'Resiliency = retry rate after failure + return after a loss.', 'A collapse in retries is a plan problem first.'],
          drill: { modeKey: 'derby', text: 'After a whiff, swing again within the next pitch. Three retries after fails in one derby.' },
          assessment: [
            q('r1', 'What does the Camp log as resiliency?', ['Total wins', 'Retry rate after failed attempts and return after a losing session', 'Sessions per week', 'Max heart rate'], 1),
            q('r2', 'A mentee stops retrying after fails. The mentor\'s first assumption should be…', ['they are lazy', 'the plan is too heavy', 'they need a new mode', 'nothing; wait a month'], 1),
            q('r3', 'Recovery decides…', ['nothing about training', 'whether the other pillars can be trained at all', 'only sleep quality', 'the final score'], 1),
          ],
        },
        {
          ref: 'blueprint/m2/mental', title: 'Mental — the read under pressure',
          body: [
            'The mental pillar is the quality of a decision when it costs something: the last dunk when trailing, the block read at 10-10, the parry with the guard gauge flashing. It is trained by facing those moments often, with the stakes real and the consequences survivable.',
            'The mentor builds the ladder of survivable stakes: story rail, then boss, then a rival, then a person. Every goal plan should say which rung the mentee is on.',
          ],
          keyPoints: ['Mental = decision quality when it costs something.', 'Train it with real, survivable stakes.', 'Every plan names the current rung of the stakes ladder.'],
          drill: { modeKey: 'volleyball', text: 'At 10-10 or later, win the point with a read: a stuff block or a dig into an attack.' },
          assessment: [
            q('m1', 'The mental pillar is trained by…', ['avoiding pressure until ready', 'facing real, survivable stakes often', 'watching film only', 'playing easier opponents'], 1),
            q('m2', 'What should every goal plan state about the mental pillar?', ['A motivational quote', 'Which rung of the stakes ladder the mentee is on', 'A win target', 'A favourite mode'], 1),
          ],
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
          assessment: [
            q('i1', 'When is a goal locked?', ['When the facilitator writes it', 'When the mentee can say it back in their own words', 'After the first win', 'When a guardian signs'], 1),
            q('i2', 'A 15-year-old mentee\'s parent approves verbally on the phone. The plan…', ['can go active', 'cannot go active until the consent request is accepted', 'goes active for one week', 'needs a second facilitator'], 1),
            q('i3', 'Who approves the drafted plan?', ['The AI coach', 'The mentee', 'The owner', 'Nobody; it is automatic'], 1),
          ],
        },
        {
          ref: 'blueprint/m3/session', title: 'The session — curriculum beside the game',
          body: [
            'An ongoing session runs the curriculum and a game mode side by side: a module\'s key points, then the drill that proves them, then the numbers. The session record captures the modules covered, the games played, the PRQ and movement deltas and the resiliency log.',
            'The facilitator writes one honest note per session. Not a summary — the one thing that changed or did not.',
          ],
          keyPoints: ['Module → drill → numbers, in that order.', 'The record captures modules, games, deltas, resiliency.', 'One honest note per session.'],
          drill: { modeKey: 'threepoint', text: 'Run a module drill and record the session with its deltas.' },
          assessment: [
            q('se1', 'The order inside a session is…', ['numbers, then game, then talk', 'module key points, the drill, then the numbers', 'game only', 'talk only'], 1),
            q('se2', 'The session note should be…', ['a full summary', 'the one thing that changed or did not', 'a score', 'optional'], 1),
          ],
        },
        {
          ref: 'blueprint/m3/replication', title: 'Replication — exporting a camp',
          body: [
            'A camp that worked once should run again without its author in the room. The template captures the blocks, sessions, modules and modes — and the curriculum version it was built on. A template built on one curriculum never silently imports into another; the facilitator reconciles the differences first.',
            'Forking is encouraged. Credit stays with the author; the fork records where it came from.',
          ],
          keyPoints: ['Templates capture structure and curriculum version.', 'Version mismatch is reconciled, never silent.', 'Forks keep the author\'s credit.'],
          drill: { modeKey: 'carnival', text: 'Export one working plan as a template and import it for a second mentee.' },
          assessment: [
            q('re1', 'A template built on curriculum 2026.09 is imported under 2027.01. What happens?', ['It imports silently', 'The facilitator reconciles differences first', 'It is deleted', 'It downgrades the curriculum'], 1),
            q('re2', 'Forking a template…', ['is forbidden', 'keeps the author\'s credit and records the source', 'erases the original', 'requires owner approval'], 1),
          ],
        },
      ],
    },
  ],
};

// ── Bodies for the two existing mode tracks (lib/game-data.ts TRACKS) ──────

const modeTrackBodies: LessonBody[] = [
  { ref: 'dunk-fundamentals/m1/l1', title: 'Charge Mechanics', body: ['Jump power scales with charge time up to a sweet spot; past it, control falls off faster than height rises. The bar shows the band — release inside it.'], keyPoints: ['Charge to the band, not the top.', 'Overcharge costs control.'], drill: { modeKey: 'dunk', text: 'Land three jumps with 80%+ charge.' }, assessment: [q('d1', 'Overcharging past the band…', ['adds height freely', 'costs control faster than it adds height', 'does nothing', 'resets the contest'], 1)] },
  { ref: 'dunk-fundamentals/m1/l2', title: 'Hang Time Physics', body: ['In hang time gravity scales to 0.65 — the slow-motion window. PRQ grade adds hang: more hang is more time to execute.'], keyPoints: ['Hang time is a window, not a bonus.', 'PRQ grade lengthens it.'], drill: { modeKey: 'dunk', text: 'Score two hang-time points in one dunk.' }, assessment: [q('d2', 'Hang time is best used to…', ['land early', 'execute the trick', 'charge again', 'change style'], 1)] },
  { ref: 'dunk-fundamentals/m1/l3', title: 'The Gather Step', body: ['The gather turns approach speed into lift. Your Speed attribute multiplies the approach; the gather instant decides the jump.'], keyPoints: ['Horizontal speed becomes vertical lift at the gather.'], drill: { modeKey: 'dunk', text: 'Win a round with a PERFECT timing bonus.' }, assessment: [q('d3', 'The gather converts…', ['style into points', 'approach speed into lift', 'hang into charge', 'nothing'], 1)] },
  { ref: 'dunk-fundamentals/m2/l1', title: 'Trick Complexity', body: ['POWER is safe; FLASHY raises complexity and tightens the window; SIGNATURE is maximum — reserve it for full-charge jumps.'], keyPoints: ['Complexity buys points and costs window.'], drill: { modeKey: 'dunk', text: 'Execute one of each style in a contest.' }, assessment: [q('d4', 'SIGNATURE dunks are best attempted…', ['every time', 'on full-charge jumps', 'when trailing only', 'never'], 1)] },
  { ref: 'dunk-fundamentals/m2/l2', title: 'Timing Windows', body: ['The apex tap grades PERFECT, GREAT, GOOD; a MISS costs a point. The window shrinks as complexity rises.'], keyPoints: ['The window shrinks with complexity.'], drill: { modeKey: 'dunk', text: 'Chain two PERFECT dunks.' }, assessment: [q('d5', 'As complexity rises the timing window…', ['grows', 'shrinks', 'stays fixed', 'disappears'], 1)] },
  { ref: 'dunk-fundamentals/m2/l3', title: 'Reading the Scoreboard', body: ['Bank safe POWER dunks when leading; go SIGNATURE when trailing. The NEED chip tells you the number.'], keyPoints: ['Lead: bank. Trail: swing.'], drill: { modeKey: 'dunk', text: 'Beat the rival in a full contest.' }, assessment: [q('d6', 'When leading late, the read is…', ['SIGNATURE', 'bank a POWER dunk', 'skip the turn', 'FLASHY only'], 1)] },
  { ref: 'karate-fundamentals/m1/l1', title: 'The Jab', body: ['Fastest strike, one point, and the start of every chain — its short recovery keeps the combo window alive.'], keyPoints: ['Speed opens the chain.'], drill: { modeKey: 'karate', text: 'Land a 5-hit chain.' }, assessment: [q('k1', 'The jab\'s role in a chain is…', ['the finisher', 'the opener that keeps the window alive', 'a block', 'a special'], 1)] },
  { ref: 'karate-fundamentals/m1/l2', title: 'The Kick', body: ['Slower, two points, longer reach: the finisher. Cash the multiplier before the window closes.'], keyPoints: ['Kicks finish chains.'], drill: { modeKey: 'karate', text: 'Finish a 3+ chain with a kick.' }, assessment: [q('k2', 'Kicks are best used as…', ['openers', 'finishers', 'blocks', 'taunts'], 1)] },
  { ref: 'karate-fundamentals/m1/l3', title: 'The Special', body: ['Three points and a big commitment. A whiff drops the chain and leaves you open — land it on staggered opponents only.'], keyPoints: ['Specials punish staggers, nothing else.'], drill: { modeKey: 'karate', text: 'Land three specials in a session.' }, assessment: [q('k3', 'A special should land on…', ['any opponent', 'a staggered opponent', 'a blocking opponent', 'the crowd'], 1)] },
  { ref: 'karate-fundamentals/m2/l1', title: 'Block Cone', body: ['Holding block covers a frontal cone. A blocked hit opens a short counter window — strike inside it.'], keyPoints: ['Block, then counter inside the window.'], drill: { modeKey: 'karate', text: 'Execute three counter-hits after blocks.' }, assessment: [q('k4', 'A blocked hit gives you…', ['nothing', 'a short counter window', 'a special', 'a wave skip'], 1)] },
  { ref: 'karate-fundamentals/m2/l2', title: 'Neural Burst', body: ['Clean hits build the meter; at 80+ the burst multiplies damage. Spend it on dense waves.'], keyPoints: ['Save the burst for density.'], drill: { modeKey: 'karate', text: 'Trigger a burst in a session.' }, assessment: [q('k5', 'The burst is best spent…', ['on the first enemy', 'on dense waves', 'while blocking', 'never'], 1)] },
  { ref: 'karate-fundamentals/m2/l3', title: 'Wave Scaling', body: ['Later waves add opponents, aggression and speed. Survive by rotating — never let them flank.'], keyPoints: ['Rotate; deny the flank.'], drill: { modeKey: 'karate', text: 'Reach wave 5.' }, assessment: [q('k6', 'Against three opponents the rule is…', ['stand still and block', 'rotate and deny the flank', 'special everyone', 'run'], 1)] },
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

export interface GradedAnswer { questionKey: string; chosen: number; correct: boolean }

/** Grade a module assessment: every lesson's questions in the module, answers keyed by question key. */
export function gradeModule(trackKey: string, moduleKey: string, answers: Record<string, number>): { score: number; passed: boolean; graded: GradedAnswer[] } {
  const track = CURRICULUM.tracks.find((t) => t.key === trackKey);
  const mod = track?.modules.find((m) => m.key === moduleKey);
  if (!mod) return { score: 0, passed: false, graded: [] };
  const questions = mod.lessons.flatMap((l) => l.assessment);
  const graded = questions.map((qq) => ({ questionKey: qq.key, chosen: answers[qq.key] ?? -1, correct: answers[qq.key] === qq.answer }));
  const score = questions.length ? Math.round((graded.filter((g) => g.correct).length / questions.length) * 100) : 0;
  return { score, passed: score >= PASS_MARK, graded };
}
