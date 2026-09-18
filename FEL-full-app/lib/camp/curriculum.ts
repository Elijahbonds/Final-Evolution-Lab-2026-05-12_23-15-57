// The Camp Blueprint — the owner's eight-week facilitator curriculum.
//
// Source of truth: docs/CAMP-BLUEPRINT.md (owner, 3 Sep 2026). This module is
// its typed mirror so the Camp screens render the arc, the scripts, the
// Pathway Map Protocol and the Bridge prompts from one place. Edit the
// document first, then this file; bump the version when meaning changes.
//
// It layers on what exists: a plan's milestone timeline is a CoachingProgram
// (blocks = milestones), so the arc is offered as eight milestones, and the
// Session screen derives "which week are we in" from the plan's lock date.
// No new data model.

export const CAMP_BLUEPRINT_VERSION = '2026.09.03';

/** Label discipline for every scan or screen figure shown to a mentee. */
export const SCAN_LABEL = 'estimated engagement';

export const PROGRAM = {
  type: '8-week mentorship cycle, in-person + in-app hybrid',
  deliverable: 'a populated Shared Profile the mentee keeps and carries',
  replication: 'any trained facilitator can run this, not just the author',
} as const;

/** Say this out loud to mentees in week 1. */
export const THESIS: string[] = [
  'You cannot test whether your plan for becoming what you want to be is working. That loop is years long. Training has a loop that closes in weeks. So we use training to practice the moves — set a goal, measure honestly, build a plan, execute through the stall, prove the delta — and then we move those same moves onto the thing you actually want.',
  'We are not claiming squats make you an architect. We are claiming that the person who knows how to run a plan through a plateau is the person who becomes an architect, and this is the fastest place to learn that.',
];

export interface Track { key: 'career' | 'movement' | 'bridge'; name: string; cadence: string; loop: string; body: string }
export const TRACKS: Track[] = [
  { key: 'career', name: 'Career Track', cadence: '1 session / week', loop: 'long loop', body: 'The declared destination, reverse-engineered into a real pathway map. Low frequency, high thinking.' },
  { key: 'movement', name: 'Movement Track', cadence: '3 sessions / week', loop: 'short loop', body: 'A movement goal the mentee picks themselves. System Scan → gap → programmed sessions → re-scan. High frequency, high reps.' },
  { key: 'bridge', name: 'The Bridge', cadence: '10 minutes, every single week', loop: 'transfer', body: 'The facilitator names the transfer out loud. Without this, the program is a fitness class sitting next to a career worksheet. This is not optional and it is not something to improvise at the end if there is time. Put it on the clock.' },
];

export interface ArcWeek {
  week: number;
  name: string;
  /** The artifact the week must produce; null for pure execution weeks. */
  output: string | null;
  body: string[];
  script: string[];
  trap?: string;
  /** Week 6: scheduled, not accidental. The thesis lives or dies here. */
  plateau?: boolean;
}

export const ARC: ArcWeek[] = [
  {
    week: 1, name: 'DECLARE', output: 'a written destination with a name attached',
    body: ['Not "get in shape." Not "be successful." A role a person could hold. If the mentee does not have one, they pick a placeholder and we proceed anyway — the plan is the lesson, not the accuracy of the guess.'],
    script: ['What do you want to be? Not what you are supposed to say. What?', 'If that does not work out, what is the second one?', 'Who is someone who already does this? Do you know their path?', 'You can change this in week five. Pick one for now.'],
    trap: 'Do not correct or downgrade the dream. A 14-year-old who says "NBA" gets the NBA pathway mapped honestly, including the numbers. The map does the correcting, not you.',
  },
  {
    week: 2, name: 'MEASURE', output: 'Movement Signature + PRQ baseline, on file',
    body: ['Run the System Scan and movement screen. This is the day the mentee gets real data about their own body, most of them for the first time. Handle it carefully — findings are described as a starting point, never as a verdict, and never as a medical finding.', `Label discipline: all scan output is "${SCAN_LABEL}," never clinical measurement. No diagnosing. No injury opinions. Refer out.`],
    script: ['This is a baseline, not a grade.', 'The number matters less than the direction it moves.'],
  },
  {
    week: 3, name: 'MAP THE GAP', output: 'two gap documents — career and movement',
    body: ['This is the hardest facilitator skill in the program and the step where a weak mentor hands out something generic. Run the Pathway Map Protocol — the facilitator is not expected to already know how to become a marine biologist.'],
    script: [],
  },
  {
    week: 4, name: 'BUILD THE PLAN', output: 'a dated timeline for each track, with checkpoints',
    body: ['Career track gets checkpoints on a multi-year timeline with the first three inside 90 days. Movement track gets an 8-week program with weekly progressions, delivered through the app with demos and cueing so the mentee can run it without the facilitator present.', 'The mentee writes the plan. The facilitator edits it. If the facilitator writes it, the mentee learns nothing and will not run it.'],
    script: [],
  },
  {
    week: 5, name: 'EXECUTE', output: null,
    body: ['Reps. The facilitator’s job shrinks to enforcement, form, and the weekly Bridge conversation.'],
    script: [],
  },
  {
    week: 6, name: 'THE PLATEAU', output: null, plateau: true,
    body: ['Scheduled, not accidental. Almost everyone stalls around here. Treat it as curriculum, not as failure. If a mentee somehow has not stalled, manufacture the lesson by raising the load until they do.', 'This is the single most important session in the program. The whole thesis lives or dies here. Do not rush it, do not rescue them out of it, and do not let them quit inside it.'],
    script: ['This was going to happen. It happens to everyone. What now?', 'Quit, wait, or adjust. Those are the three. Which are you picking?', 'What would you adjust — the load, the frequency, or the goal?'],
  },
  {
    week: 7, name: 'ADJUST', output: 'a revised plan, with the revision reason written down',
    body: ['Plan revision is a skill, not an admission of failure. The written reason is the artifact — it is evidence the mentee can reason about their own process.'],
    script: [],
  },
  {
    week: 8, name: 'PROVE', output: 're-scan, delta against baseline, Creator Card issued, Shared Profile updated and handed over',
    body: ['The mentee presents: where they started, what they changed, what moved, and what their next checkpoint is. Present to the group, or to a parent, or to camera. The presentation matters — articulating your own process is the transferable skill.'],
    script: [],
  },
];

