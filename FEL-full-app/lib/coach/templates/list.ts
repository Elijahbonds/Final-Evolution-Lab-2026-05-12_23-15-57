// lib/coach/templates/list.ts — MIRROR-COACH P8 (2026-09-29): the list of FEL program templates and the pick rules, kept
// light (no catalogue copy) so the builder's picker can import it into the client bundle. The expansion into weeks, the
// checks and the clone plan live in ./index.ts.
import { ADULT_BW_3, ADULT_BW_4 } from './adultBodyweight';
import { ADULT_GYM_3, ADULT_GYM_4 } from './adultGym';
import { CAMP_SESSION, YOUTH_BW_2, YOUTH_BW_3 } from './youth';
import type { ProgramTemplate, TemplateEquipment } from './types';

/** Every template, in the order the picker shows them: adults (bodyweight, gym), youth, camp. */
export const TEMPLATES: readonly ProgramTemplate[] = [ADULT_BW_3, ADULT_BW_4, ADULT_GYM_3, ADULT_GYM_4, YOUTH_BW_3, YOUTH_BW_2, CAMP_SESSION];
export const TEMPLATE_IDS: readonly string[] = TEMPLATES.map((t) => t.id);
export const templateById = (id: unknown): ProgramTemplate | null => (typeof id === 'string' ? TEMPLATES.find((t) => t.id === id) ?? null : null);

/** Weeks a template writes: a 4-week wave, or the camp session's one. */
export const templateWeeks = (t: ProgramTemplate): number => (t.kind === 'camp' ? 1 : 4);

/**
 * May this template go to this athlete? An adult template (jumps in Prime, Surge on the key lift) only to someone with an
 * adult birth year on file; a youth or camp template to anyone. `youth` is lib/coach/taxonomy.ts youthRules(dobYear):
 * under 18, or no birth year (owner decisions #6, #20).
 */
export const templateAllowedFor = (t: ProgramTemplate, youth: boolean): boolean => t.audience === 'youth' || !youth;

/**
 * The template for a set of answers (the /workout relaunch's pick): youth rules pick a youth template (bodyweight only,
 * 3 days when they train 3 or more days, else 2); an adult gets their equipment at 3 or 4 days (4 when they train 4 or
 * more, else 3). The camp session is a coach's pick, never an answer's.
 */
export function templateFor(answers: { daysPerWeek: number; equipment: TemplateEquipment; youth: boolean }): ProgramTemplate {
  const days = Number.isFinite(answers.daysPerWeek) ? answers.daysPerWeek : 3;
  if (answers.youth) return days >= 3 ? YOUTH_BW_3 : YOUTH_BW_2;
  if (answers.equipment === 'gym') return days >= 4 ? ADULT_GYM_4 : ADULT_GYM_3;
  return days >= 4 ? ADULT_BW_4 : ADULT_BW_3;
}

/** The youth activity target, said where a youth or camp template is shown. */
export const dailyTargetLine = (minutes: number): string =>
  `Youth activity target: about ${minutes} minutes of movement a day. These sessions count toward it, and so do practice, play and getting around on foot.`;

/**
 * May a template be cloned into this program? Only a BLANK one (MIRROR-COACH P8): no prescription in any session, no
 * session the client has opened (`openedSessions` = its ClientSession rows), and no week with a target date (a Camp
 * Blueprint milestone the coach set). The clone replaces the blank weeks, so anything a coach or client put there would
 * be lost; the builder hides the picker and the server refuses (409 program_not_empty) otherwise.
 */
export function programIsBlank(
  blocks: readonly { targetDate?: unknown; sessions: readonly { exercises: readonly unknown[] }[] }[],
  openedSessions: number,
): boolean {
  return openedSessions === 0 && blocks.every((b) => !b.targetDate && b.sessions.every((s) => s.exercises.length === 0));
}

/** What a template holds, in one line for the picker: "4 weeks · 3 sessions a week", "One session". */
export const templateShapeLine = (t: ProgramTemplate): string =>
  (t.kind === 'camp' ? 'One session, run as often as the camp meets' : `${templateWeeks(t)} weeks · ${t.sessions.length} sessions a week`);

/** The picker's line for an adult template. */
export const ADULT_TEMPLATE_LINE = 'For adults with a birth year on file. Some days open with a jump.';

/** What the clone does, said on the button's panel before the coach presses it. */
export const CLONE_LINE =
  "Replaces this program's empty weeks with the template's, and adds its exercises to My catalogue with their easier and harder versions linked. Everything stays editable.";
