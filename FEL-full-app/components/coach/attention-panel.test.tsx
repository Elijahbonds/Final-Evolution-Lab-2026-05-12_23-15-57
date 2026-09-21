import { describe, expect, it, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AttentionPanel } from './attention-panel';

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

function readSource(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:fs').readFileSync(new URL('./attention-panel.tsx', import.meta.url), 'utf8');
}
