'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, RotateCcw, Home, Loader2, Trophy, Sparkles, Gem, Coins, TrendingUp, TrendingDown, Crown, Award, Share2, Check } from 'lucide-react';
import type { PrqGrade } from '@/lib/prq';
import { PhysicalGamepadPoller } from '@/lib/gamepad-bridge';
import { getScheme } from '@/lib/input-schemes';
import { VirtualController } from './virtual-controller';
import type { SessionTallies } from '@/lib/game-systems';
import { reportEarn } from '@/lib/wallet/client';

export interface GameResult {
  score: number;
  opponentScore?: number;
  won: boolean;
  duration: number;
  headline?: string;
  /** Standardized fun-loop tallies (hits/misses/dodges/combos) for the PRQ pipeline. */
  tallies?: SessionTallies;
  /** Longest combo chain reached during the session. */
  maxCombo?: number;
}

export interface GameProps {
  grade: PrqGrade;
  prq: number;
  onEnd: (result: GameResult) => void;
  /** Gamepad state polled every frame by GameShell — games can read it. */
  gamepad?: import('@/lib/canvas-juice').GamepadState;
}

interface SeasonRecap {
  name: string;
  gained: number;
  tier: number;
  into: number;
  need: number;
  hasPro: boolean;
  tierUps: { tier: number }[];
}
interface MasteryRecap {
  mode: string;
  tier: string;
  tierIndex: number;
  ups: { tier: string }[];
}
interface RecapData {
  xp: number;
  shards: number;
  credits: number;
  prqDelta: number;
  prqAfter: number;
  grade?: { label: string; color: string };
  season?: SeasonRecap | null;
  mastery?: MasteryRecap | null;
}

export function GameShell(props: {
  mode: string;
  title: string;
  venue: string;
  Game: React.ComponentType<GameProps>;
}) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#050505]"><Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" /></div>}>
      <GameShellInner {...props} />
    </Suspense>
  );
}

