// Look pass C2 (lane/look-world): the story's READY screen as a title card, the picker's silhouette cards (story.titleCard).
// No DOM in this runner (node environment): a server render is the real first paint; the stage's wiring is read from source.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { lineRepeats, StoryTitleCard, STORY_TITLE_CARD } from './StoryTitleCard';
import { PartnerPicker } from './PartnerPicker';
import { CreatureSilhouette } from './CreatureSilhouette';
import { creatureChoices } from '@/lib/babylon/adventure/story/party';
import { FEEL_KNOB_BY_ID } from '@/lib/feel-panel/knobs';

const card = (o: Partial<Parameters<typeof StoryTitleCard>[0]> = {}) => renderToStaticMarkup(createElement(StoryTitleCard, {
  kicker: 'THE ADVENTURE', line: 'CHAPTER 1', title: 'The First Gate', ready: true, word: 'START', back: createElement('a', { href: '/play' }, 'BACK TO PLAY'),
  err: null, onStart: () => {}, controls: createElement('div', { 'data-testid': 'adventure-controls' }, 'TABLE'), ...o,
}));

describe('story.titleCard (look pass C2)', () => {
  it('the knob: on by default, the shipped constant; 0 keeps the screens as before', () => {
    const k = FEEL_KNOB_BY_ID.get('story.titleCard')!;
    expect(k.def).toBe(STORY_TITLE_CARD);
    expect(STORY_TITLE_CARD).toBe(1);
    expect(k.min).toBe(0);
  });

  it('the title card: the route, the progress line, the chapter title and START; the control table one tap away', () => {
    const html = card();
    for (const t of ['THE ADVENTURE', 'CHAPTER 1', 'The First Gate', '>START<', 'BACK TO PLAY', '>CONTROLS<']) expect(html).toContain(t);
    expect(html).toContain('data-testid="adventure-start"');
    expect(html).toContain('data-testid="adventure-start-title"');
    expect(html).not.toContain('adventure-controls"');   // folded until CONTROLS is tapped
    expect(html).not.toMatch(/\[(PLACEHOLDER|DRAFT)\]/);
  });

  it('the progress line is not said twice when the chapter title opens with it (kept for screen readers)', () => {
    expect(lineRepeats('CHAPTER 1', 'Chapter 1 — The First Gate')).toBe(true);
    expect(lineRepeats('CHAPTER 1 · 3 OF 16', 'Chapter 1 — The First Gate')).toBe(false);
    expect(lineRepeats('CHAPTER 1', null)).toBe(false);
    expect(card({ title: 'Chapter 1 — The First Gate' })).toMatch(/class="[^"]*sr-only[^"]*" data-testid="adventure-start-title">CHAPTER 1</);
    expect(card()).not.toContain('sr-only');
  });

  it('START waits for READY; no chapter title, no heading', () => {
    expect(card({ ready: false })).toMatch(/<button[^>]*disabled=""[^>]*data-testid="adventure-start"[^>]*>LOADING…</);
    expect(card({ title: null })).not.toContain('adventure-start-chapter');
    expect(card({ word: 'CONTINUE' })).toContain('>CONTINUE<');
  });

  it('the picker: silhouette cards when on, the dots exactly as before when off; the same words and ids', () => {
    const on = renderToStaticMarkup(createElement(PartnerPicker, { slots: [], onPick: () => {}, cards: true }));
    const off = renderToStaticMarkup(createElement(PartnerPicker, { slots: [], onPick: () => {} }));
    for (const c of creatureChoices()) {
      for (const h of [on, off]) { expect(h).toContain(`data-testid="partner-species-${c.speciesId}"`); expect(h).toContain(c.speciesId.toUpperCase()); }
      expect(on).toContain(`data-testid="partner-silhouette-${c.speciesId}"`);
      expect(off).not.toContain('partner-silhouette-');
    }
    expect(off).toContain('rounded-full');   // the dot
    expect((on.match(/<svg/g) ?? []).length).toBe(creatureChoices().length);
  });

  it('the silhouette is the in-game stand-in body (a capsule and a head), in the given colour', () => {
    const svg = renderToStaticMarkup(createElement(CreatureSilhouette, { color: '#ea580c' }));
    expect(svg).toContain('<rect');
    expect(svg).toContain('<circle');
    expect(svg).toContain('#ea580c');
  });

  it('the stage: the title card and the old screen behind the knob, read after mount', () => {
    const src = readFileSync('app/play/adventure/stage.tsx', 'utf8');
    expect(src).toContain('setTitleCard(storyTitleCardOn())');
    expect(readFileSync('lib/babylon/adventure/story/titleCard.ts', 'utf8')).toContain("feel('story.titleCard', STORY_TITLE_CARD)");
    expect(src).toMatch(/&& titleCard && \(\s*<StoryTitleCard/);
    expect(src).toMatch(/&& !titleCard && \(/);
    expect(src).toContain('cards={titleCard}');
  });
});
