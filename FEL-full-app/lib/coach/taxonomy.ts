// FEL's coaching taxonomy — the named lists a coach picks from in the program builder (MIRROR-COACH P2, 2026-09-25).
//
// WHAT WAS MISSING. A prescription was sets, reps, a free-text load that mixed kilograms with "RPE7", a tempo, a rest
// and a note. There was no shared vocabulary for WHAT an exercise trains, HOW HARD a set should feel, or WHAT to think
// about before the first rep, so every coach typed it into `coachNote` (300 characters, unread by anything) and no
// later feature — the warm-up generator (P6), the breath pacer on the key set (P7), the template checks (P8), the
// roster's "stuck on" strip — had anything to key on.
//
// WHERE THE NAMES COME FROM (owner decision #8, DECISIONS.md): the owner's Neuro-Mechanic Playbook, never a renamed
// book or certification label. The cross-reference proposed six "skill layer" tags; its critic showed they were a
// one-to-one rename, in the same order, of a certification's six pillars (crossref ipRisks[0]). So these are built
// from the Playbook's OWN structure instead (lib/education/playbook.data.json, imported from the owner's manuscript by
// scripts/education/import-playbook.ts):
//
//   · SKILL_LAYERS — one per Playbook chapter that teaches a trainable skill (ch2's two halves, ch3–ch9), in the
//     Playbook's chapter order, each placed on the owner's own four-step spine from ch1, "Assess → Correct → Load →
//     Perform". Ch1 is that spine and ch10 is the parents' load-management chapter, so neither is a layer.
//     taxonomy.test.ts checks every cited chapter title against the imported Playbook, so a layer cannot cite a
//     chapter that does not exist, and no layer shares a name with the certification's pillars.
//   · EFFORT_BANDS — five bands on the governor's THROTTLE, the Playbook's ch1 image ("the governor opens the
//     throttle"; ch8, "the governor will keep the throttle short"). FEL's own five, with FEL's own RPE anchors; not
//     the book's tension table or its percentages. Reps-in-reserve = 10 − RPE is the generic RIR-based RPE scale from
//     the strength literature (Helms et al., 2016), not anyone's brand.
//   · SETUP_CUES — the set-up pick-list. Where the owner already wrote the cue, it is the owner's cue from the
//     Playbook (cited per row); the rest are FEL's, written as external-focus cues (attention on the floor, the wall,
//     the handle — the motor-learning finding usually credited to Wulf) rather than on a muscle.
//
// HONESTY RULE (lib/share/screen.ts): these are coaching words for a set, not claims about a body. Nothing here names
// a condition, promises to prevent anything, or says an exercise treats anything — taxonomy.test.ts screens every
// line of copy in this file through the same rule the share cards use.
//
// Pure data + guards: no Prisma client value, no DOM. The enum TYPES come from the generated client so a value added
// to the schema without a label here fails the type check.
import type { MovementPattern, SessionSection } from '@/public/_prisma/client';

// ── session sections ────────────────────────────────────────────────────────────────────────────────────────────────

export interface SectionInfo { id: SessionSection; label: string; meaning: string }

/** Where an exercise sits in a session, in running order. The schema's SessionSection enum, labelled. */
export const SESSION_SECTIONS: readonly SectionInfo[] = [
  { id: 'prep', label: 'Prep', meaning: 'Get ready to move: breath, feet and joints, the opening phases of the Wake-Up.' },
  { id: 'prime', label: 'Prime', meaning: 'A few quick, crisp reps that wake the pattern up before the main work.' },
  { id: 'key', label: 'Key', meaning: 'The main work the session is built around.' },
  { id: 'assist', label: 'Assist', meaning: 'Support work that builds what the key lift needs.' },
  { id: 'finish', label: 'Finish', meaning: 'A short closer, a carry or a conditioning piece. Optional.' },
  { id: 'cooldown', label: 'Cool-down', meaning: 'Bring it back down: long exhales and slow, easy range.' },
];
export const SESSION_SECTION_IDS = SESSION_SECTIONS.map((s) => s.id) as readonly SessionSection[];
export const DEFAULT_SECTION: SessionSection = 'key';
type MissingSection = Exclude<SessionSection, (typeof SESSION_SECTIONS)[number]['id']>;
const _allSections: [MissingSection] extends [never] ? true : MissingSection = true;
void _allSections;

