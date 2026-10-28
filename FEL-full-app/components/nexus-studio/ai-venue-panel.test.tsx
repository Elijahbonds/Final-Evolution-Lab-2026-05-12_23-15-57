// The AI builder's venue panel as a server render (no DOM here): useAiStatus is stubbed to each state the kill switch can be in.
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ai = vi.hoisted(() => ({ state: 'loading' as 'loading' | 'available' | 'coming_soon' }));
vi.mock('@/lib/abacus/useAiStatus', () => ({ useAiStatus: () => [ai.state, () => {}] }));

import { AI_OFF_LINE, AiVenuePanel, aiCtxOf, aiRequestBody, reviewOf } from './ai-venue-panel';
import { AI_COMING_SOON_MESSAGE } from '@/lib/abacus/aiStatus';
import { sanitizeAiEdits } from '@/lib/nexus-studio/aiEdits';
import { starterProject, type StudioApi } from './use-studio';
import { GOOD_ANSWER, HOSTILE_ANSWER, SCRIPT_CAST_ANSWER, STAMP_ANSWER } from '@/tests/helpers/aiVenue';

const studio = (): StudioApi => {
  const doc = starterProject();
  return { doc, venue: doc.venues[0], run: () => {} } as unknown as StudioApi;
};
const html = () => renderToStaticMarkup(createElement(AiVenuePanel, { studio: studio() })).replace(/<!-- -->/g, '');

describe('the kill switch decides', () => {
  it('coming soon: the neutral words, and nothing can be sent', () => {
    ai.state = 'coming_soon';
    const h = html();
    expect(h).toContain(AI_OFF_LINE);   // STUDIO-EASY: the honest line replaced "coming soon" (coordinator decision 5)
    expect(h).not.toContain(AI_COMING_SOON_MESSAGE.studio);
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
    expect(h).not.toContain(AI_OFF_LINE);
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

describe('studio-4b', () => {
  it('"Explain this venue" sits beside the builder, behind the same switch', () => {
    ai.state = 'coming_soon';
    const explainButton = (h: string) => /<button([^>]*)>(?:(?!<\/button>)[\s\S])*Explain this venue/.exec(h.split('</button>').find((x) => x.includes('Explain this venue')) + '</button>')?.[1] ?? '';
    expect(explainButton(html())).toContain('disabled=""');
    ai.state = 'available';
    const h = html();
    expect(explainButton(h)).not.toContain('disabled=""');
    expect(h).toContain('Read only: CELL describes it, nothing changes.');
  });
  it('what the panel sends: the typed request (or the explain pass) and the venue without its cast — never a character', () => {
    const doc = starterProject();
    const v = { ...doc.venues[0], cast: { player: 'c_secret', crowd: ['c_fan'] } };
    const build = JSON.parse(aiRequestBody(v, { prompt: 'night court' }));
    expect(build).toEqual({ prompt: 'night court', venue: doc.venues[0] });
    const explain = JSON.parse(aiRequestBody(v, { explain: true }));
    expect(explain).toEqual({ mode: 'explain', venue: doc.venues[0] });
    expect(JSON.stringify([build, explain])).not.toContain('c_');
  });
  it('the review marks a cast that names nobody in the project', () => {
    const r = sanitizeAiEdits(SCRIPT_CAST_ANSWER);
    const rv = reviewOf(r.edits, r.dropped, { characters: [{ id: 'n', name: 'Nova' }, { id: 'a', name: 'Ace' }], scripts: [] });
    expect(rv.lines).toHaveLength(4);
    expect(rv.skipped.filter(Boolean)).toHaveLength(1);
    expect(rv.skipped[3]).toMatch(/Zed/);
  });
});

describe('studio-5: stamps', () => {
  it('review and apply read the project\'s own stamps (never sent); a stamp nobody has is struck out', () => {
    const doc = starterProject();
    const own = { id: 'stamp_own', name: 'Bench Gang', objects: [] as never[] };
    const ctx = aiCtxOf({ ...doc, stamps: [own] });
    expect(ctx.stamps).toEqual([own]);
    expect(aiCtxOf(doc).stamps).toEqual([]);
    const r = sanitizeAiEdits(STAMP_ANSWER);
    const rv = reviewOf(r.edits, r.dropped, aiCtxOf({ ...doc, stamps: [{ ...own, objects: doc.venues[0].objects.slice(0, 2) }] }));
    expect(rv.skipped.map(Boolean)).toEqual([false, false, false, false, true]);
    expect(rv.lines[3]).toMatch(/this project’s stamp/);
    expect(JSON.stringify(JSON.parse(aiRequestBody(doc.venues[0], { prompt: 'x' })))).not.toContain('stamp_own');
  });
});
