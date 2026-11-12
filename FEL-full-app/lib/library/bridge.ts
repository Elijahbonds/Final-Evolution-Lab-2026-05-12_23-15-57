// lib/library/bridge.ts — EXERCISE-LIBRARY (2026-10-25): the library ↔ a coach's private catalogue.
//
//   · "Add to my catalogue" copies a library entry into the coach's ProgramExercise rows (libraryToCatalogue): the
//     coach owns and edits the copy; the library entry is untouched; the copy keeps a soft link (libraryExerciseId,
//     pending SQL) so later features can tell where it came from.
//   · "Submit to library" snapshots a coach's own row (catalogueToSubmission) for the owner's moderation queue, and an
//     approved submission becomes a 'coach-submitted' library entry (submissionToEntry) — which the validator checks
//     like any other entry before it is written, so a coach's "squeeze your glutes" is sent back for an edit rather
//     than published.
//
// Pure. Client-safe.

import { validateCatalogueCreate, type CleanCatalogueItem, type ValidateResult } from '@/lib/coach/catalogue';
import { clipKeyFor } from './demo';
import { slugify } from './search/text';
import type { LibraryExercise, SubmissionPayload } from './types';
import { EQUIPMENT, PREHAB_NOTE, isEquipmentId, type CategoryId, type EquipmentId, type MovementPattern, type MuscleId } from './vocab';

/** The catalogue's body-region category for a library entry (lib/coach/catalogue.ts CATALOGUE_CATEGORIES). */
export function catalogueCategory(e: Pick<LibraryExercise, 'category' | 'pattern'>): string {
  switch (e.category) {
    case 'mobility': return 'mobility';
    case 'plyometric': return 'plyometric';
    case 'sport-skill': return 'skill';
    case 'conditioning': case 'speed-agility': return 'conditioning';
    case 'recovery': return e.pattern === 'breath' ? 'breath' : 'recovery';
    case 'core': return 'core';
    case 'prehab': return e.pattern === 'push' || e.pattern === 'pull' ? (e.pattern === 'push' ? 'upper-push' : 'upper-pull') : 'mobility';
    default:
      if (['squat', 'hinge', 'lunge'].includes(e.pattern)) return 'lower-body';
      if (e.pattern === 'push') return 'upper-push';
      if (e.pattern === 'pull') return 'upper-pull';
      if (e.pattern === 'rotation' || e.pattern === 'carry') return 'core';
      return 'general';
  }
}

const label = (id: string) => EQUIPMENT.find((x) => x.id === id)?.label ?? id;

/** A library entry as the coach's own catalogue row, through the catalogue's own validation. */
export function libraryToCatalogue(e: LibraryExercise): ValidateResult<CleanCatalogueItem> {
  return validateCatalogueCreate({
    name: e.name,
    category: catalogueCategory(e),
    demoVideoUrl: e.demo.videoUrl,
    primaryCues: e.cues.slice(0, 3),
    commonFaults: e.faults.map((f) => ({ fault: f.fault, correctionCue: f.fix })),
    equipment: e.equipment.map(label),
    defaultTempo: e.dosage.tempo ?? (e.dosage.reps ? '3-1-1-0' : '0-0-0-0'),
    pattern: e.pattern,
    braceMode: e.braceMode,
    skillLayer: e.skillLayer,
  });
}

/** The snapshot a coach submits (their row as it is now; they keep editing their own). */
export function catalogueToSubmission(row: {
  name: string; category: string; pattern: string | null; braceMode: string | null; skillLayer: string | null; primaryCues: string[];
  commonFaults: unknown; equipment: string[]; defaultTempo: string; demoVideoUrl: string | null;
}): SubmissionPayload {
  const faults = Array.isArray(row.commonFaults) ? row.commonFaults as { fault?: unknown; correctionCue?: unknown }[] : [];
  return {
    name: row.name, category: row.category, pattern: (row.pattern as MovementPattern | null) ?? null, braceMode: (row.braceMode as SubmissionPayload['braceMode']) ?? null,
    skillLayer: row.skillLayer, primaryCues: [...row.primaryCues],
    commonFaults: faults.filter((f) => typeof f?.fault === 'string').map((f) => ({ fault: String(f.fault), correctionCue: String(f.correctionCue ?? '') })),
    equipment: [...row.equipment], defaultTempo: row.defaultTempo, demoVideoUrl: row.demoVideoUrl,
  };
}

