// The coach's prescribable catalogue — pure rules behind /api/coach/programs/exercises (MIRROR-COACH P2, 2026-09-25).
//
// WHAT WAS WRONG. The builder prescribes only ProgramExercise rows, and until this phase no page the app serves could
// write one: the only form that POSTed to /api/coach/programs/exercises was components/training/library/
// ExerciseLibrary.tsx, mounted only inside TrainingCoachDashboard, which no route renders (measured in P1:
// lib/coach/loop-baseline.test.ts BASELINE 1). So the Clients-tab dropdown was empty, the Mirror's screen
// prescriptions (lib/coach/mirrorToProgram.ts) matched against nothing and said "No match in your catalogue", and a
// coach's only exercise library was the Blueprint knowledge base, which the builder cannot prescribe. On top of that
// the name was @unique across ALL coaches (prisma/schema.prisma, was :1454), so the second coach to type "Goblet
// Squat" got a 500, and the POST route kept whatever it was sent: a fourth cue, a `javascript:` video link, a tempo
// of "fast".
//
// WHAT THIS IS. The one place that says what a catalogue row may hold: validation for a create or an edit, the three
// tags the P2 schema added (pattern, brace mode, skill layer), and the knowledge-base → catalogue bridge's field
// mapping. Prisma-free and DOM-free so it runs as a test; lib/coach/catalogueServer.ts does the database half.
//
// TWO READINGS WRITTEN DOWN HERE BECAUSE THE SCHEMA COMMENT IS AMBIGUOUS. `regressionOfId` / `progressionOfId` say
// "ID of exercise this is regression of", which reads the opposite way from the only data that uses them (the P1
// fixture: Goblet Squat's regressionOfId is Box Squat, the easier one). The catalogue takes the data's reading, and
// labels it in the form so nobody has to guess: regressionOfId = "step down to" (the easier version), progressionOfId
// = "step up to" (the harder one). assumption: the Today lane (P2) reads it the same way, since it renders the
// fixture's Box Squat as the regression.
import type { BraceMode, MovementPattern } from '@/public/_prisma/client';
import { screenText, type TextFlag } from '@/lib/share/screen';
import { isSkillLayerId } from './taxonomy';

// ── the tags ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The schema's MovementPattern values, in the order a coach reads them. Kept equal to the enum by the types below. */
export const PATTERNS = ['squat', 'hinge', 'lunge', 'push', 'pull', 'carry', 'rotation', 'locomotion', 'breath', 'mobility', 'other'] as const satisfies readonly MovementPattern[];
/** The schema's BraceMode values. */
export const BRACE_MODES = ['set', 'reflex', 'none'] as const satisfies readonly BraceMode[];
// …and the reverse direction, so a value added to the enum without a label here fails the type check, not a coach.
type MissingPattern = Exclude<MovementPattern, (typeof PATTERNS)[number]>;
type MissingBrace = Exclude<BraceMode, (typeof BRACE_MODES)[number]>;
const _allPatterns: [MissingPattern] extends [never] ? true : MissingPattern = true;
const _allBraces: [MissingBrace] extends [never] ? true : MissingBrace = true;
void _allPatterns; void _allBraces;

/** FEL's one-line reading of each pattern, shown beside the picker. Movement words only — nothing about a body's condition. */
export const PATTERN_INFO: Record<MovementPattern, { label: string; hint: string }> = {
  squat: { label: 'Squat', hint: 'Both feet down; hips and knees bend together.' },
  hinge: { label: 'Hinge', hint: 'Hips travel back while the shins stay nearly still.' },
  lunge: { label: 'Lunge', hint: 'Split stance or one leg: lunges, split squats, step-ups.' },
  push: { label: 'Push', hint: 'Pressing away: push-ups, presses.' },
  pull: { label: 'Pull', hint: 'Pulling in: rows, pull-ups.' },
  carry: { label: 'Carry', hint: 'Walking with a load.' },
  rotation: { label: 'Rotation', hint: 'Turning, or holding still against a turn.' },
  locomotion: { label: 'Locomotion', hint: 'Hops, bounds, sprints, cuts.' },
  breath: { label: 'Breath', hint: 'A breathing drill.' },
  mobility: { label: 'Mobility', hint: 'Range work: joint circles, end-range holds.' },
  other: { label: 'Other', hint: 'None of the above, tagged on purpose.' },
};

