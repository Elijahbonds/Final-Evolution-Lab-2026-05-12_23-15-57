// The AI builder's venue panel as a server render (no DOM here): useAiStatus is stubbed to each state the kill switch can be in.
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ai = vi.hoisted(() => ({ state: 'loading' as 'loading' | 'available' | 'coming_soon' }));
vi.mock('@/lib/abacus/useAiStatus', () => ({ useAiStatus: () => [ai.state, () => {}] }));

import { AiVenuePanel, reviewOf } from './ai-venue-panel';
import { AI_COMING_SOON_MESSAGE } from '@/lib/abacus/aiStatus';
import { sanitizeAiEdits } from '@/lib/nexus-studio/aiEdits';
import { starterProject, type StudioApi } from './use-studio';
import { GOOD_ANSWER, HOSTILE_ANSWER } from '@/tests/helpers/aiVenue';

const studio = (): StudioApi => {
  const doc = starterProject();
  return { doc, venue: doc.venues[0], run: () => {} } as unknown as StudioApi;
};
const html = () => renderToStaticMarkup(createElement(AiVenuePanel, { studio: studio() })).replace(/<!-- -->/g, '');

describe('the kill switch decides', () => {
  it('coming soon: the neutral words, and nothing can be sent', () => {
    ai.state = 'coming_soon';
    const h = html();
    expect(h).toContain(AI_COMING_SOON_MESSAGE.studio);
    expect(h).toMatch(/<textarea[^>]*disabled=""/);
    expect(h).toMatch(/<button[^>]*disabled=""[^>]*>.*Build into/);
  });
  it('loading: nothing can be sent until the server answers', () => {
    ai.state = 'loading';
    expect(html()).toMatch(/<textarea[^>]*disabled=""/);
  });
  it('available: the prompt is open and the venue it builds into is named', () => {
    ai.state = 'available';
    const h = html();
    expect(h).not.toContain(AI_COMING_SOON_MESSAGE.studio);
    expect(h).not.toMatch(/<textarea[^>]*disabled=""/);
    expect(h).toContain('Build into “Center Court remix”');
  });
});

describe('the review list', () => {
  it('one line per edit; a note when parts were left out or nothing applies', () => {
    const good = sanitizeAiEdits(GOOD_ANSWER);
    expect(reviewOf(good.edits, good.dropped)).toMatchObject({ note: null });
    expect(reviewOf(good.edits, 0).lines).toHaveLength(good.edits.length);
    const bad = sanitizeAiEdits(HOSTILE_ANSWER);
    expect(reviewOf(bad.edits, bad.dropped).note).toMatch(/9 part\(s\)/);
    expect(reviewOf([], 0).note).toMatch(/nothing the Studio can apply/);
  });
});