export interface PathwayField { key: string; label: string; prompt: string }
/** Six fields, filled WITH the mentee. The facilitator makes sure all six get filled, not fills them. */
export const PATHWAY_FIELDS: PathwayField[] = [
  { key: 'entry', label: 'Entry points', prompt: 'How do people actually get in? Name at least three different routes, because there is never only one.' },
  { key: 'credential', label: 'Credential required', prompt: 'Degree, license, portfolio, audition, certification, or nothing. Be accurate. Many careers require less formal schooling than a teenager assumes.' },
  { key: 'firstStep', label: 'First real step', prompt: 'Something doable inside 90 days. An email, a class, a piece of work made, a person contacted.' },
  { key: 'who', label: 'Who already does this', prompt: 'A named person, ideally reachable. Local beats famous.' },
  { key: 'numbers', label: 'The honest numbers', prompt: 'How many people attempt this, how many land it, what it pays at year one and year ten. Present without spin in either direction.' },
  { key: 'second', label: 'The second path', prompt: 'What the same skills open if the first does not happen. Not a consolation prize — insurance, and framing it that way keeps the dream intact.' },
];

/** Rotate. The mentee answers, not the facilitator. */
export const BRIDGE_PROMPTS: string[] = [
  'You stalled this week and you adjusted. Where else in your life do you need to make that same move?',
  'You measured before you planned. What are you currently guessing at that you could measure instead?',
  'Your program says three sessions. You did two. What actually got in the way, and is that same thing in the way of the big goal?',
  'You just did something hard on a day you did not want to. Name the next time you will need that.',
  'What is the difference between the version of you who finishes this and the version who does not?',
];

export const MEASURES = {
  report: [
    'Movement Signature delta, baseline to week 8',
    'PRQ delta',
    'Session adherence rate',
    'Career-track checkpoints completed',
    'Plan revisions made after a stall (a positive metric)',
    'Whether the mentee can state their own next step unprompted',
  ],
  neverClaim: ['Career outcomes. The loop is longer than the camp. Saying otherwise is dishonest and it is the thing that will get the program dismissed by the schools and orgs you want to sell into.'],
} as const;

export const STANDARDS: string[] = [
  'You are a facilitator, not a therapist and not a clinician. Refer out for anything medical, anything psychological, anything at home.',
  'Never downgrade a mentee’s stated dream. Map it honestly instead.',
  'The mentee writes; you edit.',
  'The Bridge conversation happens every week without exception.',
  `All scan and screen output is ${SCAN_LABEL}, never diagnosis.`,
  'If you do not know a career path, say so and run the protocol together. Modeling "I do not know, here is how I would find out" is the lesson.',
];

export const REPLICATION: string[] = [
  'This document',
  'The Pathway Map Protocol as a fillable worksheet',
  'The eight-week session plans with scripts',
  'App access for scan, programming, demos, and Profile',
  'A trained observation — they run one cycle shadowed before running one alone',
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Which week of the arc a plan is in, from its start (lock) date. Clamped to 1..8. */
export function weekOf(start: Date | string, now: Date = new Date()): number {
  const t0 = typeof start === 'string' ? new Date(start).getTime() : start.getTime();
  if (!Number.isFinite(t0)) return 1;
  const w = Math.floor((now.getTime() - t0) / WEEK_MS) + 1;
  return Math.min(ARC.length, Math.max(1, w));
}
export function arcWeek(week: number): ArcWeek { return ARC[Math.min(ARC.length, Math.max(1, week)) - 1]; }
/** The Bridge prompt for a week — rotates through the five, so an eight-week cycle repeats three. */
export function bridgePromptFor(week: number): string { return BRIDGE_PROMPTS[(Math.max(1, week) - 1) % BRIDGE_PROMPTS.length]; }

export interface ArcMilestone { label: string; sessions: { label: string }[] }
/** The arc as plan milestones: eight weeks, each a career session, three movement sessions and the Bridge. */
export function arcMilestones(): ArcMilestone[] {
  return ARC.map((w) => ({
    label: `Week ${w.week} — ${w.name}`,
    sessions: [
      { label: 'Career session' },
      { label: 'Movement session 1' }, { label: 'Movement session 2' }, { label: 'Movement session 3' },
      { label: 'The Bridge (10 min)' },
    ],
  }));
}