export const BRACE_INFO: Record<BraceMode, { label: string; hint: string }> = {
  set: { label: 'Set brace', hint: 'A brace built on purpose before the rep, as in a lift.' },
  reflex: { label: 'Reflex brace', hint: 'The brace has to show up on its own mid-play: a landing, a cut, a bounce.' },
  none: { label: 'No brace', hint: 'No brace asked for: a breath drill, an easy flow.' },
};

export const isPattern = (v: unknown): v is MovementPattern => typeof v === 'string' && (PATTERNS as readonly string[]).includes(v);
export const isBraceMode = (v: unknown): v is BraceMode => typeof v === 'string' && (BRACE_MODES as readonly string[]).includes(v);

/**
 * Body-region categories the builder and the Mirror's matcher already speak (the retired form's six, plus the ones
 * the seed and the knowledge-base bridge need). `category` stays a free string in the schema; a coach may type their
 * own as long as it is a short lowercase slug.
 */
export const CATALOGUE_CATEGORIES: readonly { id: string; label: string }[] = [
  { id: 'lower-body', label: 'Lower body' }, { id: 'upper-push', label: 'Upper push' }, { id: 'upper-pull', label: 'Upper pull' },
  { id: 'core', label: 'Core' }, { id: 'mobility', label: 'Mobility' }, { id: 'conditioning', label: 'Conditioning' },
  { id: 'plyometric', label: 'Plyometric' }, { id: 'skill', label: 'Skill' }, { id: 'breath', label: 'Breath' },
  { id: 'recovery', label: 'Recovery' }, { id: 'general', label: 'General' },
];

// ── limits ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export const CATALOGUE_LIMITS = {
  name: 80, category: 32, cues: 3, cue: 140, faults: 6, fault: 140, equipment: 8, equipmentItem: 40, url: 500,
} as const;

export interface CommonFault { fault: string; correctionCue: string }

/** A row as the database will take it. */
export interface CleanCatalogueItem {
  name: string;
  category: string;
  demoVideoUrl: string | null;
  primaryCues: string[];
  commonFaults: CommonFault[];
  equipment: string[];
  defaultTempo: string;
  pattern: MovementPattern | null;
  braceMode: BraceMode | null;
  skillLayer: string | null;
  progressionOfId: string | null;
  regressionOfId: string | null;
}

export type CatalogueField = keyof CleanCatalogueItem;
export const CATALOGUE_FIELDS: readonly CatalogueField[] = [
  'name', 'category', 'demoVideoUrl', 'primaryCues', 'commonFaults', 'equipment', 'defaultTempo',
  'pattern', 'braceMode', 'skillLayer', 'progressionOfId', 'regressionOfId',
];

export type CatalogueError =
  | 'name_required' | 'name_too_long' | 'category_format' | 'video_url' | 'too_many_cues' | 'cue_too_long'
  | 'too_many_faults' | 'fault_too_long' | 'too_much_equipment' | 'equipment_too_long' | 'tempo_format'
  | 'pattern_unknown' | 'brace_unknown' | 'skill_layer_unknown' | 'bad_link';

export type ValidateResult<T> = { ok: true; item: T; warnings: TextFlag[] } | { ok: false; error: CatalogueError; field: CatalogueField };

const DEFAULTS: CleanCatalogueItem = {
  name: '', category: 'general', demoVideoUrl: null, primaryCues: [], commonFaults: [], equipment: [], defaultTempo: '3-1-1-0',
  pattern: null, braceMode: null, skillLayer: null, progressionOfId: null, regressionOfId: null,
};

