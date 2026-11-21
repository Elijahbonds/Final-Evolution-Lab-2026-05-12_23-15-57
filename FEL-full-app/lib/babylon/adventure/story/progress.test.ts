// lane/story (2026-11-21; docs/STORY-FINISH-PLAN.md): where the player is in the story (the start screen's START / CONTINUE / EXPLORE)
// and what a chapter's end card says. Played, not assumed: the chapter is run headless to its end, and from EVERY step it saved on
// the way, the save is written to a device store, read back as a reload would, and the chapter is played on from it to its end —
// the save-and-continue proof. The end card's words are data and stay [DRAFT] until the owner writes them.
import { describe, expect, it } from 'vitest';
import { emptyAdventureSave, type AdventureSave } from '../contracts';
import { loadAdventureSave, storeAdventureSave, type SaveStorage } from '../save';
import { STARTER_SPELLS } from '../magic/spells';
import { buildStoryMap } from '../world/story/storyMap';
import { PARTNER_BOLT } from './chapter';
import { MANUSCRIPTS, STORY_INDEX, chapterById, storyChapters } from './data';
import { chapterDoneFlag, FLAG_FLIGHT_UNLOCKED } from './flags';
import { DRAFT_PREFIX, validateChapter, validateStoryIndex, type StoryChapter, type StoryIndex } from './format';
import { runPlaythrough } from './playthrough';
import { bare, chapterEnding, progressLine, SHUT_GATE_LINE, STORY_SHUT_GATE_LINE, storyProgress } from './progress';
import { partnerFromPick } from './party';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const ch1 = chapterById('ch01')!;
const memory = (): SaveStorage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); } };
};
const DEVICE = { device: true, server: false } as unknown as Parameters<typeof storeAdventureSave>[1]['policy'];

describe('the start screen: START, CONTINUE, EXPLORE', () => {
  it('a fresh save STARTs Chapter 1', () => {
    const p = storyProgress(emptyAdventureSave(0));
    expect(p).toMatchObject({ kind: 'start', chapterId: 'ch01', chapterNumber: 1, button: 'START', chaptersDone: 0, chaptersTotal: 1, placeholder: true });
    expect(p.chapterTitle).toBe(bare(ch1.title));
    expect(p.chapterTitle).not.toMatch(/PLACEHOLDER/);
    expect(progressLine(p)).toBe('CHAPTER 1');
  });

  it('a save mid-chapter CONTINUEs at its saved step, and says which', () => {
    const s = emptyAdventureSave(0);
    s.story.chapterId = 'ch01'; s.story.beatId = 'b08-camp1';
    const p = storyProgress(s);
    expect(p).toMatchObject({ kind: 'continue', chapterId: 'ch01', button: 'CONTINUE', beatNumber: 8, beatCount: ch1.beats.length, beatLine: 'Clear the camp' });
    expect(progressLine(p)).toBe(`CHAPTER 1 · 8 OF ${ch1.beats.length} · Clear the camp`);
  });

  it('every chapter played: EXPLORE THE HUB (the hub is free roam until the next chapter lands)', () => {
    const s = emptyAdventureSave(0);
    s.story.chapterId = 'ch01'; s.story.beatId = null; s.story.flags[chapterDoneFlag('ch01')] = true;
    const p = storyProgress(s);
    expect(p).toMatchObject({ kind: 'explore', chapterId: null, button: 'EXPLORE THE HUB', chaptersDone: 1, chaptersTotal: 1 });
    expect(progressLine(p)).toMatch(/ALL 1 CHAPTER PLAYED/);
  });

  it('with a second chapter in the index, a finished first chapter STARTs the second, and its end card names it (no rule edit)', () => {
    const ch2 = { ...clone(ch1), id: 'ch02', number: 2, title: '[PLACEHOLDER] Two' } as StoryChapter;
    const ix: StoryIndex = { ...clone(STORY_INDEX), chapters: [...STORY_INDEX.chapters, { id: 'ch02', file: 'two', worldId: 'w1', title: ch2.title }] };
    const files = { '01-first-gate': ch1, two: ch2 };
    const s = emptyAdventureSave(0);
    s.story.chapterId = 'ch01'; s.story.flags[chapterDoneFlag('ch01')] = true;
    expect(storyProgress(s, ix, files)).toMatchObject({ kind: 'start', chapterId: 'ch02', chapterNumber: 2, chapterTitle: 'Two', chaptersDone: 1, chaptersTotal: 2 });
    expect(progressLine(storyProgress(s, ix, files))).toBe('CHAPTER 2 · NEW');
    const e = chapterEnding('ch01', s, ix, files)!;
    expect(e.next).toEqual({ chapterId: 'ch02', chapterTitle: 'Two' });
    expect(e.continued).toBeNull();
  });
});

