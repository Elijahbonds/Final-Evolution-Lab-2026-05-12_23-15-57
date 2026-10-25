'use client';

// CHALLENGES-2: the result card. Both scores, who won, and a one-tap rematch that sends a new challenge back.
//
// Who sees which action (owner, 2026-10-22: play first; sign up only to save the result or to rematch):
//   signed-in  REMATCH, one tap: the server mints the challenge back from this result (never a re-sent score)
//   guest      an adult guest's result is already kept on their guest row: SAVE MY RESULT and REMATCH both go to
//              sign-up, which carries it into the account and comes back here, where REMATCH is one tap
//   local      a teen, or "play without saving": nothing left the phone, so there is nothing to save; sign-up is offered
//              for the rematch only, and the card says the result stays here
//   blocked    the age screen's block flag: no sign-up offer of any kind (the neutral turn-away rule)
// The other player is "A friend" unless they are an adult who chose to show their name (challenge-identity.ts). No face.

import Link from 'next/link';
import { Trophy, Swords, Equal } from 'lucide-react';
import type { ChallengeOutcome } from '@/lib/social/challenge-terms';
import { RematchButton } from './rematch-button';
import { ReportButton } from '@/components/report/report-button';

export type ResultViewer = 'signed-in' | 'guest' | 'local' | 'blocked';

export interface ChallengeResultCardProps {
  code: string;
  /** "Downtown", "Jump (Mirror)". */
  title: string;
  outcome: ChallengeOutcome;
  /** Already formatted in the challenge's unit. */
  myScore: string;
  theirScore: string;
  /** "A friend" or an adult's chosen first name. */
  theirName: string;
  viewer: ResultViewer;
  /** The signed result (signed-in viewers' one-tap rematch). */
  receipt?: string | null;
  /** The viewer is a verified adult (offers "Put my name on it" on the rematch). */
  canShowName?: boolean;
  /** Where "Play again" goes (the play page while the challenge is open), or null. */
  playAgainHref?: string | null;
  /** This result came from the guest run before sign-up (carried over). */
  carried?: boolean;
}

const HEAD: Record<ChallengeOutcome, { line: string; tone: string; Icon: typeof Trophy }> = {
  won: { line: 'You won', tone: 'text-[#00FF9D]', Icon: Trophy },
  lost: { line: 'They won this one', tone: 'text-[#FF3366]', Icon: Swords },
  tie: { line: 'A tie', tone: 'text-[#FFD700]', Icon: Equal },
};

export function ChallengeResultCard(p: ChallengeResultCardProps) {
  const head = HEAD[p.outcome];
  const signup = `/signup?c=${encodeURIComponent(p.code)}`;
  return (
    <section className="fel-panel rounded-2xl p-6 text-center" aria-labelledby="challenge-result-h" data-challenge-result={p.outcome}>
      <head.Icon className={`mx-auto h-10 w-10 ${head.tone}`} aria-hidden />
      <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">{p.title}</div>
      <h2 id="challenge-result-h" className={`mt-1 fel-heading text-3xl font-bold ${head.tone}`}>{head.line}</h2>

      <div className="mt-5 grid grid-cols-2 gap-3" role="group" aria-label="Both scores">
        <div className={`rounded-xl border px-3 py-3 ${p.outcome === 'won' ? 'border-[#00FF9D]/50 bg-[#00FF9D]/10' : 'border-white/10 bg-white/[0.03]'}`}>
          <div className="font-mono text-[10px] uppercase tracking-widest text-white/50">You</div>
          <div className="mt-1 fel-heading text-2xl font-bold text-white" data-score="mine">{p.myScore}</div>
        </div>
        <div className={`rounded-xl border px-3 py-3 ${p.outcome === 'lost' ? 'border-[#FF3366]/50 bg-[#FF3366]/10' : 'border-white/10 bg-white/[0.03]'}`}>
          <div className="truncate font-mono text-[10px] uppercase tracking-widest text-white/50">{p.theirName}</div>
          <div className="mt-1 fel-heading text-2xl font-bold text-white" data-score="theirs">{p.theirScore}</div>
        </div>
      </div>

      {p.carried && <p className="mt-3 text-xs text-[#00E5FF]">Saved to your account from your guest run.</p>}
      {p.viewer === 'local' && <p className="mt-3 text-xs text-white/50">This result stays on this phone. Nothing was sent.</p>}
      {p.viewer === 'signed-in' && <div className="mt-3"><ReportButton target="challenge" refId={p.code} /></div>}

      <div className="mt-5 space-y-2.5">
        {p.viewer === 'signed-in' && (
          <RematchButton code={p.code} receipt={p.receipt ?? null} canShowName={p.canShowName === true} />
        )}
        {p.viewer === 'guest' && (
          <>
            <Link href={signup} className="flex w-full items-center justify-center rounded-xl bg-[#00E5FF] px-5 py-3.5 fel-heading text-lg font-bold text-black" data-action="rematch-signup">
              REMATCH — SIGN UP FIRST
            </Link>
            <Link href={signup} className="flex w-full items-center justify-center rounded-xl border border-[#00E5FF]/40 px-5 py-2.5 font-mono text-xs text-[#00E5FF]" data-action="save-signup">
              SAVE MY RESULT
            </Link>
          </>
        )}
        {p.viewer === 'local' && (
          <Link href={signup} className="flex w-full items-center justify-center rounded-xl border border-[#00E5FF]/40 px-5 py-2.5 font-mono text-xs text-[#00E5FF]" data-action="rematch-signup">
            SIGN UP TO REMATCH
          </Link>
        )}
        {p.playAgainHref && (
          <Link href={p.playAgainHref} className="block font-mono text-xs text-white/50 underline-offset-4 hover:text-white hover:underline" data-action="play-again">
            Play it again
          </Link>
        )}
      </div>
    </section>
  );
}