const text = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const blank = (v: unknown): boolean => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
/** A string list from an array or a comma-separated string (the equipment box accepts either). */
const list = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map(text).filter(Boolean);

class Reject extends Error { constructor(readonly error: CatalogueError, readonly field: CatalogueField) { super(error); } }

function cleanField(field: CatalogueField, v: unknown): CleanCatalogueItem[CatalogueField] {
  const L = CATALOGUE_LIMITS;
  switch (field) {
    case 'name': {
      const s = text(v);
      if (!s) throw new Reject('name_required', field);
      if (s.length > L.name) throw new Reject('name_too_long', field);
      return s;
    }
    case 'category': {
      if (blank(v)) return 'general';
      const s = text(v).toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]*$/.test(s) || s.length > L.category) throw new Reject('category_format', field);
      return s;
    }
    case 'demoVideoUrl': {
      if (blank(v)) return null;
      const s = text(v);
      // http(s) only: the link is rendered as an <a href> and a <video src> on the client's Today card.
      if (s.length > L.url || !/^https?:\/\/[^\s]+$/i.test(s)) throw new Reject('video_url', field);
      return s;
    }
    case 'primaryCues': {
      const cues = list(v);
      if (cues.length > L.cues) throw new Reject('too_many_cues', field);
      if (cues.some((c) => c.length > L.cue)) throw new Reject('cue_too_long', field);
      return cues;
    }
    case 'commonFaults': {
      const rows = (Array.isArray(v) ? v : []).map((r) => ({ fault: text((r as CommonFault)?.fault), correctionCue: text((r as CommonFault)?.correctionCue) })).filter((r) => r.fault);
      if (rows.length > L.faults) throw new Reject('too_many_faults', field);
      if (rows.some((r) => r.fault.length > L.fault || r.correctionCue.length > L.fault)) throw new Reject('fault_too_long', field);
      return rows;
    }
    case 'equipment': {
      const items = list(v);
      if (items.length > L.equipment) throw new Reject('too_much_equipment', field);
      if (items.some((e) => e.length > L.equipmentItem)) throw new Reject('equipment_too_long', field);
      return items;
    }
    case 'defaultTempo': {
      if (blank(v)) return '3-1-1-0';
      const s = text(v);
      if (!/^\d{1,2}-\d{1,2}-\d{1,2}-\d{1,2}$/.test(s)) throw new Reject('tempo_format', field);
      return s;
    }
    case 'pattern':
      if (blank(v)) return null;
      if (!isPattern(v)) throw new Reject('pattern_unknown', field);
      return v;
    case 'braceMode':
      if (blank(v)) return null;
      if (!isBraceMode(v)) throw new Reject('brace_unknown', field);
      return v;
    case 'skillLayer':
      if (blank(v)) return null;
      if (!isSkillLayerId(v)) throw new Reject('skill_layer_unknown', field);
      return v as string;
    case 'progressionOfId':
    case 'regressionOfId': {
      if (blank(v)) return null;
      const s = text(v);
      if (s.length > 64) throw new Reject('bad_link', field);
      return s;   // ownership (the coach's own row, not this row) is checked by the server, which can see the rows
    }
  }
}

/** Every piece of free text on a row, for the claims screen. */
export function itemText(item: Partial<CleanCatalogueItem>): string {
  return [item.name ?? '', ...(item.primaryCues ?? []), ...(item.commonFaults ?? []).flatMap((f) => [f.fault, f.correctionCue])].filter(Boolean).join('. ');
}

/**
 * A NEW catalogue row from whatever the form sent. Unknown keys are ignored; missing ones take the schema's defaults.
 *
 * `warnings` are lib/share/screen.ts's flags (a named condition, a treatment claim, a guarantee). They do NOT block
 * the save: a catalogue is the coach's private notebook, not a page FEL publishes, and that module's own rule is that
 * it flags and never rewrites. The form shows them so a coach who typed "fixes knee pain" sees it before a client does.
 */
