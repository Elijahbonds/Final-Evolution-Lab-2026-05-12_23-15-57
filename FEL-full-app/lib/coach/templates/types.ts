// lib/coach/templates/types.ts — MIRROR-COACH P8 (2026-09-29): the shape of a FEL program template.
//
// A template is written ONCE as its week — the sessions, each with its items in P2's session structure (lib/coach/
// structure.ts: section, key set, superset letter, work/hold seconds, set-up cue ids) naming exercises from FEL's
// template catalogue (lib/coach/templateCatalogue.ts) by key, with a week-1 dose. The WAVE (./waves.ts) turns that week
// into four: the sets and the effort band of every item per week. Nothing here is a Prisma type; a template becomes rows
// only through the clone (lib/coach/builderServer.ts 'clone_template'), which runs every piece through P2's validators.
//
// WHICH SECTIONS A TEMPLATE WRITES. Prime, Key, Assist and Finish. It never writes Prep or Cool-down: those are P6's —
// Today builds the warm-up (lib/coach/warmup.ts: the owner's Pre-Game Wake-Up, a rock-and-hold stretch aimed at the
// athlete's screen, a primer keyed to the key set's pattern, with the youth and pain gates) and the cool-down
// (lib/coach/cooldown.ts) whenever the coach wrote none, so a template that wrote its own would switch both off and lose
// their gates. A Prime section appears only in an adult template, holding that day's one jump (the protocol gate's
// business, P8 rule (b)); P6 then adds no primer of its own that day (warmup.ts coachPrime). A youth or camp template
// writes no Prime, so the warm-up's own calm primer runs.
import type { WeekDayName } from '../offDay';

/** The sections a template writes (see the header). */
export type TemplateSection = 'prime' | 'key' | 'assist' | 'finish';

export interface TemplateItem {
  /** templateCatalogue.ts key. */
  exercise: string;
  section: TemplateSection;
  isKeySet?: true;
  /** One capital letter: items sharing it alternate set for set (P2's superset). */
  supersetGroup?: string;
  /** Week-1 sets; the wave moves them. */
  sets: number;
  /** Reps text for a counted item ("8", "6 each side", "3 jumps"). A timed item leaves it out, or gives the per-side text
   *  after the seconds ("40 s each side"). */
  reps?: string;
  /** A timed item: seconds of work per set (a carry, a plank). */
  workSeconds?: number;
  holdSeconds?: number;
  /** Defaults to the exercise's defaultTempo. */
  tempo?: string;
  restSeconds: number;
  /** lib/coach/taxonomy.ts SETUP_CUES ids, at most three. */
  setupCues?: string[];
}

export interface TemplateSession {
  /** The day it is meant for (the /workout week view places it); 'Camp' for the camp session. */
  day: WeekDayName | 'Camp';
  /** What the day is about, in a few words ("Lower: squat"). */
  label: string;
  items: TemplateItem[];
}

export type TemplateAudience = 'adult' | 'youth';
export type TemplateEquipment = 'bodyweight' | 'gym';

export interface ProgramTemplate {
  id: string;
  /** The picker's name. */
  name: string;
  /** One line under the name: what the weeks hold. */
  summary: string;
  /** 'adult' = cloned only to a client with an adult birth year on file; 'youth' = anyone (lib/coach/taxonomy.ts youthRules). */
  audience: TemplateAudience;
  equipment: TemplateEquipment;
  /** What the athlete needs, in plain words. */
  equipmentLine: string;
  /** Sessions a week (= sessions.length). */
  daysPerWeek: number;
  /** 'program' = a 4-week wave; 'camp' = one session a coach runs as often as the camp meets. */
  kind: 'program' | 'camp';
  sessions: TemplateSession[];
  /** Youth and camp templates: owner decision #6's daily activity target, shown with the template. */
  dailyTargetMinutes?: number;
}
