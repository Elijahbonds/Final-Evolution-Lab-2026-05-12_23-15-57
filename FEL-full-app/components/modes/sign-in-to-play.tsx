'use client';
// PUBLIC-POLISH (2026-11-02, live sweep D2): /modes is public, and every card on it opens a /play/<mode> route that sends a
// signed-out visitor to /login. The cards said nothing about that, so a visitor tapped a game and met a sign-in form
// they were not told about (while / says "No account. No download." for /try). These two say it first, to a signed-out
// visitor only; a signed-in player, and the first render while the session loads, see nothing.
//
// The cards keep their own /play/<mode> href: that route's sign-in redirect already carries ?next=, so a visitor who
// signs in lands in the game they picked.
import Link from 'next/link';
import { loginPath } from '@/lib/auth/safeNext';
import { useVisitorKind } from '@/components/auth/use-visitor';

export const SIGN_IN_TO_PLAY = 'Sign in to play — free';

/**
 * SCREEN-FIXES (2026-11-10): `serverGuest` is the server's answer (app/modes/page.tsx reads the session). While the
 * browser's session read is still loading, it decides, so a signed-out visitor gets the note and the chips in the first
 * draw instead of after it: they used to arrive late and push every card down (a layout shift). A signed-in player is
 * still never shown a hint, and the browser's own answer wins once it has one. Without `serverGuest`, as before.
 */
export function useGuestHint(serverGuest?: boolean): boolean {
  const kind = useVisitorKind();
  if (kind === 'guest') return true;
  if (kind === 'signed-in') return false;
  return serverGuest === true;
}

/** The line above the game list. */
export function ModesSignInNote({ serverGuest }: { serverGuest?: boolean } = {}) {
  if (!useGuestHint(serverGuest)) return null;
  return (
    <p data-testid="modes-signin-note" className="rounded-2xl border border-[#00E5FF]/25 bg-[#00E5FF]/[0.06] px-4 py-3 text-[14px] leading-relaxed text-fel-dim">
      <span className="font-bold text-white">{SIGN_IN_TO_PLAY}.</span>{' '}
      Every game below opens once you have an account.{' '}
      <Link href={loginPath('/modes')} className="font-semibold text-[#00E5FF] underline underline-offset-2">Sign in</Link>
      {' '}or{' '}
      <Link href="/try" className="font-semibold text-[#00E5FF] underline underline-offset-2">try a dunk with no account</Link>.
    </p>
  );
}

/** The hint inside each card (a span: the card itself is the link). */
export function SignInChip({ serverGuest }: { serverGuest?: boolean } = {}) {
  if (!useGuestHint(serverGuest)) return null;
  return (
    <span data-testid="mode-signin-chip" className="mt-2 block text-[14px] font-semibold text-[#00E5FF]">
      {SIGN_IN_TO_PLAY}
    </span>
  );
}
