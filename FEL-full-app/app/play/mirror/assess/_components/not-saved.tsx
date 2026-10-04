// "Your results aren't saved. Run the screen again" (A4-6): a missing session is said, with a restart. No crash, no blank
// page, and no fallback lane.
import Link from 'next/link';
import { NOT_SAVED_BODY, NOT_SAVED_TITLE, RUN_AGAIN, DISCLAIMER } from '@/lib/screen/copy';
import { ASSESS_PATH } from '@/lib/screen/routes';
import { StepCard, StopLine, primaryBtn } from './screen-ui';

export function NotSavedCard({ line }: { line?: string }) {
  return (
    <StepCard testId="not-saved">
      <h2 data-not-saved className="text-[21px] font-black leading-tight">{NOT_SAVED_TITLE}</h2>
      <p className="mt-2 text-[16px] leading-snug text-white/70">{line ?? NOT_SAVED_BODY}</p>
      <p className="mt-2 text-[16px] text-white/50">{DISCLAIMER}</p>
      <StopLine className="mt-1 text-[16px] text-white/60" />
      <Link href={ASSESS_PATH} prefetch={false} data-primary data-restart className={`${primaryBtn} mt-4`}>{RUN_AGAIN}</Link>
    </StepCard>
  );
}
