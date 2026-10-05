import { PRIVACY_CONTACT, PRIVACY_POINTS, PRIVACY_TITLE } from '@/lib/screen/copy';
import { StepCard } from '@/app/play/mirror/assess/_components/screen-ui';
import { ClearResults } from './clear-results';
import { PrivacyFrame } from './privacy-frame';

/**
 * /screen/privacy — how the Quick Screen keeps things private, in plain words (SCREEN-FIX, 2026-09-29). Linked from the
 * start card and the results. A quick-screen path (components/providers.tsx isQuickScreenPath), so it has no next-auth
 * SessionProvider: no request, no storage write and no form here. Its one button only REMOVES this tab's screen keys.
 *
 * SCREEN-FIX-2 (retest 1 S-11, Cyber F1): NO WAY OUT OF THE SCREEN. The link to the app's /privacy is gone (a draft
 * whose LOG IN links set next-auth cookies, and whose header leads to / with an email form and an analytics POST), and
 * the owner's text is here instead, verbatim: one heading, five bullets, one closing line, the address as plain text
 * (lib/screen/copy.ts; the second bullet from the FE PM + Research amend). The fifth bullet is the page's one "not a
 * medical exam" line (S-13), so the stop line is not stacked under it here.
 */
export default function ScreenPrivacyPage() {
  return (
    <PrivacyFrame>
      <StepCard testId="privacy">
        <div data-privacy-text>
          <h2 className="text-[21px] font-black leading-tight">{PRIVACY_TITLE}</h2>
          <ul data-privacy-points className="mt-3 list-disc space-y-2.5 pl-5 text-[16px] leading-snug text-white/85">
            {PRIVACY_POINTS.map((p) => <li key={p}>{p}</li>)}
          </ul>
          <p data-contact className="mt-5 text-[16px] text-white/75">{PRIVACY_CONTACT}</p>
        </div>
        <div className="mt-4"><ClearResults /></div>
      </StepCard>
    </PrivacyFrame>
  );
}
