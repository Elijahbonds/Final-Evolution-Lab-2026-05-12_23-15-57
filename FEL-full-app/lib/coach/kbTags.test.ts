// FEL's knowledge-base tags (MIRROR-COACH P2, 2026-09-25): every seeded KB exercise has a row, every tag is a real
// value, the reasoning and the cues pass the honesty screen, and the bridge turns each seeded item into a row the
// catalogue's own validation accepts.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { KB_TAGS, kbTagView, kbTagsFor } from './kbTags';
import { BRACE_MODES, CATALOGUE_CATEGORIES, CATALOGUE_LIMITS, PATTERNS, kbToCatalogueItem, validateCatalogueCreate } from './catalogue';
import { SKILL_LAYER_IDS } from './taxonomy';
import { screenText } from '@/lib/share/screen';

const ROOT = resolve(process.cwd());

/** The seed's KB exercises, read out of scripts/seed.ts (the file the production KB was seeded from). */
function seededKb(): { name: string; slug: string; cat: string; cues: string; mistakes?: string; video?: string }[] {
  const src = readFileSync(`${ROOT}/scripts/seed.ts`, 'utf8');
  const start = src.indexOf('const exercises = [');
  const end = src.indexOf('\n  ];', start);
  // the array is plain object literals (strings and numbers); evaluate just that slice
  return new Function(`return ${src.slice(start + 'const exercises = '.length, end + 4)}`)();
}
const SEED = seededKb();

describe('KB_TAGS covers the seeded knowledge base', () => {
  it('reads the 20 seeded exercises', () => {
    expect(SEED.length).toBe(20);
  });

  it('every seeded slug has FEL\'s own row (no seeded item falls back to its category)', () => {
    expect(SEED.map((e) => e.slug).filter((s) => !KB_TAGS[s])).toEqual([]);
    expect(Object.keys(KB_TAGS).filter((s) => !SEED.some((e) => e.slug === s))).toEqual([]);
  });

  it('every tag is a real value (or a deliberate null), and every row says why', () => {
    for (const [slug, t] of Object.entries(KB_TAGS)) {
      if (t.pattern !== null) expect(PATTERNS, slug).toContain(t.pattern);
      if (t.braceMode !== null) expect(BRACE_MODES, slug).toContain(t.braceMode);
      if (t.skillLayer !== null) expect(SKILL_LAYER_IDS, slug).toContain(t.skillLayer);
      expect(CATALOGUE_CATEGORIES.map((c) => c.id), slug).toContain(t.category);
      if (t.tempo) expect(t.tempo, slug).toMatch(/^\d+-\d+-\d+-\d+$/);
      expect(t.why.length, slug).toBeGreaterThan(20);
    }
  });

  it('the judgement calls, pinned (a change here is a change of FEL\'s mind, not a refactor)', () => {
    const tag = (s: string) => [KB_TAGS[s].pattern, KB_TAGS[s].braceMode, KB_TAGS[s].skillLayer];
    expect(tag('crocodile-breathing')).toEqual(['breath', 'none', 'cylinder']);
    expect(tag('single-leg-pogos')).toEqual(['locomotion', 'reflex', 'jump-land']);
    expect(tag('hip-thrust-pogos')).toEqual(['hinge', 'reflex', 'jump-land']);
    expect(tag('overcoming-iso-5s')).toEqual([null, 'set', 'strength']);        // the coach picks the position
    expect(tag('integrated-set')).toEqual(['locomotion', null, 'jump-land']);    // asks for both brace modes
    expect(tag('neural-flush-supine')).toEqual(['breath', 'none', 'reset']);
    expect(tag('box-out-drill')).toEqual(['other', 'reflex', null]);             // no Playbook chapter teaches it
    expect(KB_TAGS['aston-audit'].prescribable).toBe(false);                     // an assessment, not a set
    // the six strength patterns are only where an item really trains them; the KB is breath, feet, range and bounce
    const counts = Object.values(KB_TAGS).reduce<Record<string, number>>((m, t) => { const k = t.pattern ?? 'untagged'; m[k] = (m[k] ?? 0) + 1; return m; }, {});
    expect(counts).toEqual({ breath: 5, mobility: 4, locomotion: 3, hinge: 1, squat: 2, push: 1, other: 2, untagged: 2 });
  });

  it('only the assessment is refused by the bridge', () => {
    expect(Object.entries(KB_TAGS).filter(([, t]) => t.prescribable === false).map(([s]) => s)).toEqual(['aston-audit']);
  });
});

