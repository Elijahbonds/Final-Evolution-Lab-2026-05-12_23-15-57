// COACH-WORDS (owner, 2026-11-12): on /coach/highlight/[id] and /coach/session every sentence over the first screen's word
// budget is consent or privacy wording, so nothing was cut. Proposed instead (the owner approves or rejects it in
// docs/COACH-WORDING-REVIEW.md): the owner's 2026-11-11 rule, "approved notices don't count toward the 40-word budget",
// applied to them. Not a word changes; each line moves into a constant and is marked as an approved notice
// (lib/every-screen/notices.ts), the way the guardian-consent page's two notices were in phase 6.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }));

import { HighlightConsent } from '@/components/coach-business/highlight-consent';
import { SessionHome } from '@/app/coach/session/_components/session-home';
import { HIGHLIGHT_CONSENT_LINE } from '@/lib/coach-business/highlight-copy';
import { COURT_NAMES_LINE, COURT_NUMBERS_KEPT_LINE, COURT_NUMBERS_NOT_SENT_LINE } from '@/lib/session-setup/copy';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

describe('/coach/highlight/[id]: consent wording, unchanged and marked as an approved notice', () => {
  it('word for word as before', () => {
    expect(HIGHLIGHT_CONSENT_LINE).toBe('Your coach would like to show this on their public page. Only these words show, never your name. You can withdraw it any time.');
    const html = renderToStaticMarkup(createElement(HighlightConsent, { id: 'x' }));
    expect(html).toContain(`<p data-notice="consent" class="mt-2 text-base text-white/70">${HIGHLIGHT_CONSENT_LINE}</p>`);
    expect(text(html)).toContain('Share a result?');
  });
});

describe('/coach/session: privacy wording, unchanged and marked as approved notices', () => {
  const OLD_OPTED_IN = 'Nicknames only for anyone under 18 or who would rather not say. Those names stay in this session and leave when it ends. This account can keep adult jump numbers.';
  const OLD_NOT = 'Nicknames only for anyone under 18 or who would rather not say. Those names stay in this session and leave when it ends. Jump numbers are not sent anywhere.';
  it('reads exactly as the old paragraph did, for both kinds of account', () => {
    expect(`${COURT_NAMES_LINE} ${COURT_NUMBERS_KEPT_LINE}`).toBe(OLD_OPTED_IN);
    expect(`${COURT_NAMES_LINE} ${COURT_NUMBERS_NOT_SENT_LINE}`).toBe(OLD_NOT);
    const yes = renderToStaticMarkup(createElement(SessionHome, { serverVerified: true, optedIn: true }));
    const no = renderToStaticMarkup(createElement(SessionHome, { serverVerified: false, optedIn: false }));
    expect(text(yes)).toContain(OLD_OPTED_IN);
    expect(text(no)).toContain(OLD_NOT);
    expect(text(no)).not.toContain(COURT_NUMBERS_KEPT_LINE);
    expect(yes.match(/data-notice="privacy"/g)).toHaveLength(2);
    expect(text(yes)).toContain('Court session');
  });
});
