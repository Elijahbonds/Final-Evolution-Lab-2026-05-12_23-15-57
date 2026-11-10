// lib/teach/pePlan.ts — EDU-06 (platform phase 10, 2026-11-03): the PE lesson plan FORMAT. No content: the plans are the
// owner's or approved teachers' to write.
//
// A plan is one class period in four parts, in this order: a warm-up, the activity, a game, and a check (how the teacher
// sees who got it). Each part has its minutes and a few short lines. A plan names its grade band.
// UNDER-13 CLASSES WAIT FOR COUNSEL (OWN-11): the bands that hold children under 13 are listed, held, and refused.
//
// Pure. Client-safe.
import { LIMITS } from '@/lib/knowledge/validate';
import { claimProblems } from './course';

export const PE_PARTS = ['warmUp', 'activity', 'game', 'check'] as const;
export type PePart = (typeof PE_PARTS)[number];
export const PE_PART_LABEL: Record<PePart, string> = { warmUp: 'Warm-up', activity: 'Activity', game: 'Game', check: 'Check' };

/** Grade bands. `held` bands hold children under 13 and wait for counsel (OWN-11). */
export const GRADE_BANDS = [
  { id: 'k-2', label: 'Grades K–2', held: true },
  { id: '3-5', label: 'Grades 3–5', held: true },
  { id: '6-7', label: 'Grades 6–7', held: true },
  { id: '8-9', label: 'Grades 8–9', held: false },
  { id: '10-12', label: 'Grades 10–12', held: false },
] as const;
export type GradeBand = (typeof GRADE_BANDS)[number]['id'];
export const OPEN_GRADE_BANDS = GRADE_BANDS.filter((b) => !b.held).map((b) => b.id);

/** (new) A class period's limits. */
export const PE_LIMITS = { periodMin: 20, periodMax: 90, partMin: 2, linesMax: 4 } as const;

export interface PePlanPart { minutes: number; lines: string[] }
export interface PePlan { title: string; band: GradeBand; parts: Record<PePart, PePlanPart> }

export function pePlanErrors(p: PePlan): string[] {
  const errs: string[] = [];
  if (typeof p?.title !== 'string' || !p.title.trim()) errs.push('title: empty');
  else { if (p.title.length > LIMITS.headline) errs.push(`title: ${p.title.length} chars > ${LIMITS.headline}`); errs.push(...claimProblems(p.title, 'title')); }
  const band = GRADE_BANDS.find((b) => b.id === p?.band);
  if (!band) errs.push('band: pick a grade band');
  else if (band.held) errs.push(`band: ${band.label} classes wait for counsel (under 13)`);
  let total = 0;
  for (const k of PE_PARTS) {
    const part = p?.parts?.[k];
    if (!part) { errs.push(`${PE_PART_LABEL[k]}: missing`); continue; }
    if (!Number.isFinite(part.minutes) || part.minutes < PE_LIMITS.partMin) errs.push(`${PE_PART_LABEL[k]}: at least ${PE_LIMITS.partMin} minutes`);
    total += Number.isFinite(part.minutes) ? part.minutes : 0;
    const lines = Array.isArray(part.lines) ? part.lines : [];
    if (!lines.length || lines.length > PE_LIMITS.linesMax) errs.push(`${PE_PART_LABEL[k]}: 1–${PE_LIMITS.linesMax} lines`);
    lines.forEach((l, i) => {
      if (typeof l !== 'string' || !l.trim()) errs.push(`${PE_PART_LABEL[k]} line ${i + 1}: empty`);
      else { if (l.length > LIMITS.line) errs.push(`${PE_PART_LABEL[k]} line ${i + 1}: ${l.length} chars > ${LIMITS.line}`); errs.push(...claimProblems(l, `${PE_PART_LABEL[k]} line ${i + 1}`)); }
    });
  }
  if (total && (total < PE_LIMITS.periodMin || total > PE_LIMITS.periodMax)) errs.push(`the period is ${total} minutes; want ${PE_LIMITS.periodMin}–${PE_LIMITS.periodMax}`);
  return errs;
}
