import Link from 'next/link';
import { PRIVACY_CONTACT, PRIVACY_POINTS, PRIVACY_TITLE, SCREEN_CONTACT_EMAIL, STOP_LINE } from '@/lib/screen/copy';
import { SCREEN_HOME } from '@/lib/screen/routes';
import { ScreenFrame, StepCard } from '@/app/play/mirror/assess/_components/screen-ui';
import { ClearResults } from './clear-results';

/**
 * /screen/privacy — how the Quick Screen keeps things private, in plain words (SCREEN-FIX, 2026-09-29). Linked from the
 * start card and the results. A quick-screen path (components/providers.tsx isQuickScreenPath), so it has no next-auth
 * SessionProvider: no request, no storage write and no form here. Its one button only REMOVES this tab's screen keys.
 * The app-wide policy (app/privacy) is linked, not changed.
 */
export default function ScreenPrivacyPage() {
  return (
    <ScreenFrame back={SCREEN_HOME} title="Privacy">
      <StepCard testId="privacy">
        <h2 className="text-[21px] font-black leading-tight">{PRIVACY_TITLE}</h2>
        <ul data-privacy-points className="mt-3 space-y-2.5 text-[15px] leading-snug text-white/85">
          {PRIVACY_POINTS.map((p) => <li key={p}>{p}</li>)}
        </ul>
        <div className="mt-4"><ClearResults /></div>
        <p data-contact className="mt-5 text-[14px] text-white/75">
          {PRIVACY_CONTACT}{' '}
          <a href={`mailto:${SCREEN_CONTACT_EMAIL}`} className="font-bold text-[#00E5FF] underline">{SCREEN_CONTACT_EMAIL}</a>
        </p>
        <p className="mt-3 text-[13px] text-white/60">
          <Link href="/privacy" prefetch={false} className="underline">The app&apos;s full privacy policy</Link>
        </p>
        <p data-stop-line className="mt-4 text-[12.5px] text-white/55">{STOP_LINE}</p>
      </StepCard>
    </ScreenFrame>
  );
}
