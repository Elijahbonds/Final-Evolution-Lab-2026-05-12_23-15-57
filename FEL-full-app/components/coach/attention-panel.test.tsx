import { describe, expect, it, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AttentionPanel, panelLists } from './attention-panel';

// The panel fetches on mount, so a server render is its FIRST paint — the state a coach sees before the roster
// has been read. That is worth pinning: it must not be blank, and it must never block the roster underneath it.
afterEach(() => { vi.unstubAllGlobals(); });

describe('AttentionPanel, first paint', () => {
  it('says it is working rather than rendering nothing', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const m = renderToStaticMarkup(createElement(AttentionPanel));
    expect(m).toContain('Reading your roster');
  });

  it('labels its region for a screen reader', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    // The loading state is a plain div; once loaded the section is labelled. Both must be announced sensibly,
    // so the heading id and the aria-labelledby have to agree — a typo here is invisible until someone relies on it.
    const src = readSource();
    expect(src).toContain('aria-labelledby="attention-heading"');
    expect(src).toContain('id="attention-heading"');
  });

  it('marks every decorative icon aria-hidden, so the row reads as one sentence', () => {
    const src = readSource();
    const icons = src.match(/<Icon|<Timer|<CheckCircle2/g) ?? [];
    const hidden = src.match(/aria-hidden="true"/g) ?? [];
    expect(icons.length).toBeGreaterThan(0);
    expect(hidden.length).toBeGreaterThanOrEqual(icons.length - 1);   // the spinner is inside the text line
  });
});

// MIRROR-COACH P2 (2026-09-25): the drifting are named, and nobody is listed twice.
describe('panelLists', () => {
  const drift = (clientId: string, state: string, note = '') => ({ clientId, name: clientId, state, daysSince: null, note });
  const flag = (clientId: string, kind: string) => ({ clientId, displayName: clientId, kind, urgency: 60, observed: 'x', action: 'y', positive: false });
  const board = {
    triage: { flags: [flag('nia', 'gone-quiet'), flag('quinn', 'gone-quiet')], totalFlagged: 2, clear: 3, summary: '' },
    drift: [drift('nia', 'awaitingProgram'), drift('quinn', 'stalled'), drift('gia', 'stalled', 'Has never completed a coached session. Still playing: 5 games in the last two weeks.'), drift('eli', 'slowing'), drift('cole', 'steady')],
    headline: null,
  };

  it('names stalled and slowing clients the triage list does not already show', () => {
    const { drifting } = panelLists(board);
    expect(drifting.map((d) => d.clientId)).toEqual(['gia', 'eli']);      // quinn is on the triage list; cole is steady
    expect(drifting[0].note).toMatch(/Still playing: 5 games/);
  });

  it('a client waiting on programming is not shown again as gone quiet', () => {
    const { waiting, flags } = panelLists(board);
    expect(waiting.map((d) => d.clientId)).toEqual(['nia']);
    expect(flags.map((f) => f.clientId)).toEqual(['quinn']);
  });

  it('caps the drifting list at six, like triage', () => {
    const many = { ...board, triage: { ...board.triage, flags: [] }, drift: Array.from({ length: 9 }, (_, i) => drift(`s${i}`, 'stalled')) };
    expect(panelLists(many).drifting).toHaveLength(6);
  });
});

// MIRROR-COACH P5 (2026-09-29): pain flags are read from `board.painFlags` — absent on an older cached response,
// which must read exactly like an empty list (never a crash), and never render `items` unless the API itself
// marked the row `detailed` (a live coach_view consent grant, decided server-side in lib/health/pain.ts).
describe('panel source: pain flags', () => {
  it('treats a missing painFlags field as an empty list, not a crash', () => {
    const src = readSource();
    expect(src).toMatch(/board\.painFlags\s*\?\?\s*\[\]/);
  });

  it('only renders the detailed item list when the API marked the row detailed — never derives detail client-side', () => {
    const src = readSource();
    expect(src).toMatch(/p\.view\.detailed\s*&&\s*p\.view\.items/);
  });

  it('the empty-state line accounts for pain flags too, so a coach with only a pain flag never sees "nothing to do"', () => {
    const src = readSource();
    expect(src).toMatch(/painFlags\.length === 0/);
  });
});

function readSource(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:fs').readFileSync(new URL('./attention-panel.tsx', import.meta.url), 'utf8');
}
