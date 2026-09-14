'use client';

import dynamicImport from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Trophy, Flame, ArrowRight, ExternalLink, X } from 'lucide-react';
import { prqGrade } from '@/lib/prq';
import { is3D, isBabylon } from '@/components/three/flags';
import { track, flush } from '@/lib/analytics';
import type { GameProps, GameResult } from '@/components/games/game-shell';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

const DunkGame2D = dynamicImport(() => import('@/components/games/dunk-game'), { ssr: false, loading: spinner });
const DunkGame3D = dynamicImport(() => import('@/components/games/dunk-game-3d'), { ssr: false, loading: spinner });
// Babylon dunk stage — the SAME host /play/dunk mounts.
const DunkBabylon = dynamicImport(() => import('@/components/games/dunk-babylon'), { ssr: false, loading: spinner });

/**
 * M13 Step 1 — "60 seconds to a dunk". A fully GUEST-playable dunk contest: no
 * auth, no /api/profile, no /api/sessions. We issue an anonymous guest token,
 * record the funnel events (play_now_click → first_dunk_judged), optionally
 * resolve a challenge attempt, then invite the guest to claim an athlete.
 * Server owns all grants/scores; nothing here mutates a real account.
 */
export function GuestDunkShell({ challengeCode }: { challengeCode?: string | null }) {
  // Engine selection must match /play/dunk: isBabylon FIRST, then the 3D
  // fallback. This shell checked only is3D, so the guest path — the PLAY NOW
  // button, and therefore the first thing every new player ever sees — mounted
  // the react-three-fiber dunk with the Meshy GLB avatar. That avatar is the
  // known-broken one (it is the reason PROCEDURAL_CHARACTERS defaults true), and
  // it T-POSES on screen. Gate 0 passing did not save this path, because this
  // path never used the Gate-0-compliant procedural rig at all.
  const babylon = isBabylon('dunkContest');
  const Fallback = (is3D('dunkContest') ? DunkGame3D : DunkGame2D) as React.ComponentType<GameProps>;
  const grade = prqGrade(50);
  const [gameKey, setGameKey] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [beat, setBeat] = useState<boolean | null>(null);
  const [rematch, setRematch] = useState<string | null>(null);
  // TRY-ONBOARD G1/G3: how many NIGHT CARDS this guest has finished. It is the "has
  // dunked at least once" gate for the claim offer, and it is a counter rather than a
  // flag because the claim is shown once — on the first card — and after that lives as
  // a quiet header link that is always reachable and never in front of the game.
  const [cards, setCards] = useState(0);
  // CLAIM-NOT-BLOCK: every CLAIM on this page opens a soft sheet over the live run, never a
  // same-tab /signup. A guest run is not saved anywhere, so a claim that navigates away is a
  // claim that throws the night (and GO AGAIN) away — the one trade this page must never ask.
  const [claimOpen, setClaimOpen] = useState(false);
  const started = useRef(false);
  const judged = useRef(false);

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

  // TRY-ONBOARD G1/G7: a NIGHT CARD is not the end of the run. The Babylon dunk keeps
  // its stage and its input through the card and resets itself when the guest says GO
  // AGAIN, so this handler banks the night and offers the claim — and touches nothing
  // that could stop play. In particular it never sets `result`, which is the state that
  // raises the wall below, and never bumps `gameKey`, which would remount the engine.
  const handleCard = useCallback(
    async (res: GameResult) => {
      setCards((c) => c + 1);
      // the funnel event is the FIRST card, not every one of them — a continuous night
      // reaches this handler once a contest and would otherwise re-fire it all evening
      if (!judged.current) { judged.current = true; track('first_dunk_judged', { card: 1 }); void flush(); }
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

  // The 2D/3D fallback dunk has no in-mode reset, so its only way back is a remount —
  // that path keeps the modal AND the cold restart. The Babylon dunk never gets here.
  const replay = () => {
    setResult(null);
    setBeat(null);
    setRematch(null);
    setGameKey((k) => k + 1);
  };

  // While the sheet is up it owns the keyboard. InputBus listens on window in the BUBBLE phase and
  // maps Escape to START (pause) and any key to "GO AGAIN", so a capture-phase listener swallows
  // keydowns before the game sees them: Esc closes the sheet instead of pausing the run under it,
  // and Enter/Space still activate the sheet's own buttons (no preventDefault). Keyups pass, so a
  // key held when the sheet opened is still released in the mode.
  useEffect(() => {
    if (!claimOpen) return;
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') setClaimOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [claimOpen]);

  // Secondary by construction: an outline button UNDER GO AGAIN that only opens the sheet.
  const claimLink = (
    <button
      type="button"
      onClick={() => setClaimOpen(true)}
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#00E5FF]/40 px-5 py-2.5 font-mono text-xs text-[#00E5FF] transition-colors hover:bg-[#00E5FF]/10"
    >
      <Flame className="h-4 w-4" /> CLAIM YOUR ATHLETE — SAVE THIS RUN
    </button>
  );

  // The sheet. Sign-up opens in a NEW TAB (the guest cookie rides along, so the claim still lands
  // on this run) and the sheet closes itself; this tab — the stage, the card, GO AGAIN — is never
  // touched. KEEP DUNKING / ✕ / Esc / the backdrop all just close it.
  const claimSheet = (
    <AnimatePresence>
      {claimOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
          onClick={() => setClaimOpen(false)}
          data-testid="claim-sheet"
        >
          <motion.div
            role="dialog"
            aria-label="Claim your athlete"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="fel-panel relative w-full max-w-sm rounded-2xl p-6 text-center"
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setClaimOpen(false)}
              className="absolute right-3 top-3 rounded-md p-1 text-white/40 transition-colors hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="fel-heading text-xl font-bold text-white">Claim your athlete</p>
            <p className="mt-1 text-xs text-white/60">
              Save this run, earn XP, climb the season track and challenge friends. Sign-up opens in a new tab — your contest stays right here.
            </p>
            <a
              href={claimHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => { track('guest_claim', { converted: true }); void flush(); setClaimOpen(false); }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#00E5FF]/50 px-5 py-2.5 font-mono text-xs text-[#00E5FF] transition-colors hover:bg-[#00E5FF]/10"
            >
              <ExternalLink className="h-4 w-4" /> OPEN SIGN-UP (NEW TAB)
            </a>
            <button
              type="button"
              onClick={() => setClaimOpen(false)}
              className="mt-3 w-full rounded-xl bg-[#00E5FF] px-5 py-3 fel-heading text-base font-bold text-black transition-transform hover:scale-[1.02]"
            >
              KEEP DUNKING
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#050505]">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050505]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-2.5">
          {/* DUNK-VISUAL-POLISH: on /try the brand is the only thing in the chrome above a live run, and it was a link
              HOME — one stray click on the header and a guest's contest is gone, with no confirm and nothing to come
              back to (a guest run is not saved anywhere). It stays plain text while the run is live and becomes the
              way out again once the card is up, which is this shell's "quit". */}
          {result ? (
            <Link href="/" className="fel-heading text-lg font-bold text-white">
              <span className="text-[#00E5FF] fel-glow-cyan">FINAL EVOLUTION</span> LAB
            </Link>
          ) : (
            <span className="fel-heading text-lg font-bold text-white" aria-label="Final Evolution Lab">
              <span className="text-[#00E5FF] fel-glow-cyan">FINAL EVOLUTION</span> LAB
            </span>
          )}
          <span className="ml-auto rounded-md border border-[#00FF9D]/40 px-2.5 py-1 font-mono text-[10px] text-[#00FF9D]">
            GUEST · NO ACCOUNT NEEDED
          </span>
          {/* TRY-ONBOARD G3: after the first night the claim is ALWAYS reachable and NEVER in
              front of the game — one quiet link in the chrome. The old shape was the opposite:
              a full-screen modal whose primary button left the page, with DUNK AGAIN as a small
              grey afterthought beside it. */}
          {cards > 0 && !result && (
            <button
              type="button"
              onClick={() => setClaimOpen(true)}
              className="rounded-md border border-[#00E5FF]/40 px-2.5 py-1 font-mono text-[10px] text-[#00E5FF] transition-colors hover:bg-[#00E5FF]/10"
            >
              CLAIM
            </button>
          )}
          {/* …and because the brand no longer navigates, the way out is named. A guest run is not saved, so leaving is
              a real decision and it should look like one rather than hiding under the logo. */}
          {!result && (
            <Link
              href="/"
              className="rounded-md border border-white/15 px-2.5 py-1 font-mono text-[10px] text-white/45 transition-colors hover:border-white/40 hover:text-white"
            >
              QUIT
            </Link>
          )}
        </div>
      </header>

      <div className="relative mx-auto w-full max-w-[1200px] flex-1 px-2 py-3 sm:px-4">
        {babylon ? (
          // G7: NO `key={gameKey}` on this one. The Babylon dunk resets itself in place;
          // remounting it would dispose the engine and cold-boot the venue, the rig and the
          // 3-2-1 for what the mode does on the next frame.
          <DunkBabylon
            grade={grade}
            prq={50}
            continuous
            onEnd={handleEnd}
            onCard={handleCard}
            cardSlot={cards === 1 ? claimLink : null}
          />
        ) : (
          <Fallback key={gameKey} grade={grade} prq={50} onEnd={handleEnd} />
        )}

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

                {/* CLAIM-NOT-BLOCK: the 2D/3D fallback card had the same inversion — a filled CLAIM
                    that left the page over a grey DUNK AGAIN. GO AGAIN is the primary here too. */}
                <button
                  onClick={replay}
                  className="mt-6 flex w-full items-center justify-center rounded-xl bg-[#00E5FF] px-6 py-3.5 fel-heading text-lg font-bold text-black transition-transform hover:scale-[1.02]"
                >
                  GO AGAIN
                </button>
                {claimLink}

                <div className="mt-4 flex items-center justify-center gap-3">
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
        {claimSheet}
      </div>
    </div>
  );
}
