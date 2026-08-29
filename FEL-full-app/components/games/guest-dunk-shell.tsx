'use client';

import dynamicImport from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Trophy, Flame, ArrowRight } from 'lucide-react';
import { prqGrade } from '@/lib/prq';
import { is3D } from '@/components/three/flags';
import { track, flush } from '@/lib/analytics';
import type { GameProps, GameResult } from '@/components/games/game-shell';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

const DunkGame2D = dynamicImport(() => import('@/components/games/dunk-game'), { ssr: false, loading: spinner });
const DunkGame3D = dynamicImport(() => import('@/components/games/dunk-game-3d'), { ssr: false, loading: spinner });

/**
 * M13 Step 1 — "60 seconds to a dunk". A fully GUEST-playable dunk contest: no
 * auth, no /api/profile, no /api/sessions. We issue an anonymous guest token,
 * record the funnel events (play_now_click → first_dunk_judged), optionally
 * resolve a challenge attempt, then invite the guest to claim an athlete.
 * Server owns all grants/scores; nothing here mutates a real account.
 */
export function GuestDunkShell({ challengeCode }: { challengeCode?: string | null }) {
  const Game = (is3D('dunkContest') ? DunkGame3D : DunkGame2D) as React.ComponentType<GameProps>;
  const grade = prqGrade(50);
  const [gameKey, setGameKey] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [beat, setBeat] = useState<boolean | null>(null);
  const [rematch, setRematch] = useState<string | null>(null);
  const started = useRef(false);

  // Ensure an anonymous guest token exists, then record the play_now click.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        await fetch('/api/guest', { method: 'POST' });
      } catch {}
      track('play_now_click', { target: 'dunk' });
      void flush();
    })();
  }, []);

  const claimHref = challengeCode ? `/signup?c=${challengeCode}` : '/signup';

  const handleEnd = useCallback(
    async (res: GameResult) => {
      setResult(res);
      track('first_dunk_judged', { card: 1 });
      void flush();
      if (challengeCode) {
        try {
          const j = await fetch(`/api/challenge/${challengeCode}/attempt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attemptScore: res?.score ?? 0, attemptTag: 'GUEST' }),
          }).then((r) => (r.ok ? r.json() : null));
          if (j) {
            setBeat(Boolean(j.beat));
            if (j.rematch?.path) setRematch(j.rematch.path);
          }
        } catch {}
      }
    },
    [challengeCode],
  );

  const replay = () => {
    setResult(null);
    setBeat(null);
    setRematch(null);
    setGameKey((k) => k + 1);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#050505]">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050505]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-2.5">
          <Link href="/" className="fel-heading text-lg font-bold text-white">
            <span className="text-[#00E5FF] fel-glow-cyan">FINAL EVOLUTION</span> LAB
          </Link>
          <span className="ml-auto rounded-md border border-[#00FF9D]/40 px-2.5 py-1 font-mono text-[10px] text-[#00FF9D]">
            GUEST · NO ACCOUNT NEEDED
          </span>
        </div>
      </header>

      <div className="relative mx-auto w-full max-w-[1200px] flex-1 px-2 py-3 sm:px-4">
        <Game key={gameKey} grade={grade} prq={50} onEnd={handleEnd} />

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm"
            >
              <motion.div
                initial={{ y: 60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', damping: 22 }}
                className="fel-panel w-full max-w-md rounded-2xl p-7 text-center"
              >
                <Trophy className={`mx-auto h-12 w-12 ${result.won ? 'text-[#FFD700]' : 'text-white/30'}`} />
                <h2 className="fel-heading mt-3 text-4xl font-bold text-white">
                  {result.headline ?? 'NICE DUNK'}
                </h2>
                <p className="mt-1 font-mono text-sm text-white/50">Score {result.score}</p>

                {challengeCode && beat !== null && (
                  <div
                    className={`mt-4 rounded-lg border px-4 py-2 font-mono text-sm ${
                      beat
                        ? 'border-[#00FF9D]/40 bg-[#00FF9D]/10 text-[#00FF9D]'
                        : 'border-[#FF3366]/40 bg-[#FF3366]/10 text-[#FF3366]'
                    }`}
                  >
                    {beat ? 'YOU BEAT THE CHALLENGE!' : 'So close — try again to beat it'}
                  </div>
                )}

                <div className="mt-6 rounded-xl border border-[#00E5FF]/30 bg-[#00E5FF]/5 p-4">
                  <p className="fel-heading text-lg font-bold text-white">Claim your athlete</p>
                  <p className="mt-1 text-xs text-white/60">
                    Save this run, earn XP, climb the season track and challenge friends.
                  </p>
                  <Link
                    href={claimHref}
                    onClick={() => { track('guest_claim', { converted: true }); void flush(); }}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#00E5FF] px-6 py-3.5 fel-heading text-lg font-bold text-black transition-transform hover:scale-[1.02]"
                  >
                    <Flame className="h-5 w-5" /> CLAIM YOUR ATHLETE
                  </Link>
                </div>

                <div className="mt-4 flex items-center justify-center gap-3">
                  <button
                    onClick={replay}
                    className="rounded-lg border border-white/15 px-4 py-2 font-mono text-xs text-white/70 transition-colors hover:border-white/40 hover:text-white"
                  >
                    DUNK AGAIN
                  </button>
                  {rematch && (
                    <Link
                      href={rematch}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#A855F7]/40 px-4 py-2 font-mono text-xs text-[#A855F7] transition-colors hover:bg-[#A855F7]/10"
                    >
                      REMATCH LINK <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