describe('Chapter 1 played to the end: its end card, and CONTINUE from every step it saved', () => {
  const run = runPlaythrough({ seed: 7 });
  const s = run.session;
  const end = s.progressSave();

  it('the chapter finishes and its end card says what it paid and that the story is to be continued', () => {
    expect(s.runner.done).toBe(true);
    const e = chapterEnding('ch01', end)!;
    expect(e).toBeTruthy();
    expect(e.chapterNumber).toBe(1);
    expect(e.xp).toBe(ch1.beats.reduce((n, b) => n + (b.xp ?? 0), 0));
    expect(e.xp).toBe(370);
    expect(e.level).toBe(end.player.level);
    expect(e.level).toBeGreaterThan(1);
    expect(e.spells).toEqual([`bolt.${end.partner!.element}`]);
    expect(end.player.spells.known).toContain(e.spells[0]);
    expect(e.unlocked).toEqual(['fusion', 'flight']);
    expect(e.next).toBeNull();                        // the index has no chapter after ch01 yet
    expect(e.continued?.title).toBe('To be continued');
    expect(e.continued?.text.length).toBeGreaterThan(10);
    expect(e.recap).toBeTruthy();
    expect(e.draft).toBe(true);                       // the owner has not written these words yet
    expect(`${e.recap} ${e.continued?.title} ${e.continued?.text} ${e.chapterTitle}`).not.toMatch(/\[(DRAFT|PLACEHOLDER)\]/);
    // a returning player is told the chapters are played
    expect(storyProgress(end).kind).toBe('explore');
  });

  it('after the chapter the hub is free roam; its gates with no chapter behind them answer shut (the HUD then says so)', () => {
    expect(s.storyMode).toBe('free');
    expect(s.runner.objective()).toBeNull();
    const shut = [...s.map.worlds.get('hub')!.gates].filter((g) => !g.to);
    expect(shut.length).toBeGreaterThan(0);
    for (const g of shut) {
      s.host.player.pos.x = g.pos.x; s.host.player.pos.y = g.pos.y; s.host.player.pos.z = g.pos.z;
      expect(s.runtime.gateAt(), g.id).toEqual({ id: g.id, open: false });
    }
    expect(SHUT_GATE_LINE).toBe('This gate is still asleep');
    expect(STORY_SHUT_GATE_LINE).toBe(1);
  });

  it('every step the chapter saved resumes from a reloaded device save and plays on to the end', () => {
    const seen = new Set<string>();
    const stops = run.saves.filter((x) => x.save.story.beatId && !seen.has(x.save.story.beatId) && seen.add(x.save.story.beatId));
    expect(stops.length).toBeGreaterThanOrEqual(ch1.beats.length - 1);   // a save at (nearly) every beat: the "saved at every step" line
    for (const stop of stops) {
      const dev = memory();
      expect(storeAdventureSave(stop.save, { now: 1, policy: DEVICE, storage: dev }).status).toBe('stored');
      const back = loadAdventureSave({ now: 2, storage: dev });
      expect(back.status, stop.save.story.beatId!).toBe('loaded');
      const p = storyProgress(back.save);
      expect(p.kind, stop.save.story.beatId!).toBe('continue');
      expect(ch1.beats[p.beatNumber! - 1].id).toBe(stop.save.story.beatId);
      let first: string | null = null;
      const again = runPlaythrough({ seed: 11, save: back.save as AdventureSave, beforeRun: (x) => { first = x.runner.beat?.id ?? null; } });
      expect(first, 'resumes at the saved beat').toBe(stop.save.story.beatId);
      expect(again.session.runner.done, `from ${stop.save.story.beatId}`).toBe(true);
      expect(again.session.save.story.flags[chapterDoneFlag('ch01')]).toBe(true);
      expect(again.session.save.story.flags[FLAG_FLIGHT_UNLOCKED]).toBe(true);
      expect(again.session.host.errors).toEqual([]);
    }
  });
});

