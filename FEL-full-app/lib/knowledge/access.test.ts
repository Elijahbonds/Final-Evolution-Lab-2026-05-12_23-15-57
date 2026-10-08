import { describe, expect, it } from 'vitest';
import { CARDS, cardsForTopic } from './catalog';
import { guestNote, lockedCount, PLAYBOOK_GUEST_CARDS, visibleCards } from './access';
import { availableTopics, topicBlurb, topicById } from './topics';

// IMPROVE (2026-10-06), owner decision 5: guests see the first 5 Playbook cards, sign in for all.
describe('the Playbook guest gate', () => {
  const playbook = cardsForTopic('playbook');

  it('the Playbook has more than the preview, so the gate means something', () => {
    expect(playbook.length).toBeGreaterThan(PLAYBOOK_GUEST_CARDS);
    expect(topicById('playbook').guestPreview).toBe(PLAYBOOK_GUEST_CARDS);
  });

  it('a guest sees exactly the FIRST five Playbook cards, in pack order', () => {
    const seen = visibleCards(CARDS, false).filter((c) => c.topic === 'playbook');
    expect(seen.map((c) => c.id)).toEqual(playbook.slice(0, PLAYBOOK_GUEST_CARDS).map((c) => c.id));
  });

  it('a guest loses nothing from any other topic', () => {
    const others = (cs: typeof CARDS) => cs.filter((c) => c.topic !== 'playbook').map((c) => c.id);
    expect(others(visibleCards(CARDS, false))).toEqual(others(CARDS));
  });

  it('signed in, every card', () => {
    expect(visibleCards(CARDS, true).map((c) => c.id)).toEqual(CARDS.map((c) => c.id));
    expect(lockedCount(CARDS, true, 'playbook')).toBe(0);
  });

  it('counts what waits behind sign-in, and labels the preview cards', () => {
    expect(lockedCount(CARDS, false, 'playbook')).toBe(playbook.length - PLAYBOOK_GUEST_CARDS);
    expect(lockedCount(CARDS, false, 'science')).toBe(0);
    expect(guestNote(CARDS, false, playbook[0])).toBe(`Guest preview · card 1 of 5 · sign in for all ${playbook.length}`);
    expect(guestNote(CARDS, true, playbook[0])).toBeNull();
    expect(guestNote(CARDS, false, playbook[PLAYBOOK_GUEST_CARDS])).toBeNull();
    expect(guestNote(CARDS, false, cardsForTopic('space')[0])).toBeNull();
  });

  it('the picker offers the Playbook to guests too, and says it is a preview', () => {
    expect(availableTopics(false).map((t) => t.id)).toContain('playbook');
    expect(topicBlurb(topicById('playbook'), false)).toMatch(/First 5 cards free/);
    expect(topicBlurb(topicById('playbook'), true)).toBe(topicById('playbook').blurb);
  });
});
