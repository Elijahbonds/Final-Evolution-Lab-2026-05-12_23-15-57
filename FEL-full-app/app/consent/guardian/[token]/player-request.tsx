import Link from 'next/link';
import type { PlayerAcceptStep } from '@/lib/consent/guardianAccept';
import { guardianConsentAsk } from '@/lib/consent/guardianGate';
import { AcceptButton } from './accept-button';

// MIRROR-COACH P6 (2026-09-29): what a PLAYER-REQUESTED guardian link shows, one screen per
// lib/consent/guardianAccept.ts playerAcceptStep — the same function app/api/v1/camp/consent refuses or accepts with,
// so this page never offers a button the route would turn down. Its own file (not page.tsx) because a Next page file
// may export only the page; this is also what lets a node test render each step.
//
// COPY RULES: plain words, no fear. It says why an account is asked for (so the yes comes from an adult's account,
// not the athlete's phone) and never claims more than that — the route's own header says what this does not stop.
//
// SIGN-IN DOES NOT BRING THEM BACK. components/auth-form.tsx lands a new session on a game and ignores any ?next=
// (app/consent/guardian/page.tsx's own redirect passes one it never reads), so the copy says "then open this link
// again" rather than promising a return trip the sign-in form does not make. Teaching auth-form a safe ?next= is a
// shared-component change outside this task, flagged in the P6 report.

export function PlayerRequest({ step, token, menteeName }: { step: PlayerAcceptStep; token: string; menteeName: string }) {
  const intro = (
    <>
      <h1 className="fel-heading mt-3 text-3xl font-bold text-white">
        {menteeName} <span className="text-white/50">wants your OK</span>
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
        {guardianConsentAsk(menteeName)} FEL never contacts you about anything else.
      </p>
    </>
  );

  if (step === 'is_mentee') {
    return (
      <>
        <h1 className="fel-heading mt-3 text-2xl font-bold text-white">This one is for your parent or guardian</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/55">
          You&apos;re signed in as {menteeName}, the athlete this is for. A parent or guardian confirms it from their own
          FEL account — send them the link.
        </p>
      </>
    );
  }

  if (step === 'sign_in') {
    return (
      <>
        {intro}
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
          To confirm, sign in to your own FEL account — or make one, it&apos;s free — then open this link again. We ask
          for an account so the yes comes from an adult&apos;s account, not from the athlete&apos;s own phone.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/login" className="rounded-xl bg-[#00E5FF] px-6 py-3 font-bold text-[#050505]">Sign in</Link>
          <Link href="/signup" className="rounded-xl border border-white/20 px-6 py-3 font-bold text-white">Make an account</Link>
        </div>
      </>
    );
  }

  if (step === 'not_adult') {
    return (
      <>
        {intro}
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
          The person confirming has to be an adult, and the birth year on this account says otherwise — so this account
          can&apos;t confirm. A parent or guardian can confirm from their own account.
        </p>
      </>
    );
  }

  // 'confirm', or 'declare_birth_year' (signed in, adult-or-unknown, no birth year on file yet)
  return (
    <>
      {intro}
      <AcceptButton token={token} flow="player" askBirthYear={step === 'declare_birth_year'} />
    </>
  );
}
