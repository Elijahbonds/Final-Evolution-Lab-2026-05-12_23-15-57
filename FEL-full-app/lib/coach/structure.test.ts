// Session structure (MIRROR-COACH P2, 2026-09-25): each new SessionExercise field is accepted when it is one of its
// values and refused, with its own error, when it is not; the session-level reads (order, sections, superset labels,
// dose line, warnings, moves) do what the builder and Today rely on; and a copy carries every prescription column.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PRESCRIPTION_COLUMNS, STRUCTURE_DEFAULTS, STRUCTURE_ERROR_COPY, doseLine, groupBySection, moveWithinSection, prescriptionCopy,
  sessionOrder, sessionWarnings, supersetLabels, validateStructure, warningText, type StructureError, type StructuredItem,
} from './structure';

const ok = (input: Record<string, unknown>) => {
  const r = validateStructure(input);
  if (!r.ok) throw new Error(`refused: ${r.error}`);
  return r.structure;
};
const err = (input: Record<string, unknown>) => {
  const r = validateStructure(input);
  return r.ok ? 'accepted' : r.error;
};

describe('validateStructure — every new field, accepted and refused', () => {
  it('nothing sent = the schema defaults (an old client that never heard of structure keeps working)', () => {
    expect(ok({})).toEqual(STRUCTURE_DEFAULTS);
    expect(STRUCTURE_DEFAULTS).toEqual({ section: 'key', isKeySet: false, supersetGroup: null, workSeconds: null, holdSeconds: null, setupCues: [], effortBand: null });
    expect(ok({ section: '', isKeySet: null, supersetGroup: ' ', workSeconds: '', holdSeconds: null, setupCues: null, effortBand: '' })).toEqual(STRUCTURE_DEFAULTS);
  });

  it('section: the six values (any case) in; anything else out', () => {
    for (const s of ['prep', 'prime', 'key', 'assist', 'finish', 'cooldown']) expect(ok({ section: s }).section).toBe(s);
    expect(ok({ section: ' Cooldown ' }).section).toBe('cooldown');
    for (const s of ['warmup', 'cool-down', 'main', 7, true]) expect(err({ section: s })).toBe('section_unknown');
  });

  it('isKeySet: true/false (or their strings) in; only inside the Key section; anything else out', () => {
    expect(ok({ isKeySet: true }).isKeySet).toBe(true);
    expect(ok({ isKeySet: 'false' }).isKeySet).toBe(false);
    expect(ok({ section: 'key', isKeySet: 'true' }).isKeySet).toBe(true);
    for (const v of ['yes', 1, 0, {}]) expect(err({ isKeySet: v })).toBe('key_set_format');
    expect(err({ section: 'prep', isKeySet: true })).toBe('key_set_outside_key');
    expect(ok({ section: 'prep', isKeySet: false }).section).toBe('prep');
  });

  it('supersetGroup: one letter (upper-cased) in; words, digits and pairs out', () => {
    expect(ok({ supersetGroup: 'a' }).supersetGroup).toBe('A');
    expect(ok({ supersetGroup: ' B ' }).supersetGroup).toBe('B');
    for (const g of ['AB', 'A1', '1', 'superset', '-', 3]) expect(err({ supersetGroup: g })).toBe('superset_group_format');
  });

  it('workSeconds: 1–1800 whole seconds (numbers or numeric strings, rounded) in; zero, negative, huge and junk out', () => {
    expect(ok({ workSeconds: 30 }).workSeconds).toBe(30);
    expect(ok({ workSeconds: '45' }).workSeconds).toBe(45);
    expect(ok({ workSeconds: 29.6 }).workSeconds).toBe(30);
    expect(ok({ workSeconds: 1800 }).workSeconds).toBe(1800);
    for (const v of [0, -5, 1801, 99999, 'half a minute', NaN, Infinity, [30]]) expect(err({ workSeconds: v })).toBe('work_seconds_range');
  });

  it('holdSeconds: 1–300 in; out of range and junk out', () => {
    expect(ok({ holdSeconds: 3 }).holdSeconds).toBe(3);
    expect(ok({ holdSeconds: '300' }).holdSeconds).toBe(300);
    for (const v of [0, 301, 7200, 'long', -1]) expect(err({ holdSeconds: v })).toBe('hold_seconds_range');
  });

  it('setupCues: ids from the pick-list (deduped, at most 3) in; free text, unknown ids, a fourth cue and non-lists out', () => {
    expect(ok({ setupCues: ['wall-behind', 'tripod-down'] }).setupCues).toEqual(['wall-behind', 'tripod-down']);
    expect(ok({ setupCues: ['wall-behind', 'wall-behind'] }).setupCues).toEqual(['wall-behind']);
    expect(ok({ setupCues: [] }).setupCues).toEqual([]);
    expect(err({ setupCues: ['Push the wall behind you with your hips.'] })).toBe('setup_cue_unknown');
    expect(err({ setupCues: ['bend-the-bar'] })).toBe('setup_cue_unknown');
    expect(err({ setupCues: ['wall-behind', 'tripod-down', 'light-punch', 'floor-away'] })).toBe('setup_cues_too_many');
    expect(err({ setupCues: 'wall-behind' })).toBe('setup_cues_format');
    expect(err({ setupCues: [1, 2] })).toBe('setup_cues_format');
  });

  it('effortBand: FEL\'s five ids (any case) in; RPE numbers, other scales\' words and junk out', () => {
    for (const b of ['idle', 'cruise', 'drive', 'surge', 'full']) expect(ok({ effortBand: b }).effortBand).toBe(b);
    expect(ok({ effortBand: 'Surge' }).effortBand).toBe('surge');
    for (const b of ['moderate', 'max', 'RPE7', 7, 'full throttle']) expect(err({ effortBand: b })).toBe('effort_band_unknown');
  });

  it('every refusal has a line of copy for the coach', () => {
    const errors: StructureError[] = ['section_unknown', 'key_set_format', 'key_set_outside_key', 'superset_group_format', 'work_seconds_range',
      'hold_seconds_range', 'setup_cues_format', 'setup_cue_unknown', 'setup_cues_too_many', 'effort_band_unknown'];
    for (const e of errors) expect(STRUCTURE_ERROR_COPY[e]).toBeTruthy();
    expect(Object.keys(STRUCTURE_ERROR_COPY).sort()).toEqual([...errors].sort());
  });
});

