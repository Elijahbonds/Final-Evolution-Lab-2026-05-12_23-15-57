// The catalogue's pure rules (MIRROR-COACH P2, 2026-09-25): what a row may hold, the tags, and the KB bridge's field
// mapping. The same rules driven through the real routes are in catalogue-routes.test.ts.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BRACE_INFO, BRACE_MODES, CATALOGUE_ERROR_COPY, CATALOGUE_LIMITS, PATTERN_INFO, PATTERNS,
  kbToCatalogueItem, nameKey, ownsCatalogueItem, sentences, validateCatalogueCreate, validateCatalogueUpdate,
} from './catalogue';
import { screenText } from '@/lib/share/screen';

const ROOT = resolve(process.cwd());
const schema = readFileSync(`${ROOT}/prisma/schema.prisma`, 'utf8');
const model = (name: string) => { const m = new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema); return m ? m[1] : ''; };
const enumValues = (name: string) => (new RegExp(`enum ${name} \\{([\\s\\S]*?)\\}`).exec(schema)?.[1] ?? '').split('\n').map((l) => l.trim()).filter((l) => /^[a-z]+$/.test(l));

describe('the schema the catalogue is written against', () => {
  // P2 review (2026-09-26): the per-coach key (@@unique([coachId, name])) drops the FEL-wide `name @unique` index, which
  // owner decision #16's additive-only GO did not cover; it waited for an explicit go and got it (owner decision #28,
  // 2026-09-26; painfree/p2/schema-structure/held-unique-swap.sql). Names are unique PER COACH now.
  it('ProgramExercise names are unique per coach (owner #28), not across FEL; both schema copies agree', () => {
    const pe = model('ProgramExercise');
    expect(pe).not.toMatch(/^\s*name\s+String\s+@unique/m);
    expect(pe).toMatch(/^\s*@@unique\(\[coachId, name\]\)/m);
    // both copies of the schema say the same (the generator line is the only allowed difference)
    const pub = readFileSync(`${ROOT}/public/_prisma/schema.prisma`, 'utf8');
    expect(/model ProgramExercise \{[\s\S]*?\n\}/.exec(pub)?.[0]).toBe(/model ProgramExercise \{[\s\S]*?\n\}/.exec(schema)?.[0]);
  });

  it('the generated client matches: the compound coachId_name key exists and `name` alone is no longer a unique key', () => {
    const dts = readFileSync(`${ROOT}/public/_prisma/client/index.d.ts`, 'utf8');
    expect(dts).toMatch(/coachId_name\?: ProgramExerciseCoachIdNameCompoundUniqueInput/);
    const unique = /export type ProgramExerciseWhereUniqueInput = [\s\S]*?\n\s*\}/.exec(dts)?.[0] ?? '';
    expect(unique).not.toMatch(/\n\s*name\?: string/);
  });

  it('PATTERNS and BRACE_MODES are exactly the enums, and every value has FEL copy', () => {
    expect([...PATTERNS].sort()).toEqual(enumValues('MovementPattern').sort());
    expect([...BRACE_MODES].sort()).toEqual(enumValues('BraceMode').sort());
    for (const p of PATTERNS) expect(PATTERN_INFO[p].label).toBeTruthy();
    for (const b of BRACE_MODES) expect(BRACE_INFO[b].label).toBeTruthy();
  });

  it('the tag copy is movement words only (lib/share/screen.ts: no condition, treatment or guarantee)', () => {
    const copy = [...Object.values(PATTERN_INFO), ...Object.values(BRACE_INFO)].flatMap((x) => [x.label, x.hint]).concat(Object.values(CATALOGUE_ERROR_COPY));
    for (const line of copy) expect(screenText(line), line).toEqual([]);
  });
});

