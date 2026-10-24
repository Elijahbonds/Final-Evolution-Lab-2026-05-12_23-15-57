'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Trophy, Swords, Flame, Clock, Ruler } from 'lucide-react';
import { challengePlayHref, challengeSignupHref } from '@/lib/social/challenge-routes';
import { ChallengeResultCard, type ChallengeResultCardProps } from '@/components/challenges/challenge-result-card';
import { ReferralPing } from '@/components/challenges/referral-ping';

const MODE_LABEL: Record<string, string> = {
  dunkContest: 'Flight Night',
  threePoint: 'Downtown',
  hoops1v1: 'Ones',
  hoops3v3: 'Threes',
  tiebreak: 'Tiebreak',
  bigAir: 'Stomp',
};

function modeLabel(key: string): string {
  return MODE_LABEL[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

/**
 * CHALLENGES-2 (2026-10-24): what the v2 invite adds. All optional, so a caller that passes only the original props
 * gets the original landing.
 */
export interface ChallengeLandingV2 {
  /** "Downtown", "Jump (Mirror)". Defaults to the mode's label. */
  title?: string;
  /** The score as the challenge reads it ("46", "24.5 in"). Defaults to the number. */
  scoreText?: string;
  /** "A friend" or an adult's chosen first name. Defaults to display || tag (the original landing's heading). */
  theirName?: string;
  /** Epoch ms the challenge closes, or null (an older link with no clock). */
  expiresAt?: number | null;
  expired?: boolean;
  /** Where a guest plays first (lib/social/challenge-guest-play.ts), or null when this mode has no guest host. */
  guestHref?: string | null;
  /** A rep challenge: where it is measured. The answer is measured, not played. */
  rep?: { measureHref: string; measureLabel: string } | null;
  /** A rematch: the score it answers. */
  answers?: { scoreText: string } | null;
  /** The viewer's own result on this challenge (a receipt, or a guest run carried into the account). */
  result?: ChallengeResultCardProps | null;
  /** The browser carries the age-screen block flag: no sign-up offers. */
  blocked?: boolean;
  now?: number;
}

function timeLeft(expiresAt: number | null | undefined, now: number): string | null {
  if (expiresAt == null) return null;
  const ms = expiresAt - now;
  if (ms <= 0) return 'Ended';
  const h = Math.floor(ms / 3_600_000);
  return h >= 1 ? `${h} h left` : `${Math.max(1, Math.ceil(ms / 60_000))} min left`;
}

export function ChallengeLanding({
  code,
  modeKey,
  score,
  display,
  tag,
  isAuthed,
  ...v2
}: {
  code: string;
  modeKey: string;
  score: number;
  display: string | null;
  tag: string;
  isAuthed: boolean;
} & ChallengeLandingV2) {
  const opened = useRef(false);
  const [now] = useState(() => v2.now ?? Date.now());

  // Record the open exactly once. CHALLENGES-2: it counts the funnel and no longer starts a guest; the play page starts
  // one after the year question, as /try does.
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    fetch(`/api/challenge/${code}/open`, { method: 'POST' }).catch(() => {});
  }, [code]);

  // dunkContest (and the guest hosts) are guest-playable end-to-end; signed-in athletes go straight to the real play
  // route so GameShell can settle the same `?c=` attempt.
  const guestHref = v2.guestHref !== undefined ? v2.guestHref : modeKey === 'dunkContest' ? `/try?c=${encodeURIComponent(code)}` : null;
  const authedHref = challengePlayHref(modeKey, code);
  const ctaHref = v2.rep
    ? (isAuthed ? v2.rep.measureHref : challengeSignupHref(code))
    : isAuthed && authedHref ? authedHref : !isAuthed && guestHref ? guestHref : challengeSignupHref(code);
  const ctaLabel = v2.rep
    ? (isAuthed ? v2.rep.measureLabel.toUpperCase() : 'SIGN UP TO ANSWER')
    : !isAuthed && guestHref ? 'PLAY NOW — NO ACCOUNT' : isAuthed ? 'ACCEPT CHALLENGE' : 'SIGN UP TO ACCEPT';
  const ctaIsSignup = ctaHref.startsWith('/signup');
  const title = v2.title ?? modeLabel(modeKey);
  const scoreText = v2.scoreText ?? String(score);
  const heading = v2.theirName ?? (display || tag || 'An athlete');
  const left = timeLeft(v2.expiresAt, now);

  if (v2.expired) {
    return (
      <div className="space-y-5">
        {v2.result && <ChallengeResultCard {...v2.result} />}
        <div className="fel-panel rounded-2xl p-8 text-center" data-challenge-state="expired">
          <Clock className="mx-auto h-10 w-10 text-white/40" aria-hidden />
          <h1 className="mt-3 fel-heading text-2xl font-bold text-white">This challenge ended</h1>
          <p className="mt-2 text-sm text-white/60">It was open for 48 hours. The score to beat was {scoreText} in {title}.</p>
          <Link href={isAuthed ? '/play' : '/try'} className="mt-6 inline-block rounded-lg bg-[#00E5FF] px-6 py-3 font-bold text-black">
            {isAuthed ? 'Find a game' : 'Try a dunk instead'}
          </Link>
        </div>
        {isAuthed && <ReferralPing />}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {v2.result && <ChallengeResultCard {...v2.result} />}
      <div className="fel-panel rounded-2xl p-8 text-center" data-challenge-state="open">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FF3366]/15">
          {v2.rep ? <Ruler className="h-7 w-7 text-[#FF3366]" /> : <Swords className="h-7 w-7 text-[#FF3366]" />}
        </div>
        <div className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
          {v2.answers ? 'Rematch' : 'You’ve been challenged'}
        </div>
        <h1 className="mt-1 fel-heading text-3xl font-bold text-white">{heading}</h1>
        <p className="mt-1 text-sm text-white/60">{v2.answers ? `answered ${v2.answers.scoreText} with ${scoreText} in` : 'dares you in'}</p>
        <div className="mt-1 fel-heading text-xl font-bold text-[#00E5FF] fel-glow-cyan">{title}</div>

        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#FFD700]/30 bg-[#FFD700]/10 px-5 py-2">
          <Trophy className="h-4 w-4 text-[#FFD700]" />
          <span className="font-mono text-sm text-[#FFD700]">{v2.rep ? 'To beat' : 'Score to beat'}: {scoreText}</span>
        </div>
        {left && <div className="mt-3 font-mono text-[11px] text-white/45" data-time-left>{left}</div>}

        {!(v2.blocked && ctaIsSignup) && (
          <a
            href={ctaHref}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-[#00E5FF] px-6 py-4 fel-heading text-lg font-bold text-black transition-transform hover:scale-[1.02]"
            data-action="accept"
          >
            <Flame className="h-5 w-5" />
            {ctaLabel}
          </a>
        )}
        {v2.rep && isAuthed && <RepAnswer code={code} />}

        {!isAuthed && guestHref && !v2.rep && (
          <p className="mt-3 text-[11px] text-white/40">
            No account needed to play. Sign up after, only to save it or send a rematch.
          </p>
        )}
        {v2.rep && (
          <p className="mt-3 text-[11px] text-white/40">
            {isAuthed
              ? 'Your best jump measured since this was sent counts. Measure, then check here.'
              : 'Jump numbers are saved for adults who turn saving on. Everyone else keeps theirs on their phone.'}
          </p>
        )}
      </div>
      {isAuthed && <ReferralPing />}
    </div>
  );
}

/** A rep challenge's answer: the server reads the viewer's measured number (nothing typed), then shows the result. */
function RepAnswer({ code }: { code: string }) {
  const [state, setState] = useState<{ s: 'idle' | 'busy' } | { s: 'line'; line: string; href?: string }>({ s: 'idle' });
  const check = async () => {
    setState({ s: 'busy' });
    try {
      const r = await fetch(`/api/challenge/${encodeURIComponent(code)}/attempt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const j = await r.json().catch(() => null);
      if (r.ok && typeof j?.receipt === 'string') { window.location.assign(`/c/${encodeURIComponent(code)}?r=${encodeURIComponent(j.receipt)}`); return; }
      if (j?.error === 'measure_first') { setState({ s: 'line', line: 'Nothing measured since this was sent. Measure first, then check.', href: j.href }); return; }
      if (j?.error === 'scan_save_adults_only') { setState({ s: 'line', line: 'Numbers are saved for adults who turn saving on in Account settings.', href: '/account' }); return; }
      if (j?.error === 'expired') { setState({ s: 'line', line: 'This challenge has ended.' }); return; }
      setState({ s: 'line', line: 'Could not check right now. Try again.' });
    } catch {
      setState({ s: 'line', line: 'Could not check right now. Try again.' });
    }
  };
  return (
    <div className="mt-3">
      <button type="button" onClick={check} disabled={state.s === 'busy'} className="w-full rounded-xl border border-[#00E5FF]/40 px-5 py-2.5 font-mono text-xs text-[#00E5FF] disabled:opacity-60" data-action="rep-check">
        {state.s === 'busy' ? 'CHECKING…' : 'CHECK MY RESULT'}
      </button>
      {state.s === 'line' && (
        <p className="mt-2 text-xs text-white/60" role="status">
          {state.line} {state.href && <Link href={state.href} className="text-[#00E5FF] underline">Go</Link>}
        </p>
      )}
    </div>
  );
}
