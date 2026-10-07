// MIRROR-FIRST P1 (2026-10-07): the coach's Form Check tab was a stub ("Upload your training video… Coming in the next
// update", "AI Form Analysis — Future release"). It now opens the Mirror's live movements — no video upload anywhere.
// app/ is outside the vitest include, so the component is rendered from here (no DOM: a server render of its markup).
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormFeedback } from '@/app/coach/_components/form-feedback';
import { MIRROR_LIVE_MOVEMENTS } from '@/lib/mirror/liveMovements';
import { screenText } from '@/lib/share/screen';

const html = renderToStaticMarkup(createElement(FormFeedback));
const hrefs = [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('Form Check', () => {
  it('links to every live Mirror movement, by its tab, and to the Quick Screen\'s front door — and nowhere else', () => {
    expect(hrefs).toEqual([...MIRROR_LIVE_MOVEMENTS.map((m) => `/play/mirror?pattern=${m.id}`), '/screen']);
    for (const m of MIRROR_LIVE_MOVEMENTS) expect(text).toContain(`The Mirror · ${m.tab} tab`);
  });

  it('offers no video upload, promises nothing "coming", and no AI analysis', () => {
    expect(html).not.toMatch(/<input\b/);
    expect(html).not.toMatch(/type="file"/);
    expect(text).not.toMatch(/upload your|coming in the next update|future release|side-by-side/i);
    expect(text).not.toMatch(/\bAI\b/);
    expect(text).toMatch(/never uploaded/);
  });

  it('says its numbers are estimates and names no condition, treatment or guarantee', () => {
    expect(text).toMatch(/estimate/);
    expect(screenText(text)).toEqual([]);
  });
});
