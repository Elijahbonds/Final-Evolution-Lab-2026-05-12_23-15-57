'use client';

import { useEffect, useRef } from 'react';
import { Trophy, Swords, Flame } from 'lucide-react';

const MODE_LABEL: Record<string, string> = {
  dunkContest: 'Dunk Contest',
  threePoint: '3-Point Contest',
  hoops1v1: '1v1 Hoops',
  hoops3v3: '3v3 Hoops',
  tiebreak: 'Tiebreak',
  bigAir: 'Big Air',
};

function modeLabel(key: string): string {
  return MODE_LABEL[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

export function ChallengeLanding({
  code,
  modeKey,
  score,
  display,
  tag,
  isAuthed,
}: {
  code: string;
  modeKey: string;
  score: number;
  display: string | null;
  tag: string;
  isAuthed: boolean;
}) {
  const opened = useRef(false);

  // Record the open exactly once (ensures a guest token server-side first).
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    fetch(`/api/challenge/${code}/open`, { method: 'POST' }).catch(() => {});
  }, [code]);

  // dunkContest is guest-playable end-to-end; other modes route to signup.
  const guestPlayable = modeKey === 'dunkContest';
  const ctaHref = guestPlayable ? `/try?c=${code}` : `/signup?c=${code}`;
  const ctaLabel = guestPlayable ? 'ACCEPT — PLAY NOW' : isAuthed ? 'ACCEPT CHALLENGE' : 'SIGN UP TO ACCEPT';

  return (
    <div className="fel-panel rounded-2xl p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FF3366]/15">
        <Swords className="h-7 w-7 text-[#FF3366]" />
      </div>
      <div className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
        You&apos;ve been challenged
      </div>
      <h1 className="mt-1 fel-heading text-3xl font-bold text-white">
        {display || tag || 'An athlete'}
      </h1>
      <p className="mt-1 text-sm text-white/60">dares you in</p>
      <div className="mt-1 fel-heading text-xl font-bold text-[#00E5FF] fel-glow-cyan">
        {modeLabel(modeKey)}
      </div>

      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#FFD700]/30 bg-[#FFD700]/10 px-5 py-2">
        <Trophy className="h-4 w-4 text-[#FFD700]" />
        <span className="font-mono text-sm text-[#FFD700]">Score to beat: {score}</span>
      </div>

      <a
        href={ctaHref}
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-[#00E5FF] px-6 py-4 fel-heading text-lg font-bold text-black transition-transform hover:scale-[1.02]"
      >
        <Flame className="h-5 w-5" />
        {ctaLabel}
      </a>

      {guestPlayable && (
        <p className="mt-3 text-[11px] text-white/40">
          No account needed to play — beat the score, then claim your athlete.
        </p>
      )}
    </div>
  );
}