export const isSessionSection = (v: unknown): v is SessionSection =>
  typeof v === 'string' && (SESSION_SECTION_IDS as readonly string[]).includes(v);
/** 0 for prep … 5 for cool-down; unknown sorts with `key` (the schema default). */
export const sectionRank = (s: string | null | undefined): number => {
  const i = (SESSION_SECTION_IDS as readonly string[]).indexOf(s ?? DEFAULT_SECTION);
  return i < 0 ? SESSION_SECTION_IDS.indexOf(DEFAULT_SECTION) : i;
};
export const sectionLabel = (s: string | null | undefined): string =>
  SESSION_SECTIONS.find((x) => x.id === s)?.label ?? SESSION_SECTIONS[sectionRank(s)].label;

// ── skill layers, from the Playbook's chapters ──────────────────────────────────────────────────────────────────────

/** The owner's four-step spine, Playbook ch1 "The Sequence That Changes Everything": Assess → Correct → Load → Perform. */
export type PlaybookStep = 'assess' | 'correct' | 'load' | 'perform';
export const PLAYBOOK_STEPS: readonly { id: PlaybookStep; label: string }[] = [
  { id: 'assess', label: 'Assess' }, { id: 'correct', label: 'Correct' }, { id: 'load', label: 'Load' }, { id: 'perform', label: 'Perform' },
];

export interface SkillLayer {
  id: string;
  label: string;
  /** One line a coach reads beside the picker. */
  meaning: string;
  /** Where it comes from: the Playbook chapter (number + exact imported title), and the section when a chapter splits. */
  playbook: { chapter: number; title: string; section?: string };
  /** Which of the owner's four steps it serves. null = between sessions (the Reset Button sits outside the four). */
  step: PlaybookStep | null;
}

export const SKILL_LAYERS: readonly SkillLayer[] = [
  { id: 'cylinder', label: 'Cylinder', meaning: 'Breath and pressure: fill the trunk and keep it full while you move.',
    playbook: { chapter: 2, title: 'The Foundation of Force', section: 'The Pressure Cylinder' }, step: 'correct' },
  { id: 'tripod', label: 'Tripod', meaning: 'The foot as a platform: heel, big-toe joint and pinky-toe joint all pressing.',
    playbook: { chapter: 2, title: 'The Foundation of Force', section: 'The Foot Tripod' }, step: 'correct' },
  { id: 'check', label: 'Check', meaning: 'Look before you load: quick checks that show where a movement gets stuck.',
    playbook: { chapter: 3, title: 'The 5-Minute Movement Check' }, step: 'assess' },
  { id: 'joints', label: 'Joints', meaning: 'Ankle, hip and upper back moving through the range the sport asks for.',
    playbook: { chapter: 4, title: 'Unlocking the Joints' }, step: 'correct' },
  { id: 'wake-up', label: 'Wake-Up', meaning: 'Switch the system on before practice or a game: rhythm, then launch.',
    playbook: { chapter: 5, title: 'The Pre-Game Nervous System Wake-Up' }, step: 'perform' },
  { id: 'jump-land', label: 'Jump & Land', meaning: 'Take off and land well: countermovement, springy contacts, quiet landings.',
    playbook: { chapter: 6, title: 'Jumping and Landing Mechanics' }, step: 'load' },
  { id: 'speed', label: 'Speed & Cuts', meaning: 'Start, stop and change direction: lean, crisp contacts, a stuck finish.',
    playbook: { chapter: 7, title: 'SAQ Made Simple' }, step: 'perform' },
  { id: 'strength', label: 'Strength', meaning: 'Technique before load: hinge, split squat, bridge, push-up, plank, then weight.',
    playbook: { chapter: 8, title: 'Strength Without Strain' }, step: 'load' },
  { id: 'reset', label: 'Reset', meaning: 'Come back down between sessions: long exhales, a wind-down, sleep.',
    playbook: { chapter: 9, title: 'The Reset Button' }, step: null },
];
export const SKILL_LAYER_IDS = SKILL_LAYERS.map((l) => l.id);
export const isSkillLayerId = (v: unknown): v is string => typeof v === 'string' && SKILL_LAYER_IDS.includes(v);
export const skillLayer = (id: string | null | undefined): SkillLayer | null => SKILL_LAYERS.find((l) => l.id === id) ?? null;

// ── effort bands: five settings of the governor's throttle ──────────────────────────────────────────────────────────