describe('validateCatalogueCreate', () => {
  it('fills the schema defaults and leaves the three tags EMPTY (null = untagged, never a guessed default)', () => {
    const v = validateCatalogueCreate({ name: '  Goblet   Squat ' });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.item).toEqual({
      name: 'Goblet Squat', category: 'general', demoVideoUrl: null, primaryCues: [], commonFaults: [], equipment: [],
      defaultTempo: '3-1-1-0', pattern: null, braceMode: null, skillLayer: null, progressionOfId: null, regressionOfId: null,
    });
  });

  it('keeps a full row: tags, cues, faults, video, equipment from a comma string', () => {
    const v = validateCatalogueCreate({
      name: 'Goblet Squat', category: 'Lower-Body', pattern: 'squat', braceMode: 'set', skillLayer: 'strength',
      primaryCues: ['Elbows inside the knees', ' ', 'Push the floor away'], commonFaults: [{ fault: 'Heels lift', correctionCue: 'Heel, big toe, little toe' }, { fault: '', correctionCue: 'orphan fix' }],
      demoVideoUrl: 'https://video.example/goblet.mp4', equipment: 'kettlebell,  box ', defaultTempo: '3-1-1-0',
    });
    expect(v.ok && v.item).toMatchObject({
      category: 'lower-body', pattern: 'squat', braceMode: 'set', skillLayer: 'strength',
      primaryCues: ['Elbows inside the knees', 'Push the floor away'],
      commonFaults: [{ fault: 'Heels lift', correctionCue: 'Heel, big toe, little toe' }],
      demoVideoUrl: 'https://video.example/goblet.mp4', equipment: ['kettlebell', 'box'],
    });
  });

  it.each([
    [{ name: '' }, 'name_required', 'name'],
    [{ name: 'x'.repeat(CATALOGUE_LIMITS.name + 1) }, 'name_too_long', 'name'],
    [{ name: 'A', demoVideoUrl: 'javascript:alert(1)' }, 'video_url', 'demoVideoUrl'],
    [{ name: 'A', defaultTempo: 'fast' }, 'tempo_format', 'defaultTempo'],
    [{ name: 'A', primaryCues: ['a', 'b', 'c', 'd'] }, 'too_many_cues', 'primaryCues'],
    [{ name: 'A', primaryCues: ['x'.repeat(CATALOGUE_LIMITS.cue + 1)] }, 'cue_too_long', 'primaryCues'],
    [{ name: 'A', pattern: 'deadlift' }, 'pattern_unknown', 'pattern'],
    [{ name: 'A', braceMode: 'valsalva' }, 'brace_unknown', 'braceMode'],
    [{ name: 'A', skillLayer: 'stability' }, 'skill_layer_unknown', 'skillLayer'],
    [{ name: 'A', category: 'Lower Body!' }, 'category_format', 'category'],
  ])('refuses %j with %s on %s (the old POST stored all of these)', (input, error, field) => {
    expect(validateCatalogueCreate(input as Record<string, unknown>)).toEqual({ ok: false, error, field });
  });

  it('flags medical language as a WARNING and still saves (a private notebook: flag, never rewrite, never block)', () => {
    const v = validateCatalogueCreate({ name: 'Wall Sit', primaryCues: ['This cures tendinitis'] });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.item.primaryCues).toEqual(['This cures tendinitis']);   // untouched
    expect(v.warnings.map((w) => w.kind).sort()).toEqual(['condition', 'treatment']);
  });
});

describe('validateCatalogueUpdate', () => {
  it('changes only what was sent; null or "" clears an optional field; a missing field is left alone', () => {
    const v = validateCatalogueUpdate({ pattern: 'hinge', braceMode: '', demoVideoUrl: null });
    expect(v.ok && v.item).toEqual({ pattern: 'hinge', braceMode: null, demoVideoUrl: null });
  });
  it('an update cannot blank the name', () => {
    expect(validateCatalogueUpdate({ name: '   ' })).toEqual({ ok: false, error: 'name_required', field: 'name' });
  });
});

