// The Quick Screen's end for anyone under 18, or who would rather not say (SCREEN-FIX-2, 2026-09-29; Research 11:01 AM
// PT). ONLY their own number: the jump, and how it changed since their last screen on this page. No band, colour,
// grade, priority, cue, label, rank or comparison with anyone, and no card per check (lib/screen/kid.ts).
//
// In order: the "not a medical exam" line (once), the number (or "We couldn't read your jump this time"), the change
// line when this page already ran a screen, the save-your-number line, "Run it again" (in the page), and the privacy
// page. No link out of the screen. Nothing here writes or sends anything: the numbers come in as props, from the page's
// memory.
import Link from 'next/link';
import { jumpChange, jumpChangeLine } from '@/lib/screen/kid';
import { DISCLAIMER, KID_JUMP, KID_NO_JUMP, KID_SAVE_LINE, PRIVACY_LINK, RUN_IT_AGAIN, STOP_LINE } from '@/lib/screen/copy';
import { PRIVACY_PATH } from '@/lib/screen/routes';
import { primaryBtn } from './screen-ui';

export function KidResults({ jumpIn, lastIn, onRunAgain }: { jumpIn: number | null; lastIn: number | null; onRunAgain: () => void }) {
  const change = jumpChange(jumpIn, lastIn);
  return (
    <div data-kid-results className="space-y-3">
      <div className="space-y-1">
        <p data-disclaimer className="text-[16px] font-bold leading-snug text-white">{DISCLAIMER}</p>
        <p data-stop-line className="text-[16px] text-white/70">{STOP_LINE}</p>
      </div>
      {jumpIn !== null ? (
        <section data-kid-number className="rounded-3xl border border-white/15 bg-white/[0.04] p-5 text-center">
          <p className="text-[16px] text-white/80">{KID_JUMP}: <b data-kid-jump className="text-[32px] font-black text-white">{jumpIn} in</b></p>
          {change ? <p data-kid-change className="mt-1 text-[16px] font-bold text-white/85">{jumpChangeLine(change)}</p> : null}
          <p data-kid-save-line className="mt-3 text-[16px] leading-snug text-white/75">{KID_SAVE_LINE}</p>
        </section>
      ) : (
        <section data-kid-no-jump className="rounded-3xl border border-white/15 bg-white/[0.04] p-5 text-center">
          <p className="text-[17px] font-bold leading-snug text-white">{KID_NO_JUMP}</p>
        </section>
      )}
      <button type="button" data-primary data-run-again onClick={onRunAgain} className={primaryBtn}>{RUN_IT_AGAIN}</button>
      <p className="text-center text-[16px] text-white/60">
        <Link href={PRIVACY_PATH} prefetch={false} data-privacy-link className="underline">{PRIVACY_LINK}</Link>
      </p>
    </div>
  );
}