export interface EffortBand {
  id: string;
  label: string;
  /** The one-line meaning shown under the picker. */
  meaning: string;
  /** RPE 1–10, inclusive: what a logged set's effort reads as. */
  rpe: readonly [number, number];
  /** Reps in reserve the band means, as the athlete reads it (RIR = 10 − RPE). */
  rir: string;
  /**
   * false = adults only. Owner decision #6 (youth mode): no max-effort bracing cues under 18; #20: a blank birth year is
   * youth rules. P2 recorded it and deferred the gate to P5; the P2 review (2026-09-26) enforces it now, because the band
   * shipped to clients in P2: the builder refuses an adults-only band for a youth client, Today drops one saved before
   * that, and the set logger names no adults-only band to a youth client (youthRules, bandAllowed below).
   */
  youthAllowed: boolean;
}

export const EFFORT_BANDS: readonly EffortBand[] = [
  { id: 'idle', label: 'Idle', meaning: 'Breath and position only. No brace to build; you could talk through the set.', rpe: [1, 3], rir: '7+ left', youthAllowed: true },
  { id: 'cruise', label: 'Cruise', meaning: 'Smooth, easy reps with a light brace. Plenty left in the tank.', rpe: [4, 5], rir: '5–6 left', youthAllowed: true },
  { id: 'drive', label: 'Drive', meaning: 'Working sets. Build the brace before every rep; 3–4 reps left at the end.', rpe: [6, 7], rir: '3–4 left', youthAllowed: true },
  // P2 review (2026-09-26): "Full brace" came out — a youth-allowed band may not ask for a maximal brace (decision #6)
  { id: 'surge', label: 'Surge', meaning: 'Hard sets. 1–2 clean reps left, and the speed stays clean.', rpe: [8, 9], rir: '1–2 left', youthAllowed: true },
  { id: 'full', label: 'Full throttle', meaning: 'A top set: everything you have with clean form. The set ends when the form changes.', rpe: [10, 10], rir: '0 left', youthAllowed: false },
];
export const EFFORT_BAND_IDS = EFFORT_BANDS.map((b) => b.id);
export const isEffortBandId = (v: unknown): v is string => typeof v === 'string' && EFFORT_BAND_IDS.includes(v);
export const effortBand = (id: string | null | undefined): EffortBand | null => EFFORT_BANDS.find((b) => b.id === id) ?? null;

/**
 * YOUTH RULES for a client (owner decisions #6 and #20): under 18 by their birth year, or NO birth year on file. The
 * same rule as lib/workout/plan-revision.ts planAudience — a year-only birth date 18 years back is still youth, since
 * they may not turn 18 until December (taxonomy.test.ts holds the two together). MIRROR-COACH P2 review, 2026-09-26.
 */
export function youthRules(dobYear: number | null | undefined, now: Date = new Date()): boolean {
  if (typeof dobYear !== 'number' || !Number.isFinite(dobYear) || dobYear < 1900) return true;
  return !(now.getFullYear() - dobYear > 18);
}

/** A band may be prescribed to (and shown to) this client: no band, a youth-allowed band, or an adult client. */
export function bandAllowed(id: string | null | undefined, youth: boolean): boolean {
  const b = effortBand(id);
  return !b || b.youthAllowed || !youth;
}

/**
 * Max-effort wording in a cue FEL ships (a catalogue row copied from the knowledge base carries the KB's own cues:
 * "Push all-out against something that will not move"). Decision #6: none of it reaches a youth client's card.
 */