function GameShellInner({
  mode,
  title,
  venue,
  Game,
}: {
  mode: string;
  title: string;
  venue: string;
  Game: React.ComponentType<GameProps>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const storyNodeId = searchParams.get('story');
  const signatureFlag = searchParams.get('signature');
  const arenaMatchId = searchParams.get('arena');
  const [profile, setProfile] = useState<{ prq: number; grade: PrqGrade } | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [recap, setRecap] = useState<RecapData | null>(null);
  const [storyReward, setStoryReward] = useState<{ rewardLC: number; badge?: { name: string } | null } | null>(null);
  const [arenaResult, setArenaResult] = useState<
    | { settled: boolean; status: string; result?: string; iWon?: boolean; payout?: number; feeLc?: number; myScore?: number; oppScore?: number }
    | null
  >(null);
  const [gameKey, setGameKey] = useState(0);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareState, setShareState] = useState<'idle' | 'minting' | 'copied'>('idle');
  const scheme = getScheme(mode);

  // A single physical-gamepad poller translates controller input into the same
  // synthetic keyboard events the on-screen VirtualController emits, so physical
  // and virtual pads drive every mode identically.
  useEffect(() => {
    if (!scheme) return;
    const poller = new PhysicalGamepadPoller();
    poller.setScheme(scheme);
    let active = true;
    let raf = 0;
    const tick = () => { if (!active) return; poller.poll(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => { active = false; cancelAnimationFrame(raf); poller.setScheme(null); };
  }, [scheme, gameKey]);

  useEffect(() => {
    let live = true;
    fetch('/api/profile')
      .then((r) => (r?.ok ? r.json() : null))
      .then((j) => {
        if (!live) return;
        if (j?.grade) {
          setProfile({ prq: j?.prq ?? 50, grade: j.grade });
        } else {
          router.replace('/login');
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [router, gameKey]);

  const handleEnd = useCallback(
    (res: GameResult) => {
      setResult(res);
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          score: res?.score ?? 0,
          opponentScore: res?.opponentScore ?? 0,
          won: Boolean(res?.won),
          duration: res?.duration ?? 0,
          tallies: res?.tallies,
          maxCombo: res?.maxCombo,
        }),
      })
        .then((r) => (r?.ok ? r.json() : null))
        .then(async (j) => {
          if (j?.ok) {
            setRecap({
              xp: j?.xp ?? 0,
              shards: j?.shards ?? 0,
              credits: j?.credits ?? 0,
              prqDelta: j?.prqDelta ?? 0,
              prqAfter: j?.prqAfter ?? 0,
              grade: j?.grade,
              season: j?.season ?? null,
              mastery: j?.mastery ?? null,
            });
            // FEL wallet (Phase 2): grant coins/shards for EVERY mode through
            // this shared choke point. Dunk is skipped here because the dunk
            // component self-reports richer per-attempt events. Keyed on the
            // server sessionId so a retry is idempotent. Best-effort only.
            if (j?.sessionId && mode !== 'dunk') {
              void reportEarn({
                idempotency_key: `sess:${j.sessionId}:complete`,
                event_type: 'mode_session_completed',
                payload: { mode, run_id: j.sessionId, score: res?.score ?? 0 },
              });
              if (res?.won) {
                void reportEarn({
                  idempotency_key: `sess:${j.sessionId}:won`,
                  event_type: 'mode_session_won',
                  payload: { mode, run_id: j.sessionId },
                });
              }
            }

            // If this is a story run, complete the node
            if (storyNodeId && j?.sessionId) {
              try {
                const sr = await fetch('/api/story/complete', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ nodeId: storyNodeId, sessionId: j.sessionId }),
                }).then((r2) => r2.ok ? r2.json() : null);
                if (sr?.ok && !sr?.alreadyCompleted) {
                  setStoryReward({ rewardLC: sr.rewardLC ?? 0, badge: sr.badge ?? null });
                }
              } catch {}
            }

            // M13.3 signature challenge: submit the score to the weekly ladder
            // when this run was launched from the Signature page (1/day capped
            // server-side). Fire-and-forget; never blocks the recap.
            if (signatureFlag) {
              fetch('/api/signature', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode, score: res?.score ?? 0 }),
              }).catch(() => {});
            }

            // M14 Triumph Arena: when this run was launched from a duel
            // (?arena=<matchId>), submit the score. If both players are in,
            // the server auto-settles and returns the result for the recap.
            if (arenaMatchId) {
              try {
                const ar = await fetch('/api/arena/submit-score', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ matchId: arenaMatchId, score: res?.score ?? 0 }),
                }).then((r2) => (r2.ok ? r2.json() : null));
                if (ar?.ok) {
                  setArenaResult({
                    settled: Boolean(ar.settled),
                    status: ar.status,
                    result: ar.result,
                    iWon: ar.iWon,
                    payout: ar.payout,
                    feeLc: ar.feeLc,
                  });
                }
              } catch {}
            }

            // Report to NEXUS sequencer (fire-and-forget; no-ops when disabled)
            if (j?.sessionId) {
              fetch('/api/nexus/session-result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sessionId: j.sessionId,
                  mode,
                  score: res?.score ?? 0,
                  won: Boolean(res?.won),
                  duration: res?.duration ?? 0,
                  prqAfter: j?.prqAfter ?? 0,
                }),
              }).catch(() => {}); // best-effort, never block the recap
            }
          } else {
            setRecap({ xp: 0, shards: 0, credits: 0, prqDelta: 0, prqAfter: 0 });
          }
        })
        .catch(() => setRecap({ xp: 0, shards: 0, credits: 0, prqDelta: 0, prqAfter: 0 }));
    },
    [mode, storyNodeId, signatureFlag, arenaMatchId]
  );

  const replay = () => {
    setResult(null);
    setRecap(null);
    setArenaResult(null);
    setShareUrl(null);
    setShareState('idle');
    setGameKey((k) => k + 1);
  };

  // Mint a shareable challenge link from this finished run (M13.4 K-factor loop).
  const shareChallenge = useCallback(async () => {
    if (!result) return;
    setShareState('minting');
    try {
      const j = await fetch('/api/challenge/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modeKey: mode,
          score: result.score ?? 0,
          display: result.headline ?? `${title} run`,
        }),
      }).then((r) => (r.ok ? r.json() : null));
      if (j?.path) {
        const url = `${window.location.origin}${j.path}`;
        setShareUrl(url);
        try {
          if (navigator.share) await navigator.share({ title: 'Beat my FEL run', url });
          else await navigator.clipboard.writeText(url);
        } catch {
          try { await navigator.clipboard.writeText(url); } catch {}
        }
        setShareState('copied');
      } else {
        setShareState('idle');
      }
    } catch {
      setShareState('idle');
    }
  }, [result, mode, title]);

  return (
    <div className="flex min-h-screen flex-col bg-[#050505]">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050505]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-2.5">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs font-medium text-white/60 transition-colors hover:border-[#00E5FF]/50 hover:text-[#00E5FF]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> HUB
          </Link>
          <div>
            <h1 className="fel-heading text-xl font-bold leading-none text-white">{title}</h1>
            <p className="font-mono text-[10px] text-white/40">{venue}</p>
          </div>
          {profile && (
            <span
              className="ml-auto rounded-md border px-2.5 py-1 font-mono text-xs"
              style={{ borderColor: `${profile.grade?.color}55`, color: profile.grade?.color }}
            >
              PRQ {Math.round(profile.prq)} · {profile.grade?.label}
            </span>
          )}
        </div>
      </header>

      <div className="relative mx-auto w-full max-w-[1200px] flex-1 px-2 py-3 sm:px-4">
        {profile ? (
          <Game key={gameKey} grade={profile.grade} prq={profile.prq} onEnd={handleEnd} />
        ) : (
          <div className="flex h-[60vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
          </div>
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
                  {result.headline ?? (result.won ? 'VICTORY' : 'SESSION COMPLETE')}
                </h2>
                <p className="mt-1 font-mono text-sm text-white/50">
                  Score {result.score}
                  {typeof result.opponentScore === 'number' && result.opponentScore > 0 ? ` — ${result.opponentScore}` : ''}
                </p>

                {recap ? (
                  <>
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="fel-card rounded-lg p-3">
                      <Sparkles className="mx-auto h-4 w-4 text-[#00FF9D]" />
                      <div className="mt-1 font-mono text-xl font-bold text-[#00FF9D]">+{recap.xp}</div>
                      <div className="text-[10px] uppercase tracking-wider text-white/40">XP</div>
                    </div>
                    <div className="fel-card rounded-lg p-3">
                      <Gem className="mx-auto h-4 w-4 text-[#A855F7]" />
                      <div className="mt-1 font-mono text-xl font-bold text-[#A855F7]">+{recap.shards}</div>
                      <div className="text-[10px] uppercase tracking-wider text-white/40">Shards</div>
                    </div>
                    <div className="fel-card rounded-lg p-3">
                      <Coins className="mx-auto h-4 w-4 text-[#FFD700]" />
                      <div className="mt-1 font-mono text-xl font-bold text-[#FFD700]">+{recap.credits}</div>
                      <div className="text-[10px] uppercase tracking-wider text-white/40">Credits</div>
                    </div>
                    <div className="fel-card rounded-lg p-3">
                      {recap.prqDelta >= 0 ? (
                        <TrendingUp className="mx-auto h-4 w-4 text-[#00E5FF]" />
                      ) : (
                        <TrendingDown className="mx-auto h-4 w-4 text-[#FF3366]" />
                      )}
                      <div className={`mt-1 font-mono text-xl font-bold ${recap.prqDelta >= 0 ? 'text-[#00E5FF]' : 'text-[#FF3366]'}`}>
                        {recap.prqDelta >= 0 ? '+' : ''}
                        {recap.prqDelta}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-white/40">PRQ Δ</div>
                    </div>
                  </div>
                  {storyReward && (
                    <div className="mt-3 rounded-lg border border-[#A855F7]/30 bg-[#A855F7]/10 p-3 text-center">
                      <p className="text-xs font-bold text-[#A855F7]">STORY NODE COMPLETE</p>
                      <p className="mt-1 font-mono text-sm text-[#FFD700]">+{storyReward.rewardLC} LC</p>
                      {storyReward.badge && (
                        <p className="mt-1 text-xs text-amber-400">{'🏆'} {storyReward.badge.name}</p>
                      )}
                    </div>
                  )}

                  {/* M14 Triumph Arena — duel result */}
                  {arenaResult && (
                    <div
                      className={`mt-3 rounded-lg border p-3 text-center ${
                        !arenaResult.settled
                          ? 'border-white/20 bg-white/[0.04]'
                          : arenaResult.result === 'tie'
                          ? 'border-white/25 bg-white/[0.05]'
                          : arenaResult.iWon
                          ? 'border-[#00FF9D]/40 bg-[#00FF9D]/10'
                          : 'border-[#FF3366]/40 bg-[#FF3366]/10'
                      }`}
                    >
                      <p className="text-xs font-bold tracking-wide text-white/80">TRIUMPH ARENA</p>
                      {!arenaResult.settled ? (
                        <p className="mt-1 text-sm text-white/70">Score locked in — waiting for your opponent to finish.</p>
                      ) : arenaResult.result === 'tie' ? (
                        <p className="mt-1 text-sm text-white/80">Tie — both entries refunded ({arenaResult.feeLc} LC each).</p>
                      ) : arenaResult.iWon ? (
                        <p className="mt-1 font-mono text-sm font-bold text-[#00FF9D]">You won the duel — +{arenaResult.payout} LC</p>
                      ) : (
                        <p className="mt-1 text-sm text-[#FF3366]">You lost this duel. Better luck next time.</p>
                      )}
                      <a href="/arena" className="mt-2 inline-block text-[11px] text-[#00E5FF] underline">
                        Back to the Arena
                      </a>
                    </div>
                  )}

                  {/* M13.2 season pass progress + tier-up feedback */}
                  {recap.season && (
                    <div className="mt-3 rounded-lg border border-[#FFD700]/25 bg-[#FFD700]/[0.06] p-3 text-left">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-[#FFD700]">
                          <Crown className="h-3.5 w-3.5" /> {recap.season.name}
                        </span>
                        <span className="font-mono text-[11px] text-white/60">+{recap.season.gained} season XP</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="font-mono text-[11px] text-white/50">T{recap.season.tier}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-[#FFD700]"
                            style={{ width: `${Math.min(100, Math.round((recap.season.into / Math.max(1, recap.season.need)) * 100))}%` }}
                          />
                        </div>
                        <span className="font-mono text-[11px] text-white/50">T{recap.season.tier + 1}</span>
                      </div>
                      {recap.season.tierUps.length > 0 && (
                        <p className="mt-2 text-center text-xs font-bold text-[#FFD700]">
                          {'🎖'} TIER UP! Reached Tier {recap.season.tierUps[recap.season.tierUps.length - 1].tier}
                        </p>
                      )}
                    </div>
                  )}

                  {/* M13.3 mastery-up feedback */}
                  {recap.mastery && recap.mastery.ups.length > 0 && (
                    <Link
                      href="/mastery"
                      className="mt-3 block rounded-lg border border-[#00E5FF]/30 bg-[#00E5FF]/10 p-3 text-center transition-colors hover:bg-[#00E5FF]/20"
                    >
                      <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-[#00E5FF]">
                        <Award className="h-3.5 w-3.5" /> MASTERY UP — {recap.mastery.ups[recap.mastery.ups.length - 1].tier}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-white/45">See the full ladder &rarr;</p>
                    </Link>
                  )}

                  {/* M13.4 share challenge (K-factor loop) */}
                  <button
                    onClick={shareChallenge}
                    disabled={shareState === 'minting'}
                    className="fel-heading mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-[#A855F7]/50 bg-[#A855F7]/10 py-2.5 text-sm font-bold text-[#A855F7] transition-colors hover:bg-[#A855F7]/20 disabled:opacity-60"
                  >
                    {shareState === 'copied' ? (
                      <><Check className="h-4 w-4" /> CHALLENGE LINK COPIED</>
                    ) : shareState === 'minting' ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> MINTING…</>
                    ) : (
                      <><Share2 className="h-4 w-4" /> CHALLENGE A FRIEND</>
                    )}
                  </button>
                  {shareUrl && (
                    <p className="mt-1 break-all font-mono text-[10px] text-white/40">{shareUrl}</p>
                  )}
                  </>
                ) : (
                  <div className="mt-6 flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-[#00E5FF]" />
                  </div>
                )}

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={replay}
                    className="fel-heading flex flex-1 items-center justify-center gap-2 rounded-md bg-[#00E5FF] py-3 text-base font-bold text-black transition-all hover:bg-[#00E5FF]/85"
                  >
                    <RotateCcw className="h-4 w-4" /> REPLAY
                  </button>
                  <Link
                    href={storyNodeId ? '/story' : '/'}
                    className="fel-heading flex flex-1 items-center justify-center gap-2 rounded-md border border-white/15 py-3 text-base font-bold text-white/80 transition-colors hover:border-[#00E5FF]/60 hover:text-[#00E5FF]"
                  >
                    <Home className="h-4 w-4" /> {storyNodeId ? 'MAP' : 'HUB'}
                  </Link>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {profile && scheme && !result && <VirtualController scheme={scheme} />}
    </div>
  );
}
