// The story's data (Phase B; plan "Placeholders" and "The autobiography pipeline"): the index and every chapter
// validate against the real worlds; a placeholder chapter keeps BOTH marks (placeholder: true and a [PLACEHOLDER]
// title); every sourceRef resolves (none yet); a chapter "from the book" with no sourceRef fails. The format is fixed
// now so Phase E's sourceRefs slot in.
import { describe, expect, it } from 'vitest';
import { STARTER_SPELLS } from '../magic/spells';
import { buildStoryMap } from '../world/story/storyMap';
import { CHAPTER_FILES, MANUSCRIPTS, STORY_INDEX, chapterById, nextChapterId, storyChapters } from './data';
import {
  PLACEHOLDER_PREFIX, chapterLines, placeholderMarks, validateChapter, validateStoryIndex, type ChapterContext, type StoryChapter,
} from './format';
import { PARTNER_BOLT } from './chapter';

const map = buildStoryMap();
const worlds = new Map([...map.worlds.values()].map((w) => [w.id, {
  spawns: new Set(Object.keys(w.spawns)), encounters: new Set(w.encounters.map((e) => e.id)), gates: new Set(w.gates.map((g) => g.id)),
}]));
const ctxFor = (c: StoryChapter): ChapterContext => ({
  cast: new Set(Object.keys(STORY_INDEX.cast)),
  worlds,
  manuscript: c.manuscript ? MANUSCRIPTS[c.manuscript] ?? null : null,
  spells: new Set([...STARTER_SPELLS.map((s) => s.id), PARTNER_BOLT]),
});
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe('the shipped story data', () => {
  const chapters = storyChapters();

  it('the index lists every chapter file, in order, each mapped to a real world, and validates', () => {
    expect(chapters.map((c) => c.id)).toEqual(STORY_INDEX.chapters.map((e) => e.id));
    expect(Object.keys(CHAPTER_FILES).sort()).toEqual(STORY_INDEX.chapters.map((e) => e.file).sort());
    expect(validateStoryIndex(STORY_INDEX, new Map(chapters.map((c) => [c.id, c])), new Set(map.worlds.keys()))).toEqual([]);
    expect(nextChapterId(null)).toBe('ch01');
    expect(chapterById('ch01')?.worldId).toBe('w1');
  });

  it('every chapter validates against the worlds, the cast and the spell table', () => {
    for (const c of chapters) expect(validateChapter(c, ctxFor(c)), c.id).toEqual([]);
  });

  it('Chapter 1 is a placeholder and keeps BOTH marks (the flag and the title); the index says so too', () => {
    const c = chapterById('ch01')!;
    expect(placeholderMarks(c)).toEqual({ flag: true, title: true });
    expect(c.title.startsWith(PLACEHOLDER_PREFIX)).toBe(true);
    expect(STORY_INDEX.placeholder).toBe(true);
    for (const m of Object.values(STORY_INDEX.cast)) expect(m.name.startsWith(PLACEHOLDER_PREFIX)).toBe(true);
  });

  it('every sourceRef resolves to its manuscript (none yet: no line of a placeholder carries one)', () => {
    for (const c of chapters) {
      const ms = c.manuscript ? MANUSCRIPTS[c.manuscript] : null;
      for (const l of chapterLines(c)) if (l.sourceRef !== undefined) expect(ms?.has(l.sourceRef), `${c.id}/${l.id}`).toBe(true);
      if (c.placeholder) expect(chapterLines(c).filter((l) => l.sourceRef)).toEqual([]);
    }
  });

  it('Chapter 1 is the plan\'s shape: the hub, the gate, traversal, camps, a mid-boss, the boss, the first fusion, the flight home', () => {
    const c = chapterById('ch01')!;
    const kinds = c.beats.map((b) => b.kind);
    for (const k of ['cutscene', 'dialogue', 'objective', 'fight', 'boss', 'travel', 'choice'] as const) expect(kinds).toContain(k);
    const fuse = c.beats.find((b) => b.kind === 'cutscene' && b.fuse)!;
    expect(fuse.setFlags).toMatchObject({ fusionUnlocked: true, flightUnlocked: true });
    // the first fusion comes right after the Chapter 1 boss, and the flight home right after it
    const i = c.beats.indexOf(fuse);
    expect(c.beats[i - 1].kind).toBe('boss');
    expect(c.beats[i + 1]).toMatchObject({ kind: 'travel', via: 'flight', to: { worldId: 'hub' } });
    // nothing before the finale unlocks fusion or flight
    for (const b of c.beats.slice(0, i)) expect(Object.keys(b.setFlags ?? {}).some((k) => /Unlocked$/.test(k)), b.id).toBe(false);
  });
});

describe('the placeholder guard', () => {
  const ch = chapterById('ch01')!;

  it('fails a placeholder chapter that loses its title mark', () => {
    const c = clone(ch); c.title = 'Chapter 1';
    expect(validateChapter(c, ctxFor(c)).join('\n')).toMatch(/title must start \[PLACEHOLDER\]/);
  });

  it('fails a chapter that drops `placeholder: true` but keeps the [PLACEHOLDER] title, or has no flag at all', () => {
    const c = clone(ch); c.placeholder = false;
    expect(validateChapter(c, ctxFor(c)).join('\n')).toMatch(/\[PLACEHOLDER\] title on a chapter marked placeholder: false/);
    const d = clone(ch) as unknown as Record<string, unknown>; delete d.placeholder;
    expect(validateChapter(d as unknown as StoryChapter, ctxFor(ch)).join('\n')).toMatch(/placeholder must be true or false/);
  });

  it('fails a chapter "from the book" with no manuscript and no sourceRef', () => {
    const c = clone(ch); c.placeholder = false; c.title = 'Chapter 1 — The First Gate';
    const errs = validateChapter(c, ctxFor(c)).join('\n');
    expect(errs).toMatch(/must name its manuscript/);
    expect(errs).toMatch(/no sourceRef on any line/);
  });

  it('a sourceRef that points at nothing fails; one that points at a paragraph passes (Phase E\'s shape)', () => {
    const c = clone(ch); c.placeholder = false; c.title = 'Chapter 1'; c.manuscript = '01-test';
    const first = c.beats.find((b) => b.kind === 'dialogue')!;
    if (first.kind !== 'dialogue') throw new Error('shape');
    first.lines[0].sourceRef = 'p012';
    const good: ChapterContext = { ...ctxFor(c), manuscript: new Set(['p001', 'p012']) };
    expect(validateChapter(c, good)).toEqual([]);
    first.lines[0].sourceRef = 'p999';
    expect(validateChapter(c, good).join('\n')).toMatch(/sourceRef p999 points at nothing/);
    expect(validateChapter(c, { ...good, manuscript: null }).join('\n')).toMatch(/has no manuscript/);
  });

  it('the index flags a placeholder chapter listed under an index not marked placeholder', () => {
    const ix = clone(STORY_INDEX); ix.placeholder = false;
    expect(validateStoryIndex(ix, new Map([[ch.id, ch]]), new Set(map.worlds.keys())).join('\n')).toMatch(/not marked placeholder/);
  });
});
