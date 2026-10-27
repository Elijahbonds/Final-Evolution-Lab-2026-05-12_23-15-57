// COACH-DELIVERY (round 8 item b, 2026-10-27): a coach with no roster sees the first-client checklist (invite → template →
// session), the invite step ticked once an invite is open; the steps carry the first-run lane's ids.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FirstClientChecklist, firstClientDone } from '@/components/coach/first-client';

describe('the first-client checklist', () => {
  it('three steps in order, with the first-run lane\'s ids; the invite links to the invite panel', () => {
    const html = renderToStaticMarkup(createElement(FirstClientChecklist, { state: { invited: false } }));
    expect([...html.matchAll(/data-first-client-step="(\w+)"/g)].map((m) => m[1])).toEqual(['invite', 'template', 'session']);
    expect(html).toContain('href="#coach-invite"');
    expect(html).not.toContain('data-done="true"');
  });
  it('the invite step is done once an invite is open', () => {
    expect([...firstClientDone({ invited: true })]).toEqual(['invite']);
    expect(renderToStaticMarkup(createElement(FirstClientChecklist, { state: { invited: true } }))).toMatch(/data-first-client-step="invite" data-done="true"/);
  });
});