describe('the end card\'s words are data, and stay [DRAFT] until the owner writes them', () => {
  const map = buildStoryMap();
  const worlds = new Map([...map.worlds.values()].map((w) => [w.id, {
    spawns: new Set(Object.keys(w.spawns)), encounters: new Set(w.encounters.map((e) => e.id)), gates: new Set(w.gates.map((g) => g.id)),
  }]));
  const ctx = (c: StoryChapter) => ({
    cast: new Set(Object.keys(STORY_INDEX.cast)), worlds, manuscript: c.manuscript ? MANUSCRIPTS[c.manuscript] ?? null : null,
    spells: new Set([...STARTER_SPELLS.map((x) => x.id), PARTNER_BOLT]),
  });

  it('the shipped chapter and index carry their ending, marked [DRAFT]', () => {
    for (const c of storyChapters()) {
      expect(c.ending?.recap.startsWith(DRAFT_PREFIX), c.id).toBe(true);
      expect(validateChapter(c, ctx(c))).toEqual([]);
    }
    expect(STORY_INDEX.ending?.title.startsWith(DRAFT_PREFIX)).toBe(true);
    expect(STORY_INDEX.ending?.text.startsWith(DRAFT_PREFIX)).toBe(true);
  });

  it('a placeholder chapter whose recap loses its [DRAFT] mark fails, as does an empty or overlong one (mutation checks)', () => {
    const bad = clone(ch1); bad.ending = { recap: 'Written by nobody.' };
    expect(validateChapter(bad, ctx(bad)).join('\n')).toMatch(/recap must start \[DRAFT\]/);
    const empty = clone(ch1); empty.ending = { recap: ' ' };
    expect(validateChapter(empty, ctx(empty)).join('\n')).toMatch(/no recap/);
    const long = clone(ch1); long.ending = { recap: `${DRAFT_PREFIX} ${'x'.repeat(300)}` };
    expect(validateChapter(long, ctx(long)).join('\n')).toMatch(/longer than 280/);
  });

  it('a placeholder index whose "to be continued" loses its [DRAFT] mark fails (mutation check)', () => {
    const chapters = new Map(storyChapters().map((c) => [c.id, c]));
    const ok = validateStoryIndex(STORY_INDEX, chapters, new Set(map.worlds.keys()));
    expect(ok).toEqual([]);
    const ix = clone(STORY_INDEX); ix.ending = { title: 'To be continued', text: `${DRAFT_PREFIX} x` };
    expect(validateStoryIndex(ix, chapters, new Set(map.worlds.keys())).join('\n')).toMatch(/ending title must start \[DRAFT\]/);
  });

  it('a partner-less save still gets a card (no element: the plain bolt)', () => {
    const s = emptyAdventureSave(0);
    s.story.flags.fusionUnlocked = true; s.story.flags.flightUnlocked = true;
    expect(chapterEnding('ch01', s)?.spells).toEqual(['bolt']);
    const withPartner = { ...s, partner: partnerFromPick({ kind: 'creature', speciesId: 'strideraptor' }) };
    expect(chapterEnding('ch01', withPartner)?.spells[0]).toMatch(/^bolt\.\w+$/);
    expect(chapterEnding('nope', s)).toBeNull();
  });
});