export const MAX_EFFORT_CUE = /\b(all[- ]out|maximal|max(?:imum)?[- ]effort|everything you (?:have|had|'ve got))\b/i;
export const youthSafeCues = (cues: readonly string[]): string[] => cues.filter((c) => !MAX_EFFORT_CUE.test(c));

/** The band a logged RPE falls in (RPE 7.5 rounds to 8). null for anything that is not an RPE 1–10. */
export function effortBandForRpe(rpe: number | null | undefined): EffortBand | null {
  if (typeof rpe !== 'number' || !Number.isFinite(rpe)) return null;
  const r = Math.round(rpe);
  if (r < 1 || r > 10) return null;
  return EFFORT_BANDS.find((b) => r >= b.rpe[0] && r <= b.rpe[1]) ?? null;
}

/** The band for a reps-in-reserve reading (RPE = 10 − RIR). */
export function effortBandForRir(rir: number | null | undefined): EffortBand | null {
  if (typeof rir !== 'number' || !Number.isFinite(rir) || rir < 0) return null;
  return effortBandForRpe(Math.max(1, 10 - rir));
}

/**
 * A suggestion for the builder's band picker from what the coach already typed in `load`: "RPE7" → Drive,
 * "@ RPE 8.5" → Surge. Only an explicit RPE is read. A weight ("24kg"), a percentage or "body" suggests nothing,
 * because the same kilograms are Cruise for one athlete and Surge for another.
 */
export function suggestEffortBand(load: string | null | undefined): EffortBand | null {
  const m = /\bRPE\s*(\d+(?:\.\d+)?)/i.exec(load ?? '');
  return m ? effortBandForRpe(Number(m[1])) : null;
}

// ── set-up cues: the pick-list ──────────────────────────────────────────────────────────────────────────────────────

export interface SetupCue {
  id: string;
  /** What the athlete reads (and later hears), before the first rep. Short, and about the world outside the body. */
  text: string;
  layer: string;
  /** The patterns it fits; the builder lists these first for a tagged exercise. */
  patterns: readonly MovementPattern[];
  /** 'playbook ch<N>' when the owner wrote the cue; 'fel' when FEL wrote it for this list. */
  source: string;
}

/** At most this many set-up cues per prescribed exercise: one the athlete remembers beats three they don't. */
export const MAX_SETUP_CUES = 3;

export const SETUP_CUES: readonly SetupCue[] = [
  { id: 'tripod-down', text: 'Heel, big toe, little toe: press all three into the floor.', layer: 'tripod', patterns: ['squat', 'hinge', 'lunge', 'carry', 'locomotion'], source: 'playbook ch2' },
  { id: 'wall-behind', text: 'Push the wall behind you with your hips.', layer: 'strength', patterns: ['hinge'], source: 'playbook ch8' },
  { id: 'floor-away', text: 'Push the floor away.', layer: 'strength', patterns: ['push', 'squat'], source: 'playbook ch8' },
  { id: 'front-heel', text: 'Drive the floor down through your front heel.', layer: 'strength', patterns: ['lunge'], source: 'playbook ch8' },
  { id: 'light-punch', text: 'Brace for a light punch, then breathe behind the brace.', layer: 'cylinder', patterns: ['push', 'carry', 'hinge', 'squat', 'rotation'], source: 'playbook ch8' },
  { id: 'long-exhale', text: 'Let the air out longer than it came in.', layer: 'cylinder', patterns: ['breath', 'mobility'], source: 'playbook ch2' },
  { id: 'quiet-landing', text: 'Land quiet: as little sound as you can.', layer: 'jump-land', patterns: ['locomotion'], source: 'playbook ch6' },
  { id: 'stick-two', text: 'Stick it still and silent for a two-count.', layer: 'speed', patterns: ['locomotion', 'lunge'], source: 'playbook ch7' },
  { id: 'knees-over-laces', text: 'Knees travel out over your laces.', layer: 'strength', patterns: ['squat', 'lunge'], source: 'fel' },
  { id: 'elbows-to-pockets', text: 'Drive your elbows toward your back pockets.', layer: 'strength', patterns: ['pull'], source: 'fel' },
  { id: 'crush-handle', text: 'Crush the handle.', layer: 'strength', patterns: ['carry', 'pull', 'push'], source: 'fel' },
  { id: 'grow-tall', text: 'Grow tall toward the ceiling.', layer: 'cylinder', patterns: ['carry', 'rotation'], source: 'fel' },
];
export const SETUP_CUE_IDS = SETUP_CUES.map((c) => c.id);
export const isSetupCueId = (v: unknown): v is string => typeof v === 'string' && SETUP_CUE_IDS.includes(v);
export const setupCue = (id: string): SetupCue | null => SETUP_CUES.find((c) => c.id === id) ?? null;

/** The pick-list in the order the builder shows it: cues that fit the exercise's pattern first, then the rest. */
export function setupCuesFor(pattern: MovementPattern | null | undefined): SetupCue[] {
  if (!pattern) return [...SETUP_CUES];
  return [...SETUP_CUES.filter((c) => c.patterns.includes(pattern)), ...SETUP_CUES.filter((c) => !c.patterns.includes(pattern))];
}