export function validateCatalogueCreate(input: Record<string, unknown>): ValidateResult<CleanCatalogueItem> {
  try {
    const item = { ...DEFAULTS };
    for (const f of CATALOGUE_FIELDS) (item as Record<string, unknown>)[f] = cleanField(f, f === 'name' ? input.name : input[f] ?? (DEFAULTS as unknown as Record<string, unknown>)[f]);
    return { ok: true, item, warnings: screenText(itemText(item)) };
  } catch (e) {
    if (e instanceof Reject) return { ok: false, error: e.error, field: e.field };
    throw e;
  }
}

/** An EDIT: only the fields present in the body change; `null` / '' clears an optional one. */
export function validateCatalogueUpdate(input: Record<string, unknown>): ValidateResult<Partial<CleanCatalogueItem>> {
  try {
    const item: Partial<CleanCatalogueItem> = {};
    for (const f of CATALOGUE_FIELDS) if (f in input && input[f] !== undefined) (item as Record<string, unknown>)[f] = cleanField(f, input[f]);
    return { ok: true, item, warnings: screenText(itemText(item)) };
  } catch (e) {
    if (e instanceof Reject) return { ok: false, error: e.error, field: e.field };
    throw e;
  }
}

/** The coach owns the row. Everything that reads, edits or prescribes a catalogue row asks this first. */
export function ownsCatalogueItem(item: { coachId: string } | null | undefined, userId: string | null | undefined): boolean {
  return !!item && !!userId && item.coachId === userId;
}

/** A name compared the way a coach reads it: case and spacing do not make two exercises different. */
export const nameKey = (name: string): string => name.replace(/\s+/g, ' ').trim().toLowerCase();

/** What a coach reads when a save is refused, keyed by the error the route returns. */
export const CATALOGUE_ERROR_COPY: Record<CatalogueError | 'name_taken' | 'name_taken_fel' | 'in_use' | 'not_found' | 'not_prescribable' | 'unauthorized' | 'invalid_json', string> = {
  name_required: 'Give the exercise a name.',
  name_too_long: `Keep the name under ${CATALOGUE_LIMITS.name} characters.`,
  category_format: 'A category is one short word or hyphenated words, like lower-body.',
  video_url: 'The video link has to start with http:// or https://.',
  too_many_cues: `Up to ${CATALOGUE_LIMITS.cues} cues. One your athlete remembers beats three they don't.`,
  cue_too_long: `Keep each cue under ${CATALOGUE_LIMITS.cue} characters.`,
  too_many_faults: `Up to ${CATALOGUE_LIMITS.faults} common faults.`,
  fault_too_long: `Keep each fault and its fix under ${CATALOGUE_LIMITS.fault} characters.`,
  too_much_equipment: `Up to ${CATALOGUE_LIMITS.equipment} pieces of equipment.`,
  equipment_too_long: 'One of the equipment names is too long.',
  tempo_format: 'Tempo is four numbers like 3-1-1-0 (down, pause, up, pause, in seconds).',
  pattern_unknown: 'Pick a pattern from the list.',
  brace_unknown: 'Pick a brace mode from the list.',
  skill_layer_unknown: 'Pick a skill layer from the list.',
  bad_link: 'The easier or harder version has to be another exercise in your catalogue.',
  name_taken: 'You already have an exercise with that name.',
  // P2 review (2026-09-26): exercise names are still unique across FEL until the held key change lands
  name_taken_fel: 'Another coach on FEL already uses that exact name. Add a word to make it yours, for example "Goblet Squat, paused".',
  in_use: 'This exercise is in a program. Take it out of the program first.',
  not_found: 'That exercise is not in your catalogue.',
  not_prescribable: 'That one is an assessment, not an exercise, so it stays in the knowledge base.',
  unauthorized: 'Sign in again.',
  invalid_json: 'Something went wrong sending that. Try again.',
};

// ── the knowledge-base bridge ───────────────────────────────────────────────────────────────────────────────────────