// A session a coach might write: a prep flow, a primer, a key lift, a superset of two assists, a timed carry to
// finish and a breathing cool-down — stored out of order, as rows added over time are.
const S: (StructuredItem & { name: string; sets: number; reps: string; load: string; workSeconds?: number | null; holdSeconds?: number | null; effortBand?: string | null })[] = [
  { id: 'cool', order: 1, section: 'cooldown', name: 'Crocodile breathing', sets: 1, reps: '5 breaths', load: 'body', workSeconds: 120 },
  { id: 'rdl', order: 2, section: 'key', isKeySet: true, name: 'Trap-bar deadlift', sets: 4, reps: '5', load: 'RPE8', effortBand: 'surge' },
  { id: 'a2', order: 6, section: 'assist', supersetGroup: 'A', name: 'Half-kneeling row', sets: 3, reps: '10', load: 'RPE7' },
  { id: 'prep', order: 3, section: 'prep', name: '90/90 hip switch', sets: 2, reps: '6 each side', load: 'body', holdSeconds: 3 },
  { id: 'a1', order: 4, section: 'assist', supersetGroup: 'A', name: 'Split squat', sets: 3, reps: '8 each', load: 'RPE7', effortBand: 'drive' },
  { id: 'carry', order: 5, section: 'finish', name: 'Suitcase carry', sets: 3, reps: '30 s', load: '24kg', workSeconds: 30 },
  { id: 'hop', order: 7, section: 'prime', name: 'Pogo hops', sets: 2, reps: '10', load: 'body' },
];