describe('the honesty rule and the IP rule on FEL\'s own copy', () => {
  const lines = Object.values(KB_TAGS).flatMap((t) => [t.why, ...(t.cues ?? [])]);

  it('no named condition, treatment claim or guarantee (lib/share/screen.ts)', () => {
    for (const l of lines) expect(screenText(l), l).toEqual([]);
  });

  it('no "reduces risk" / "prevents injury" / diagnosis language, and no book or method brand names', () => {
    const banned = /reduc\w* (the )?risk|prevent\w*|injur\w*|diagnos\w*|rusin|cordoza|pain-free performance|ppsc|linchpin|tension table/i;
    for (const l of lines) expect(l, l).not.toMatch(banned);
    const src = readFileSync(`${ROOT}/lib/coach/kbTags.ts`, 'utf8') + readFileSync(`${ROOT}/lib/coach/catalogue.ts`, 'utf8');
    expect(src).not.toMatch(/rusin|cordoza|pain-free performance|ppsc|linchpin/i);
  });
});

describe('the bridge on every seeded item', () => {
  it('produces a row the catalogue\'s own validation accepts, with ≤3 short cues and the item\'s video', () => {
    for (const e of SEED) {
      const t = kbTagsFor(e.slug, e.cat);
      if (t.prescribable === false) continue;
      const { item, dropped } = kbToCatalogueItem({ id: e.slug, slug: e.slug, name: e.name, coachingCues: e.cues, commonMistakes: e.mistakes ?? '', videoUrl: e.video ?? '', category: { name: e.cat } }, t);
      expect(dropped, e.slug).toEqual([]);                        // the seeded KB trips nothing
      expect(item.primaryCues.length, e.slug).toBeGreaterThan(0);
      expect(item.primaryCues.length, e.slug).toBeLessThanOrEqual(CATALOGUE_LIMITS.cues);
      expect(item.commonFaults.length, e.slug).toBeGreaterThan(0);
      expect(item.demoVideoUrl, e.slug).toBe(e.video ?? null);
      expect([item.pattern, item.braceMode, item.skillLayer], e.slug).toEqual([t.pattern, t.braceMode, t.skillLayer]);
      const v = validateCatalogueCreate(item as unknown as Record<string, unknown>);
      expect(v.ok && v.item, e.slug).toEqual(item);
    }
  });
});

describe('kbTagsFor fallback for an exercise an admin added after the seed', () => {
  it('takes only what its whole category shares, and says so', () => {
    const t = kbTagsFor('admin-new-breath', 'Breath & Pressure');
    expect([t.pattern, t.braceMode, t.skillLayer, t.category]).toEqual(['breath', 'none', 'cylinder', 'breath']);
    expect(t.why).toMatch(/tagged by its category/);
    const o = kbTagsFor('admin-new-pogo', 'Oscillatory Drills');
    expect(o.pattern).toBeNull();                       // oscillatory drills are all reactive, not all one pattern
    expect(o.braceMode).toBe('reflex');
  });
  it('an unknown category is untagged, not guessed', () => {
    const t = kbTagsFor('mystery', 'Something New');
    expect([t.pattern, t.braceMode, t.skillLayer, t.category]).toEqual([null, null, null, 'general']);
    expect(kbTagView('mystery', null).prescribable).toBe(true);
  });
});

// MIRROR-COACH P2 review (2026-09-26), owner decision #8 (FEL's own names; no renamed book or certification labels):
// the KB names three items with another method's labels. The COPY a coach adds — what a client reads on Today — is
// named by FEL; the KB entry itself is untouched.
describe('the bridge copies FEL names, not another method\'s labels', () => {
  const METHOD_LABEL = /\b(CARs?|PAILs?|RAILs?|FRC)\b/;
  it('no seeded item reaches a catalogue under a method label, and nothing else is renamed', () => {
    const labelled = SEED.filter((e) => METHOD_LABEL.test(e.name)).map((e) => e.slug).sort();
    expect(labelled).toEqual(['ankle-cars', 'hip-cars', 'hip-pails-rails']);
    for (const e of SEED) {
      const { item } = kbToCatalogueItem({ id: e.slug, slug: e.slug, name: e.name, coachingCues: e.cues, commonMistakes: e.mistakes ?? '', videoUrl: e.video ?? '', category: { name: e.cat } }, kbTagsFor(e.slug, e.cat));
      expect(item.name, e.slug).not.toMatch(METHOD_LABEL);
      for (const c of item.primaryCues) expect(c, e.slug).not.toMatch(METHOD_LABEL);
      if (!labelled.includes(e.slug)) expect(item.name, e.slug).toBe(e.name);
    }
    expect(['ankle-cars', 'hip-cars', 'hip-pails-rails'].map((s) => KB_TAGS[s].name)).toEqual(['Ankle Circles', 'Hip Circles (90/90)', 'Hip End-Range Press and Pull']);
    // the Exercises tab is told the copy's name, so its "in your catalogue" check and its toast find the renamed row
    expect(kbTagView('hip-cars', 'Hip Mobility')).toMatchObject({ copyName: 'Hip Circles (90/90)' });
    expect(kbTagView('breath-reset', 'Breath & Pressure')).not.toHaveProperty('copyName');
  });
});
