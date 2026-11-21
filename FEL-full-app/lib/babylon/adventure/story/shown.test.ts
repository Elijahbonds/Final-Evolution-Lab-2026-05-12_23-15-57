// lane/story (coordinator 2026-11-21: "Players must never see the literal bracket tags"). Chapter 1 is played to its end headless, and
// every story string that reaches a player's screen is built the way AdventureMode builds it and RENDERED (the dialogue box and the
// end card as markup; the HUD's spell and partner line, the objective line and the start screen as the stage writes them). With
// story.showDraftTags at 0 (the default) nothing rendered says [PLACEHOLDER] or [DRAFT] and no tag chip shows; at 1 (the owner's
// review) the chips are back — the mutation check. The DATA keeps its marks (progress.test / data.test hold that).
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DialogueBox } from '@/components/adventure/DialogueBox';
import { StoryEndCard } from '@/components/adventure/StoryEndCard';
import { resetFeelOverride, setFeelOverride, setFeelSession, setFeelUser } from '@/lib/feel-panel/feel';
import { STARTER_SPELLS } from '../magic/spells';
import { emptyAdventureSave } from '../contracts';
import { chapterById, storyChapters } from './data';
import { runPlaythrough } from './playthrough';
import { chapterEnding, progressLine, storyProgress } from './progress';
import { shown, shownDialogue, shownEnding, shownOrNull, showDraftTags, STORY_SHOW_DRAFT_TAGS } from './shown';
import type { StoryDialogueSnapshot, StoryUiCommands } from './uiBridge';

const TAGS = /\[(PLACEHOLDER|DRAFT)\]/;
const NOOP: StoryUiCommands = { press() {}, release() {}, choose() {}, skip() {}, setMirror() {}, reloadBindings() {}, dismissEnding() {} };
const EXIT = { href: '/play', label: 'Back to Play' };

/** Every dialogue snapshot the chapter shows (fully revealed), as the runner hands them to the mode. */
function playChapter() {
  const raw: StoryDialogueSnapshot[] = [];
  const seen = new Set<string>();
  const run = runPlaythrough({
    seed: 7,
    afterTick: (s) => {
      const v = s.runner.view();
      if (!s.paused || !v.active) return;
      const k = `${v.speaker}|${v.text}|${(v.choices ?? []).map((c) => c.text).join('/')}`;
      if (seen.has(k)) return;
      seen.add(k);
      raw.push({ speaker: v.speaker, text: v.text, shown: v.text.length, placeholder: v.placeholder, choices: v.choices, choiceIndex: v.choiceIndex, hold01: 0 });
    },
  });
  return { run, raw };
}

/** What the stage writes for the HUD line and the objective, from the mode's values (app/play/adventure/stage.tsx Hud). */
const hudLine = (spell: string | null, partner: string | null) => `SLOT 1${spell ? ` · ${spell}` : ''}${partner ? ` · PARTNER ${partner.toUpperCase()}` : ''}`;

afterEach(() => { resetFeelOverride('story.showDraftTags'); setFeelUser(false); });

