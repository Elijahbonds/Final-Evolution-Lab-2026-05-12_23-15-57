// STORE-READY B9 (cancel UI): a successful cancel swaps the button for the "Cancelled. Access ends <date>"
// line (the server returns accessUntil = the subscription period end); a failed cancel keeps the button and
// shows a retry note — a cancel that only half-happened must never look done. jsdom is not configured here, so
// the classification is asserted from source and the static first paint via renderToStaticMarkup (the
// book-form.test.tsx pattern).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CancelMembership } from './cancel-membership';

const src = readFileSync('components/coach-store/cancel-membership.tsx', 'utf8');

describe('B9 cancel-membership UI', () => {
  it('renders the "Cancelled. Access ends <date>" line after a successful cancel (source)', () => {
    expect(src).toContain('Cancelled. Access ends');
    expect(src).toContain('json.accessUntil');
    // The done state replaces the button entirely.
    expect(src).toMatch(/if \(done\) return <p/);
  });

  it('a failed cancel keeps the button and shows a retry note (source)', () => {
    expect(src).toContain('That did not go through. Nothing changed');
    expect(src).toContain('setFailed(true)');
  });

  it('the static first paint shows the cancel button and no end-date line', () => {
    const html = renderToStaticMarkup(createElement(CancelMembership as never, { accessId: 'pa_1' } as never));
    expect(html).toContain('Cancel membership');
    expect(html).not.toContain('Cancelled. Access ends');
  });
});