/** The muscles a pattern trains first, for a submission that names none (the owner refines them on review). */
const PATTERN_MUSCLES: Readonly<Record<MovementPattern, MuscleId[]>> = {
  squat: ['quads', 'glutes'], hinge: ['hamstrings', 'glutes'], lunge: ['quads', 'glutes'], push: ['chest', 'triceps'], pull: ['lats', 'mid-back'],
  carry: ['forearms', 'traps'], rotation: ['obliques', 'deep-core'], locomotion: ['quads', 'calves'], breath: ['diaphragm'], mobility: ['hip-flexors'], other: ['deep-core'],
};
const CATEGORY_OF: Readonly<Record<string, CategoryId>> = {
  'lower-body': 'strength', 'upper-push': 'strength', 'upper-pull': 'strength', core: 'core', mobility: 'mobility', conditioning: 'conditioning',
  plyometric: 'plyometric', skill: 'sport-skill', breath: 'recovery', recovery: 'recovery', general: 'strength',
};

/** Equipment words a coach typed → the library's ids (unknown words become 'other'). */
export function equipmentIds(words: readonly string[]): EquipmentId[] {
  const out = new Set<EquipmentId>();
  for (const w of words) {
    const t = w.trim().toLowerCase();
    if (!t || /^(none|bodyweight|body weight|no equipment)$/.test(t)) continue;
    const hit = EQUIPMENT.find((e) => e.id === t || e.label.toLowerCase() === t || (e.aliases as readonly string[]).includes(t) || `${e.label.toLowerCase()}s` === t);
    out.add(hit && isEquipmentId(hit.id) ? hit.id : 'other');
  }
  return [...out];
}

export const COACH_LICENCE = 'Coach submission, owner-approved for the FEL library';

/** An approved submission as a library entry. The owner's review page validates it before it is written. */
export function submissionToEntry(p: SubmissionPayload, submissionId: string, moderatorId: string): LibraryExercise {
  const pattern: MovementPattern = p.pattern ?? 'other';
  const category = CATEGORY_OF[p.category] ?? 'strength';
  const cues = p.primaryCues.filter((c) => c.trim()).slice(0, 3);
  const id = `coach-${slugify(p.name)}-${submissionId.slice(0, 6)}`.slice(0, 80).replace(/-+$/, '');
  return {
    id, slug: id, name: p.name, aliases: [], family: `coach-${pattern}`, variation: slugify(p.name) || 'base',
    pattern, plane: pattern === 'rotation' ? 'transverse' : 'sagittal', laterality: 'bilateral', category, level: 'intermediate',
    equipment: equipmentIds(p.equipment), primaryMuscles: PATTERN_MUSCLES[pattern], secondaryMuscles: [], sportTags: ['general'],
    goals: [category === 'mobility' ? 'mobility' : category === 'plyometric' ? 'power' : category === 'conditioning' ? 'conditioning' : 'strength'],
    skillLayer: p.skillLayer, braceMode: p.braceMode,
    setup: `Set up for the ${p.name.toLowerCase()} the way your coach showed you, with the equipment listed.`,
    cues: cues.length ? cues : ['Move on a smooth path at a steady tempo.'],
    faults: (() => {
      const own = p.commonFaults.filter((f) => f.fault.trim()).slice(0, 4).map((f) => ({ fault: f.fault, fix: f.correctionCue || 'Slow down and reset the start position.' }));
      return own.length ? own : [{ fault: 'Losing the start position between reps', fix: 'Reset still between reps.' }];
    })(),
    regressionId: null, progressionId: null, cautions: [], lowLoad: [], youthOk: true,
    prehabNote: category === 'prehab' ? PREHAB_NOTE : null,
    dosage: { sets: 3, reps: '8-10', restSec: 60, ...(/^\d{1,2}-\d{1,2}-\d{1,2}-\d{1,2}$/.test(p.defaultTempo) ? { tempo: p.defaultTempo } : {}) },
    demo: { clipKey: clipKeyFor(pattern, ''), videoUrl: p.demoVideoUrl && /^https?:\/\//.test(p.demoVideoUrl) ? p.demoVideoUrl : null, imageRef: null },
    source: { kind: 'coach-submitted', ref: submissionId, url: null, licence: COACH_LICENCE },
    review: { status: 'approved', reviewer: moderatorId, batch: 'coach-submitted' },
  };
}