/** The KB row fields the bridge reads (prisma Exercise + its category's name). */
export interface KbExerciseLike {
  id: string; name: string; slug: string; coachingCues: string; commonMistakes: string; videoUrl: string;
  category?: { name: string } | null;
}

/** FEL's tags for one KB item (lib/coach/kbTags.ts). */
export interface KbTagsLike {
  pattern: MovementPattern | null;
  braceMode: BraceMode | null;
  skillLayer: string | null;
  category: string;
  tempo?: string;
  cues?: readonly string[];
  prescribable?: boolean;
  /**
   * FEL's name for the COPY, where the KB item's own name is another method's label (MIRROR-COACH P2 review,
   * 2026-09-26; owner decision #8: FEL's own names, no renamed book or certification labels). The KB entry keeps its
   * name; only what lands in a coach's catalogue — and so on a client's Today card — is renamed.
   */
  name?: string;
}

/**
 * Split KB prose into sentences. The KB writes one idea per sentence, sometimes with an em-dash aside, and sometimes
 * quotes a two-sentence cue ("Hit first. Widen fast.") — a split inside an open quote is joined back up, so a quoted
 * cue is never cut to `"Hit first`.
 */
export function sentences(prose: string): string[] {
  const parts = prose.replace(/\s+/g, ' ').trim().split(/(?<=[.!?]"?)\s+(?=[A-Z0-9"'(])/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const prev = out[out.length - 1];
    if (prev !== undefined && ((prev.match(/"/g) ?? []).length % 2 === 1)) out[out.length - 1] = `${prev} ${p}`;
    else out.push(p);
  }
  return out;
}

/**
 * A KB exercise as a catalogue row, in the KB's own words (FEL's — the owner wrote the Blueprint knowledge base).
 *
 * Cues: the tag table's short cues when it has them (the KB's cue text is a paragraph, and the catalogue holds three
 * cues of ≤140 characters), else the KB's first sentences that fit. Faults: the KB's "common mistakes", one per
 * sentence; "X — Y" becomes fault X with fix Y. Any sentence that trips lib/share/screen.ts (a named condition, a
 * treatment claim, a guarantee) is left behind and listed in `dropped`: this is FEL editing FEL's own copy, so it may
 * leave a line out, but it says which.
 */
export function kbToCatalogueItem(kb: KbExerciseLike, tags: KbTagsLike): { item: CleanCatalogueItem; dropped: string[] } {
  const L = CATALOGUE_LIMITS;
  const dropped: string[] = [];
  const clean = (s: string) => { if (screenText(s).length) { dropped.push(s); return false; } return true; };

  const cueSource = tags.cues?.length ? [...tags.cues] : sentences(kb.coachingCues).map((s) => s.replace(/\.$/, ''));
  const primaryCues = cueSource.filter((c) => c.length <= L.cue).filter(clean).slice(0, L.cues);

  const commonFaults: CommonFault[] = sentences(kb.commonMistakes).filter(clean).map((s) => {
    const [fault, ...fix] = s.replace(/\.$/, '').split(/\s[—–]\s/);
    const cue = fix.join(' — ').trim();
    return { fault: fault.trim().slice(0, L.fault), correctionCue: (cue.charAt(0).toUpperCase() + cue.slice(1)).slice(0, L.fault) };
  }).filter((f) => f.fault).slice(0, L.faults);

  const video = text(kb.videoUrl);
  return {
    item: {
      name: text(tags.name ?? kb.name).slice(0, L.name),
      category: tags.category,
      demoVideoUrl: /^https?:\/\/[^\s]+$/i.test(video) && video.length <= L.url ? video : null,
      primaryCues,
      commonFaults,
      equipment: [],
      defaultTempo: tags.tempo ?? '3-1-1-0',
      pattern: tags.pattern,
      braceMode: tags.braceMode,
      skillLayer: tags.skillLayer,
      progressionOfId: null,
      regressionOfId: null,
    },
    dropped,
  };
}
