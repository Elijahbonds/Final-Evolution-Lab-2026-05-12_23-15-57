'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { Flame, Zap, Trophy, ArrowRight } from 'lucide-react';
import { track, flush } from '@/lib/analytics';
import { EmailCapture } from '@/components/marketing/email-capture';

/**
 * M13 Step 1 — the logged-out landing. One promise: "60 seconds to a dunk."
 * The primary CTA drops straight into a GUEST-playable dunk (no signup wall).
 */
export function GuestLandingHero() {
  const seen = useRef(false);
  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    track('guest_start', { source: 'landing' });
    void flush();
  }, []);

  return (
    <div className="relative flex min-h-[calc(100vh-64px)] flex-col items-center justify-center overflow-hidden px-4 py-16 text-center">
      {/* Golden-hour glow backdrop (Season 1 — Venice sunset). */}
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[#FFD700]/10 blur-[120px]" />
        <div className="absolute left-1/3 top-1/2 h-[320px] w-[320px] rounded-full bg-[#FF3366]/10 blur-[120px]" />
        <div className="absolute right-1/4 top-1/4 h-[300px] w-[300px] rounded-full bg-[#00E5FF]/10 blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-2xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#FFD700]/30 bg-[#FFD700]/10 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[#FFD700]">
          <Zap className="h-3.5 w-3.5" /> Season 1 · Golden Hour
        </span>

        <h1 className="mt-6 fel-heading text-5xl font-black leading-[0.95] text-white sm:text-7xl">
          60 SECONDS<br />
          TO A <span className="text-[#00E5FF] fel-glow-cyan">DUNK</span>
        </h1>
        <p className="mx-auto mt-5 max-w-md text-base text-white/60">
          No account. No download. Drop into Venice Beach and throw down right now
          — then claim your athlete and climb the season.
        </p>

        <Link
          href="/try"
          onClick={() => { track('play_now_click', { target: 'landing_hero' }); void flush(); }}
          className="mt-9 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#00E5FF] px-10 py-5 fel-heading text-2xl font-black text-black transition-transform hover:scale-[1.03]"
        >
          <Flame className="h-6 w-6" /> PLAY NOW
        </Link>

        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-white/50">
          <Trophy className="h-4 w-4 text-[#FFD700]" />
          <span>Already have an athlete?</span>
          <Link href="/login" className="inline-flex items-center gap-1 font-semibold text-[#00E5FF] hover:underline">
            Log in <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mx-auto mt-10 max-w-md">
          <EmailCapture source="landing_hero" />
        </div>
      </div>
    </div>
  );
}
