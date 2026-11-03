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

/** The line above the game list. */
export function ModesSignInNote() {
  if (useVisitorKind() !== 'guest') return null;
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
export function SignInChip() {
  if (useVisitorKind() !== 'guest') return null;
  return (
    <span data-testid="mode-signin-chip" className="mt-2 block text-[14px] font-semibold text-[#00E5FF]">
      {SIGN_IN_TO_PLAY}
    </span>
  );
}
