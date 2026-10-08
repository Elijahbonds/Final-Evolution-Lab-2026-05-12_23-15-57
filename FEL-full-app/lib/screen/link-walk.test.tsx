// SCREEN-FIX-2 item 7a (retest 1 S-11, Cyber F1; amend 3's bullet): UNDER-18 VISITORS NEVER LEAVE THE SCREEN.
//
//   · /screen/privacy no longer links "The app's full privacy policy" (/privacy is a draft with LOG IN links that set
//     next-auth cookies, and its header leads to / with the "Join the Lab" email form and an analytics POST). It carries
//     the owner's text instead, verbatim: one heading, five bullets and one closing line, the address as plain text.
//   · From the under-18 results, EVERY reachable link, followed recursively through each page it opens, stays under
//     /screen or /play/mirror/assess. (The cookies along the way are measured by the probe,
//     scripts/probes/_screen-fix-2-offsite.mts: no response sets one.)
// vitest does not collect app/**, so the pages are rendered from here (the lib/screen/routes.test.tsx pattern).
import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/play/mirror/assess',
}));

import { isQuickScreenPath } from '@/components/providers';
import { KidResults } from '@/app/play/mirror/assess/_components/kid-results';
import { ScreenFrame } from '@/app/play/mirror/assess/_components/screen-ui';
import { LANE_SLUGS } from './PROPOSED-program-lanes';
import { DISCLAIMER, PRIVACY_CONTACT, PRIVACY_POINTS, PRIVACY_TITLE, SCREEN_CONTACT_EMAIL } from './copy';

const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const text = (h: string) => decode(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const hrefs = (h: string) => [...h.matchAll(/\bhref="([^"]*)"/g)].map((m) => decode(m[1]));

/** The owner's privacy text (retest 1 S-11, with amend 3's second bullet), verbatim. */
const OWNER_TEXT = {
  heading: 'How this screen keeps things private',
  bullets: [
    'The screen runs on your phone. The camera is only used to see how you move. The video isn\'t uploaded, recorded or saved.',
    'If you\'re under 18, we don\'t save or send anything about you. The only thing kept is your age answer, in this tab, so the screen shows the right version. It\'s gone when you close the tab.',
    'If you\'re 18 or older, your results stay in this browser tab only, until you close it.',
    'No sign-in, no ads and no outside trackers.',
    'This is a free movement check, not a medical exam.',
  ],
  closing: 'Questions? Final Evolution LLC, FinalEvolution.us@gmail.com',
};

async function privacyPage(): Promise<string> {
  const { default: Page } = await import('@/app/screen/privacy/page');
  return renderToStaticMarkup(createElement(Page));
}

describe('S-11: /screen/privacy carries the owner\'s text, and no way out', () => {
  it('the text, exactly: one heading, five bullets in order, one closing line (the address plain text, not a link)', async () => {
    expect(PRIVACY_TITLE).toBe(OWNER_TEXT.heading);
    expect([...PRIVACY_POINTS]).toEqual(OWNER_TEXT.bullets);
    expect(PRIVACY_CONTACT).toBe(OWNER_TEXT.closing);
    expect(PRIVACY_POINTS[4]).toBe(DISCLAIMER);
    const h = await privacyPage();
    const block = /<div data-privacy-text="true">([\s\S]*?)<\/div>/.exec(h)![1];
    expect([...block.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => text(m[1]))).toEqual([OWNER_TEXT.heading]);
    expect([...block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => text(m[1]))).toEqual(OWNER_TEXT.bullets);
    expect([...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => text(m[1]))).toEqual([OWNER_TEXT.closing]);
    expect(text(block)).toBe([OWNER_TEXT.heading, ...OWNER_TEXT.bullets, OWNER_TEXT.closing].join(' '));
    expect(block).not.toMatch(/<a\b/);
    expect(h).not.toContain(`mailto:${SCREEN_CONTACT_EMAIL}`);
  });

  it('CHANGED: no link to the app\'s /privacy (was: "The app\'s full privacy policy", href="/privacy"); no form, no field', async () => {
    const h = await privacyPage();
    expect(h).not.toMatch(/href="\/privacy"/);
    expect(text(h)).not.toMatch(/full privacy policy/i);
    expect(h).not.toMatch(/<form|<input/);
    for (const href of hrefs(h)) expect(isQuickScreenPath(href), href).toBe(true);
  });

  it('"not a medical exam" once on the page (the fifth bullet; the stacked stop line is gone)', async () => {
    expect(text(await privacyPage()).match(/medical exam/gi)).toHaveLength(1);
  });
});

/** Render the page a screen address opens, as a signed-out visitor sees its first paint. */
async function render(path: string): Promise<string> {
  const u = new URL(path, 'http://screen.test');
  const p = u.pathname.replace(/\/$/, '') || '/';
  if (p === '/screen') {
    const { default: Entry } = await import('@/app/screen/page');
    return renderToStaticMarkup(createElement(Entry));
  }
  if (p === '/screen/privacy') return privacyPage();
  if (p === '/play/mirror/assess') return renderToStaticMarkup(createElement((await import('@/app/play/mirror/assess/page')).default));
  if (p === '/play/mirror/assess/results') return renderToStaticMarkup(createElement((await import('@/app/play/mirror/assess/results/page')).default));
  const lane = /^\/screen\/program\/([^/]+)$/.exec(p)?.[1];
  if (lane && (LANE_SLUGS as readonly string[]).includes(lane)) {
    const { ProgramLane } = await import('@/app/screen/program/[lane]/program-lane');
    return renderToStaticMarkup(createElement(ProgramLane, { lane: lane as (typeof LANE_SLUGS)[number] }));
  }
  throw new Error(`no screen page renders ${path}`);
}

describe('S-11: from the under-18 results, every reachable link stays in the screen', () => {
  it.each([[15.7, null], [17.7, 15.7], [null, null]] as const)('kid results (jump %s, last %s): walked recursively, nothing leaves', async (jumpIn, lastIn) => {
    // the kid results as the page shows them: the screen's frame (its back arrow is a step back, a button) around them
    const start = renderToStaticMarkup(createElement(ScreenFrame, { back: () => {}, children: createElement(KidResults, { jumpIn, lastIn, onRunAgain: () => {} }) as ReactElement }));
    const seen = new Set<string>();
    const queue = hrefs(start);
    const out: string[] = [];
    while (queue.length) {
      const href = queue.shift()!;
      if (seen.has(href)) continue;
      seen.add(href);
      if (!href.startsWith('/') || href.startsWith('//') || !isQuickScreenPath(new URL(href, 'http://screen.test').pathname)) { out.push(href); continue; }
      for (const next of hrefs(await render(href))) if (!seen.has(next)) queue.push(next);
    }
    expect(out).toEqual([]);
    // S-15: privacy back is a button (returns to results or history), not a link to /screen
    expect([...seen].sort()).toEqual(['/screen/privacy']);
  });
});