describe('story.showDraftTags 0 (the default): no bracket tag and no tag chip on any story screen', () => {
  const { run, raw } = playChapter();

  it('ships at 0, and the data really is tagged (so this is not passing on clean data)', () => {
    expect(STORY_SHOW_DRAFT_TAGS).toBe(0);
    expect(showDraftTags()).toBe(false);
    expect(run.session.runner.done).toBe(true);
    expect(raw.length).toBeGreaterThan(10);
    expect(raw.every((d) => d.placeholder)).toBe(true);                     // every line of the placeholder chapter is marked
    expect(STARTER_SPELLS.some((sp) => TAGS.test(sp.name))).toBe(true);    // "[PLACEHOLDER] Fire Bolt" and the like
    expect(TAGS.test(chapterById('ch01')!.title)).toBe(true);
    expect(TAGS.test(chapterById('ch01')!.ending!.recap)).toBe(true);
  });

  it('the dialogue box, every line and choice of the chapter: plain words, no PLACEHOLDER chip', () => {
    for (const d of raw) {
      const html = renderToStaticMarkup(createElement(DialogueBox, { d: shownDialogue(d), cmd: NOOP }));
      expect(html, d.text).not.toMatch(TAGS);
      expect(html).not.toMatch(/adventure-placeholder-tag/);
      expect(html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')).toContain(shown(d.text));
    }
  });

  it('the end card: plain words, no DRAFT chip', () => {
    const e = chapterEnding('ch01', run.session.progressSave())!;
    const html = renderToStaticMarkup(createElement(StoryEndCard, { ending: shownEnding(e), exit: EXIT, onExplore: () => {} }));
    expect(html).not.toMatch(TAGS);
    expect(html).not.toMatch(/story-end-draft/);
    expect(html).toContain('To be continued');
    expect(html).toContain('You crossed the first world');
  });

  it('the HUD: every spell\'s name and the partner line plain ("Fire Bolt", not "[PLACEHOLDER] Fire Bolt")', () => {
    for (const sp of STARTER_SPELLS) expect(hudLine(shown(sp.name), shownOrNull('follow')), sp.id).not.toMatch(TAGS);
    const fire = STARTER_SPELLS.find((sp) => sp.id === 'bolt.fire')!;
    expect(hudLine(shown(fire.name), null)).toBe('SLOT 1 · Fire Bolt');
  });

  it('the start screen at every point of the story: plain', () => {
    const fresh = emptyAdventureSave(0);
    const mid = emptyAdventureSave(0); mid.story.chapterId = 'ch01'; mid.story.beatId = 'b08-camp1';
    for (const s of [fresh, mid, run.session.progressSave()]) {
      const p = storyProgress(s);
      expect(shown(progressLine(p))).not.toMatch(TAGS);
      expect(shownOrNull(p.chapterTitle) ?? '').not.toMatch(TAGS);
    }
    // the start screen's fallback with its progress line switched off: the chapter's raw title
    expect(shown(storyChapters()[0].title)).toBe('Chapter 1 — The First Gate');
  });

  it('shown() drops every tag wherever it sits, and leaves untagged words alone', () => {
    expect(shown('[PLACEHOLDER] Fire Bolt')).toBe('Fire Bolt');
    expect(shown('SLOT 1 · [PLACEHOLDER] Fire Bolt')).toBe('SLOT 1 · Fire Bolt');
    expect(shown('[DRAFT] To be continued')).toBe('To be continued');
    expect(shown('Clear the camp')).toBe('Clear the camp');
    expect(shownOrNull(null)).toBeNull();
  });
});

describe('story.showDraftTags 1 (the owner\'s review): the tags and the chips come back (mutation check)', () => {
  it('the dialogue box keeps its PLACEHOLDER chip, the end card its DRAFT chip, the HUD the raw spell name', () => {
    setFeelUser(true); setFeelSession(null); setFeelOverride('story.showDraftTags', 1);
    expect(showDraftTags()).toBe(true);
    const d: StoryDialogueSnapshot = { speaker: 'Guide', text: 'You made it home.', shown: 17, placeholder: true, choices: null, choiceIndex: 0, hold01: 0 };
    expect(renderToStaticMarkup(createElement(DialogueBox, { d: shownDialogue(d), cmd: NOOP }))).toMatch(/adventure-placeholder-tag/);
    const s = emptyAdventureSave(0); s.story.flags.fusionUnlocked = true; s.story.flags.flightUnlocked = true;
    const e = chapterEnding('ch01', s)!;
    expect(renderToStaticMarkup(createElement(StoryEndCard, { ending: shownEnding(e), exit: EXIT, onExplore: () => {} }))).toMatch(/story-end-draft/);
    expect(shown('[PLACEHOLDER] Fire Bolt')).toBe('[PLACEHOLDER] Fire Bolt');
  });
});
