// The coach's "From their screen" panel shows each flag's matching WRITTEN corrective for an adult client (MIRROR-COACH
// P9, 2026-09-30; PLAN item 9 rule (e)) — the band drill and the release to run first, as text under the draft line —
// and none for a youth client. The draft is the real coachDraft over the /dev/coach-prescribe fixture's stored screens
// (made the way POST /api/mirror/screen makes them), rendered the way the panel renders it (DraftView, on the server).
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DraftView, type Draft } from './screen-prescriptions';
import { coachDraft, type CatalogueExercise } from '@/lib/coach/mirrorToProgram';
import { FIXTURE_CATALOGUE, fixtureScreens } from '@/app/dev/coach-prescribe/fixture';

const flags = fixtureScreens('flags');
const render = (youth: 'minor' | 'unknownAge' | null) => {
  const draft = coachDraft(flags.rows, FIXTURE_CATALOGUE as unknown as CatalogueExercise[], { youth }) as unknown as Draft;
  return renderToStaticMarkup(createElement(DraftView, {
    clientId: 'dev-client', draft, sessions: [{ id: 's1', label: 'Day 1' }], into: 's1', onInto: () => {},
    added: {}, onAddOne: () => {}, onAddBlock: () => {},
  }));
};
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ');

describe('the coach\'s draft names the matching written corrective', () => {
  it('an adult client: each flag that has one carries it, under its own draft line', () => {
    const html = render(null);
    const ids = [...html.matchAll(/data-written-corrective="(\w+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    const t = text(html);
    expect(t).toMatch(/Written corrective: Band drill: Side-pull split stance, 2 x 5 — "Keep your belt buckle pointed at the camera while the band pulls\."/);
    // every one sits inside a draft line (data-prescription), never as an addable row
    for (const id of ids) expect(html).toMatch(new RegExp(`data-prescription="${id}"[\\s\\S]*?data-written-corrective="${id}"`));
    expect(html).not.toMatch(/aria-label="Add (Band-up|Side-pull)/);
  });

  for (const youth of ['minor', 'unknownAge'] as const) {
    it(`${youth}: no written corrective anywhere, and the youth line says the drills and releases are off with the blocks`, () => {
      const html = render(youth);
      expect(html).not.toContain('data-written-corrective');
      expect(text(html)).toMatch(/the band drills and releases with them/);
    });
  }
});