describe('ownership and names', () => {
  it('only the coach who owns a row owns it', () => {
    expect(ownsCatalogueItem({ coachId: 'coach-1' }, 'coach-1')).toBe(true);
    expect(ownsCatalogueItem({ coachId: 'coach-1' }, 'coach-2')).toBe(false);
    expect(ownsCatalogueItem(null, 'coach-1')).toBe(false);
    expect(ownsCatalogueItem({ coachId: 'coach-1' }, null)).toBe(false);
  });
  it('names compare the way a coach reads them', () => {
    expect(nameKey(' Goblet  squat')).toBe(nameKey('goblet Squat'));
    expect(nameKey('Goblet Squat')).not.toBe(nameKey('Goblet Squats'));
  });
});

describe('the KB bridge mapping', () => {
  const kb = {
    id: 'kb-1', slug: 'box-out-drill', name: 'Box-Out Positioning Drill', videoUrl: 'https://youtu.be/abc',
    coachingCues: 'Locate the man. Make contact first. Widen fast. "Hit first. Widen fast." Hold.',
    commonMistakes: 'Narrow base (easily displaced). Bouncing too high — should be a vibration, not a jump. Watching the ball.',
    category: { name: 'Basketball Application' },
  };
  const tags = { pattern: 'other' as const, braceMode: 'reflex' as const, skillLayer: null, category: 'skill', tempo: '0-0-0-0' };

  it('copies name, video, category, tempo and ALL THREE tags onto the catalogue row', () => {
    const { item } = kbToCatalogueItem(kb, tags);
    expect(item).toMatchObject({ name: 'Box-Out Positioning Drill', demoVideoUrl: 'https://youtu.be/abc', category: 'skill', defaultTempo: '0-0-0-0', pattern: 'other', braceMode: 'reflex', skillLayer: null, equipment: [], progressionOfId: null, regressionOfId: null });
  });

  it('cues: the tag table\'s short cues when it has them, else the KB\'s first sentences, at most 3', () => {
    expect(kbToCatalogueItem(kb, tags).item.primaryCues).toEqual(['Locate the man', 'Make contact first', 'Widen fast']);
    expect(kbToCatalogueItem(kb, { ...tags, cues: ['Hit first', 'Widen fast'] }).item.primaryCues).toEqual(['Hit first', 'Widen fast']);
  });

  it('faults: one per mistake sentence, and "X — Y" becomes fault X with the fix Y', () => {
    expect(kbToCatalogueItem(kb, tags).item.commonFaults).toEqual([
      { fault: 'Narrow base (easily displaced)', correctionCue: '' },
      { fault: 'Bouncing too high', correctionCue: 'Should be a vibration, not a jump' },
      { fault: 'Watching the ball', correctionCue: '' },
    ]);
  });

  it('a sentence that makes a medical claim is left behind and NAMED in `dropped`, never silently rewritten', () => {
    const { item, dropped } = kbToCatalogueItem({ ...kb, coachingCues: 'Stay tall. This will cure sciatica. Breathe out.' }, tags);
    expect(item.primaryCues).toEqual(['Stay tall', 'Breathe out']);
    expect(dropped).toEqual(['This will cure sciatica']);
  });

  it('a KB video that is not an http(s) link is not copied', () => {
    expect(kbToCatalogueItem({ ...kb, videoUrl: '' }, tags).item.demoVideoUrl).toBeNull();
    expect(kbToCatalogueItem({ ...kb, videoUrl: 'ftp://x/y' }, tags).item.demoVideoUrl).toBeNull();
  });

  it('the copy passes the same validation a coach\'s own row does', () => {
    const { item } = kbToCatalogueItem(kb, tags);
    const v = validateCatalogueCreate(item as unknown as Record<string, unknown>);
    expect(v.ok && v.item).toEqual(item);
  });
});

describe('sentences', () => {
  it('never cuts a quoted two-sentence cue in half', () => {
    expect(sentences('Contact. "Hit first. Widen fast." Then go.')).toEqual(['Contact.', '"Hit first. Widen fast."', 'Then go.']);
  });
});