describe('reading a session', () => {
  it('orders by section, then by stored order inside the section', () => {
    expect(sessionOrder(S).map((x) => x.id)).toEqual(['prep', 'hop', 'rdl', 'a1', 'a2', 'carry', 'cool']);
  });

  it('groups into the non-empty sections, in running order, with FEL labels', () => {
    const g = groupBySection(S);
    expect(g.map((x) => [x.section, x.label, x.items.map((i) => i.id)])).toEqual([
      ['prep', 'Prep', ['prep']], ['prime', 'Prime', ['hop']], ['key', 'Key', ['rdl']], ['assist', 'Assist', ['a1', 'a2']],
      ['finish', 'Finish', ['carry']], ['cooldown', 'Cool-down', ['cool']],
    ]);
    // a row with no section (read before the P2 push) sits in Key
    expect(groupBySection([{ id: 'old', order: 1 }]).map((x) => x.section)).toEqual(['key']);
  });

  it('labels superset members A1, A2 in display order; lone exercises get nothing', () => {
    expect(supersetLabels(S)).toEqual({ a1: 'A1', a2: 'A2' });
  });

  it('writes the dose as a timer for timed work, with the hold and the band', () => {
    const by = (id: string) => S.find((x) => x.id === id)!;
    expect(doseLine(by('rdl'))).toBe('4 × 5 @ RPE8 · Surge');
    expect(doseLine(by('carry'))).toBe('3 × 30 s @ 24kg');
    expect(doseLine(by('prep'))).toBe('2 × 6 each side @ body · hold 3 s');
    expect(doseLine({ sets: 1, reps: '8-10', workSeconds: 120 })).toBe('1 × 120 s');
    expect(doseLine({ sets: 3, reps: '8-10', load: '', effortBand: 'nonsense' })).toBe('3 × 8-10');
  });

  it('warns about a lone superset member, a superset across sections, a split superset and two key sets', () => {
    expect(sessionWarnings(S)).toEqual([]);
    expect(sessionWarnings([...S, { id: 'b1', order: 8, section: 'assist', supersetGroup: 'B' }])).toEqual([{ kind: 'superset_alone', group: 'B' }]);
    expect(sessionWarnings(S.map((x) => x.id === 'a2' ? { ...x, section: 'finish' } : x))).toEqual([{ kind: 'superset_split_sections', group: 'A' }]);
    const split = [...S, { id: 'mid', order: 5, section: 'assist' }].map((x) => x.id === 'a2' ? { ...x, order: 9 } : x);
    expect(sessionWarnings(split)).toEqual([{ kind: 'superset_not_together', group: 'A' }]);
    expect(sessionWarnings(S.map((x) => x.id === 'a1' ? { ...x, section: 'key', supersetGroup: null, isKeySet: true } : x))).toEqual([{ kind: 'superset_alone', group: 'A' }, { kind: 'key_set_many', count: 2 }]);   // a1 left A, so A2 is alone too
    for (const w of [{ kind: 'superset_alone', group: 'B' }, { kind: 'key_set_many', count: 2 }] as const) expect(warningText(w)).toMatch(/B|2/);
  });

  it('moves an exercise within its own section and never across into the next one', () => {
    // a2 up: it swaps with a1; the whole session is renumbered 1..n in display order, only changed rows returned
    const up = moveWithinSection(S, 'a2', 'up');
    const after = S.map((x) => ({ ...x, order: up.find((u) => u.id === x.id)?.order ?? x.order }));
    expect(sessionOrder(after).map((x) => x.id)).toEqual(['prep', 'hop', 'rdl', 'a2', 'a1', 'carry', 'cool']);
    expect(moveWithinSection(S, 'a1', 'up')).toEqual([]);      // first in Assist: the key lift above is another section
    expect(moveWithinSection(S, 'rdl', 'down')).toEqual([]);
    expect(moveWithinSection(S, 'nope', 'up')).toEqual([]);
    // duplicate orders (rows written before this existed) come out as a clean 1..n
    const dup = [{ id: 'x', order: 1 }, { id: 'y', order: 1 }, { id: 'z', order: 1 }];
    const m = moveWithinSection(dup, 'z', 'up');
    const next = dup.map((x) => ({ ...x, order: m.find((u) => u.id === x.id)?.order ?? x.order }));
    expect(sessionOrder(next).map((x) => x.id)).toEqual(['x', 'z', 'y']);
    expect(new Set(next.map((x) => x.order)).size).toBe(3);
  });
});

describe('a copy carries every prescription column', () => {
  it('PRESCRIPTION_COLUMNS is every SessionExercise column but the row\'s own identity, links and timestamps', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    const models = new Set([...schema.matchAll(/^model\s+(\w+)/gm)].map((m) => m[1]));
    const model = /^model SessionExercise \{([\s\S]*?)^\}/m.exec(schema)![1];
    const columns = model.split('\n').map((l) => l.replace(/\/\/.*$/, '').trim())
      .filter((l) => /^\w+\s+\w/.test(l) && !l.startsWith('@@'))
      .map((l) => l.split(/\s+/))
      .filter(([, type]) => !models.has(type.replace(/[?[\]]/g, '')))       // relation fields hold no column
      .map(([name]) => name)
      .filter((c) => !['id', 'sessionId', 'createdAt', 'updatedAt'].includes(c));
    expect(columns).toContain('section');                                     // the parse sees the P2 columns
    expect([...PRESCRIPTION_COLUMNS].sort()).toEqual(columns.sort());
  });

  it('copies structure as stored, and a row read before the push as the defaults', () => {
    const row = { id: 'se1', sessionId: 's1', exerciseId: 'pe1', order: 2, sets: 3, reps: '30 s', load: '24kg', tempo: '1-0-1-0', restSeconds: 60, coachNote: null,
      section: 'finish', isKeySet: false, supersetGroup: 'B', workSeconds: 30, holdSeconds: null, setupCues: ['crush-handle'], effortBand: 'drive', createdAt: new Date() };
    const copy = prescriptionCopy(row);
    expect(copy).toEqual({ exerciseId: 'pe1', order: 2, sets: 3, reps: '30 s', load: '24kg', tempo: '1-0-1-0', restSeconds: 60, coachNote: null,
      section: 'finish', isKeySet: false, supersetGroup: 'B', workSeconds: 30, holdSeconds: null, setupCues: ['crush-handle'], effortBand: 'drive' });
    expect(copy.setupCues).not.toBe(row.setupCues);
    const legacy = prescriptionCopy({ exerciseId: 'pe1', order: 1, sets: 3, reps: '8', load: 'RPE7', tempo: '3-1-1-0', restSeconds: 90, coachNote: 'x' });
    expect(legacy).toMatchObject(STRUCTURE_DEFAULTS);
  });
});
