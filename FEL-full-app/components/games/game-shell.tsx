'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { proofLineFor, type ProofVerdict } from '@/lib/proofLine';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { Maximize2, Minimize2, ArrowLeft, Loader2 } from 'lucide-react';
import type { PrqGrade } from '@/lib/prq';
import { PhysicalGamepadPoller } from '@/lib/gamepad-bridge';
import { getScheme } from '@/lib/input-schemes';
import { isBabylon } from '@/components/three/flags';
import { canFullscreen, isFullscreen, isLandscapePhone, toggleFullscreen } from '@/lib/ui/fullscreen';
import { VirtualController } from './virtual-controller';
import { ReplayInPlaceContext } from './replay-in-place';
import { BodyControl } from './body-control';
import { GameCaptureHud } from '@/components/capture/game-capture-hud';
import type { SessionTallies } from '@/lib/game-systems';
import { sessionStore, markRun, countedSince } from '@/lib/babylon/core/sessionStore';
import { arenaRefusal, storyRefusal, type Refusal } from './end-card-refusal';
import { EndScreen } from './end-screen/end-screen';
import { unpaidReason } from '@/lib/sessions/unpaidCopy';
import {
  type CarnivalStop, type CarnivalRunState,
  recordCarnivalResult, clearCarnivalRun,
} from '@/lib/carnival-run';

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
  /** Pass 5 phase 3: the mode's own end-of-session stats and outcome, for the proof line (lib/proofLine.ts). */
  stats?: Record<string, number | string | boolean>;
  outcome?: string;
  /** The mode's non-numeric detail (SessionResult.detail): the dunk card rides here to the Arena submit. Declared now that
   *  the dunk host passes it on (the arena integrity hotfix, 2026-09-24). */
  detail?: unknown;
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
  /** FEATURES-UX-SHOP: the server recorded no session — the run ended with no evidence of play. */
  noPlay?: boolean;
  /** ECONOMY-SESSIONS-HARDEN: the run was recorded but paid nothing (AGENT / PLAYTEST / TEST_ACCOUNT), or the server refused
   *  its result (SCORE_INVALID, RUN_MISSING, RUN_EXPIRED…) — the reason the server gave. Absent on a paid run. */
  unpaid?: string;
  xp: number;
  shards: number;
  credits: number;
  prqDelta: number;
  prqAfter: number;
  grade?: { label: string; color: string };
  season?: SeasonRecap | null;
  mastery?: MasteryRecap | null;
  capMessage?: string;
  /** END SCREEN: the server's streak after this run, and the streak Lab Credits inside `credits` (read for the card only). */
  streakDays?: number;
  streakBonus?: number;
}

export function GameShell(props: {
  mode: string;
  title: string;
  venue: string;
  Game: React.ComponentType<GameProps>;
  /** True when Game already mounts its own <TouchOverlay> (Babylon modes) —
   *  suppresses the legacy VirtualController so only one control deck shows. */
  ownControls?: boolean;
  /** Extra props for the mode itself — a seam a mode needs wired that the shell has no opinion about. */
  gameProps?: Record<string, unknown>;
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
  ownControls,
  gameProps,
}: {
  mode: string;
  title: string;
  venue: string;
  Game: React.ComponentType<GameProps>;
  ownControls?: boolean;
  gameProps?: Record<string, unknown>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const storyNodeId = searchParams.get('story');
  const signatureFlag = searchParams.get('signature');
  const arenaMatchId = searchParams.get('arena');
  const mpCode = searchParams.get('mp');   // pass 5 phase 5: an async challenge code — accept it with this run's session
  const challengeCode = searchParams.get('c'); // K-factor challenge link: /c/<code> -> /play/<mode>?c=<code>
  const carnivalFlag = searchParams.get('carnival');
  // ECONOMY-SESSIONS-HARDEN: an agent or playtest run is started as one, so the server records it and pays nothing
  const agentRun = searchParams.get('agent') === '1';
  const playtestRun = searchParams.get('playtest') === '1';
  const [profile, setProfile] = useState<{ prq: number; grade: PrqGrade } | null>(null);
  // Ship pass 2, Phase 4: the profile request failing (offline, server down)
  // used to leave the shell empty and silent — no game, no message. Measured
  // with a blocked /api/** on /play/onevone: "HUB ONES Venice Beach Court" and
  // nothing else. Say so, and offer a retry.
  const [unreachable, setUnreachable] = useState(false);
  const [profileTry, setProfileTry] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [recap, setRecap] = useState<RecapData | null>(null);
  /** The wallet coins this run's earn reports were granted (BRAINBRAWL-POLISH-2 N10), and whether a cap cut the coin earn —
   *  null until a grant lands, and left null for a refused earn or a zero grant nothing capped (no "+0" tile). */
  const [recapCoins, setRecapCoins] = useState<{ coins: number; capped: boolean } | null>(null);
  const runSeq = useRef(0);   // a grant that lands after REPLAY belongs to the run before it
  const [carnivalRun, setCarnivalRun] = useState<CarnivalRunState | null>(null);
  const [storyReward, setStoryReward] = useState<{ rewardLC: number; badge?: { name: string } | null } | null>(null);
  /** The Story route refused this run (end-card-refusal): the card says why instead of saying nothing. */
  const [storyRefused, setStoryRefused] = useState<Refusal | null>(null);
  const [mpResult, setMpResult] = useState<{ status: string; hostScore: number; guestScore: number; hostName?: string; iWon: boolean; tie: boolean } | null>(null);
  const [challengeResult, setChallengeResult] = useState<{ beat: boolean; targetScore: number; margin: number; vs?: string; rematchPath?: string } | null>(null);
  const [arenaResult, setArenaResult] = useState<
    | { settled: boolean; status: string; result?: string; iWon?: boolean; payout?: number; feeLc?: number; myScore?: number; oppScore?: number; refused?: Refusal }
    | null
  >(null);
  const [gameKey, setGameKey] = useState(0);
  /** Stream mode: a 16:9 stage with the chrome hidden, for OBS or a phone's own screen broadcast. */
  const [streamOn, setStreamOn] = useState(false);
  // FEATURES-UX-SHOP (2026-09-08): browsing is not playing. A mode left idle ends on its own clock and used to post a
  // score-0 session that paid XP, a profile shard, streak credits and the 40-coin "Session completed" floor. The shell
  // now counts the presses it saw while the run was live (keys — the pad bridge and the touch deck both emit them —
  // pointers, touches; the results card's buttons come after the run and do not count) and sends `played` with the
  // session; the server pays only on evidence of play (lib/session-evidence.ts). Three presses, so a lone tap on a
  // "ready" overlay followed by nothing still reads as no play.
  const inputCount = useRef(0);
  const runLive = useRef(true);
  // MOVEMENT PLAY P3 step 5 (2026-09-26): the shell's own count sees only keys, pointers and touches on the window — a pad,
  // the body and Controller Link reach the game through its InputBus and never touched it, so a pad-only or phone-only run
  // that scored 0 was NO PLAY. The harness writes "input the game received", from every source (sessionStore's run
  // record, owner call 4); the shell marks the record when its game mounts and on REPLAY, and at handleEnd counts what
  // came after the mark — never the run before (runId only grows). Read there once, not subscribed: a subscription would
  // re-render the shell, and the game under it, on every counted press.
  const runMark = useRef(markRun(null));
  // ECONOMY-SESSIONS-HARDEN (2026-09-28): the run the SERVER started for this game (POST /api/sessions/start), asked for
  // when the game mounts and on every REPLAY. Its runId is the one key the session's payouts are filed under, and the
  // server times the run from its own start — the client's duration is not read. null = no run (signed out, offline):
  // the finish then says RUN_MISSING and pays nothing.
  const serverRun = useRef<Promise<string | null> | null>(null);
  const startServerRun = useCallback((): Promise<string | null> => {
    const url = `/api/sessions/start${agentRun ? '?agent=1' : ''}`;
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, ...(playtestRun ? { playtest: true } : {}) }) })
      .then((r) => (r?.ok ? r.json() : null))
      .then((j) => {
        if (j && typeof j.runId === 'string') {
          import('@/lib/agentRunHooks').then(({ setAgentRunHooksAllowed }) => {
            setAgentRunHooksAllowed(Boolean(j.agentRun));
          });
          return j.runId as string;
        }
        import('@/lib/agentRunHooks').then(({ setAgentRunHooksAllowed }) => setAgentRunHooksAllowed(false));
        return null;
      })
      .catch(() => {
        import('@/lib/agentRunHooks').then(({ setAgentRunHooksAllowed }) => setAgentRunHooksAllowed(false));
        return null;
      });
  }, [mode, agentRun, playtestRun]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareState, setShareState] = useState<'idle' | 'minting' | 'copied'>('idle');
  const scheme = getScheme(mode);

  // ONE INPUT OWNER PER GAME (ported from elijahbonds-fel-upgrade-pass, 2026-09-12; measured here 2026-09-15).
  //
  // A Babylon host owns its own input: InputBus polls the pads directly and TouchOverlay draws the touch deck. Running
  // the shell's poller on top delivered every pad press TWICE — once as the real pad, once as a synthetic key — and on a
  // HELD trigger the two disagreed frame by frame: football's 2 s truck hold arrived as 35 separate presses, 60 of which
  // the cause-and-effect probe then scored silent. The shell bridge stays the only input path for the legacy DOM games.
  const babylonOwnsInput = isBabylon(mode) || !!ownControls;

  // A single physical-gamepad poller translates controller input into the same
  // synthetic keyboard events the on-screen VirtualController emits, so physical
  // and virtual pads drive every mode identically.
  useEffect(() => {
    if (!scheme || babylonOwnsInput) return;
    const poller = new PhysicalGamepadPoller();
    poller.setScheme(scheme);
    let active = true;
    let raf = 0;
    const tick = () => { if (!active) return; poller.poll(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => { active = false; cancelAnimationFrame(raf); poller.setScheme(null); };
  }, [scheme, gameKey, babylonOwnsInput]);

  useEffect(() => { runLive.current = result === null; }, [result]);
  useEffect(() => {
    inputCount.current = 0;
    runMark.current = markRun(sessionStore.record());
    serverRun.current = startServerRun();
    const mark = () => { if (runLive.current) inputCount.current += 1; };
    window.addEventListener('keydown', mark);
    window.addEventListener('pointerdown', mark);
    window.addEventListener('touchstart', mark, { passive: true });
    return () => {
      window.removeEventListener('keydown', mark);
      window.removeEventListener('pointerdown', mark);
      window.removeEventListener('touchstart', mark);
    };
  }, [gameKey, startServerRun]);

  useEffect(() => {
    let live = true;
    setUnreachable(false);
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
      .catch(() => { if (live) setUnreachable(true); });
    return () => {
      live = false;
    };
  }, [router, gameKey, profileTry]);

  const handleEnd = useCallback(
    (res: GameResult) => {
      setResult(res);
      // Which run this is, read NOW: the card and its REPLAY show before /api/sessions answers, and Brain Brawl's REPLAY in
      // place is instant — a read taken after the round-trip saw the rematch's number and passed run 1's coins off as run
      // 2's. Every answer below still does its work for this run (grants, Story, Arena); only the card is guarded.
      const run = runSeq.current;
      const mine = () => run === runSeq.current;
      // this run's server run, read now (a REPLAY swaps in the next one). Not cleared: a game that ends the same run twice
      // finishes the same runId twice, and the server answers the second with the first's stored result (replayed)
      const started = serverRun.current ?? Promise.resolve(null);
      started.then((runId) => fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          // ECONOMY-SESSIONS-HARDEN: the run the server started; the server checks the score as sent (a whole number >= 0,
          // within the mode's rules) and times the run itself — `duration` is only the room's own figure now
          runId,
          score: Math.max(0, Math.round(res?.score ?? 0)),
          opponentScore: res?.opponentScore ?? 0,
          won: Boolean(res?.won),
          duration: res?.duration ?? 0,
          tallies: res?.tallies,
          maxCombo: res?.maxCombo,
          // the room's own end-of-session stats (the music set's counts, the dance judge's): the server reads the set from
          // them (lib/session-payout.ts, the SHARED CONTRACT; ROOM_STATS_FORWARDED) — and the duel this run was staked in,
          // the only thing that makes a music set an Arena set there (route.ts verifiedMusicDuel)
          stats: res?.stats,
          ...(arenaMatchId ? { arenaMatchId } : {}),
          played: inputCount.current >= 3 || countedSince(sessionStore.record(), runMark.current) >= 3,
        }),
      }))
        // a refusal (SCORE_INVALID, RUN_MISSING, RUN_EXPIRED…) is a 4xx whose body says why: read it for the card
        .then((r) => (r ? r.json().catch(() => null) : null))
        .then(async (j) => {
          if (j?.ok) {
            // ECONOMY-CAPS (c): a replayed finish returns the stored body verbatim — no second reward card.
            if (j?.replayed) return;
            if (mine()) setRecap({
              noPlay: Boolean(j?.noPlay),
              ...(j?.paid === false && !j?.noPlay ? { unpaid: String(j?.reason ?? 'UNPAID') } : {}),
              xp: j?.xp ?? 0,
              shards: j?.shards ?? 0,
              credits: j?.credits ?? 0,
              prqDelta: j?.prqDelta ?? 0,
              prqAfter: j?.prqAfter ?? 0,
              grade: j?.grade,
              season: j?.season ?? null,
              mastery: j?.mastery ?? null,
              capMessage: typeof j?.capMessage === 'string' ? j.capMessage : undefined,
              ...(Number.isFinite(j?.streakDays) ? { streakDays: Number(j.streakDays) } : {}),
              ...(Number.isFinite(j?.streakBonus) ? { streakBonus: Number(j.streakBonus) } : {}),
            });
            // ECONOMY-SESSIONS-HARDEN (2026-09-28): the wallet coins this run paid come IN the session's answer — the server
            // wrote them in the run's own transaction (they were two earn reports from here, keyed by the new session's id,
            // so a retried session paid them twice). The card shows exactly the server's figure and nothing it did not
            // grant: no coin tile when the run paid none, and no daily line (the daily first-session faucet is the wallet
            // chip's, and a replay of it is not shown anywhere — lib/wallet/client.ts).
            if (mine() && j?.paid === true) {
              const coins = Number.isFinite(j?.coins) ? Number(j.coins) : 0;
              const capped = Boolean(j?.coinsCapped);
              if (coins > 0 || capped) setRecapCoins({ coins, capped });
            }

            // If this is a story run, complete the node
            if (storyNodeId && j?.sessionId) {
              try {
                const sr = await fetch('/api/story/complete', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ nodeId: storyNodeId, sessionId: j.sessionId }),
                }).then(async (r2) => {
                  if (r2.ok) return r2.json();
                  // a refused run (422: the verdict — error, required, achieved; 409: the run already completed another
                  // node) is said on the card, not swallowed (end-card-refusal)
                  const refused = storyRefusal(r2.status, await r2.json().catch(() => null));
                  if (refused && mine()) setStoryRefused(refused);
                  return null;
                });
                if (sr?.ok && !sr?.alreadyCompleted) {
                  if (mine()) setStoryReward({ rewardLC: sr.rewardLC ?? 0, badge: sr.badge ?? null });
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
                // Arena scores must be whole numbers (submit-score validates
                // integers); some modes accrue fractional points internally
                // (e.g. the carnival gauntlet at 0.4/unit).
                const arenaScore = Math.max(0, Math.round(res?.score ?? 0));
                const ar = await fetch('/api/arena/submit-score', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  // the dunk card rides along when the mode produced one, so the other player can see what
                  // was actually thrown rather than only the number it added up to
                  body: JSON.stringify({
                    matchId: arenaMatchId, score: arenaScore,
                    ...((res as { detail?: { card?: unknown } })?.detail?.card ? { card: (res as { detail?: { card?: unknown } }).detail!.card } : {}),
                  }),
                }).then(async (r2) => {
                  if (r2.ok) return r2.json();
                  // HOTFIX (2026-09-24, the arena integrity pass): the server refuses a score above its mode's limit or a
                  // dunk card that does not add up (422, lib/arena-score-integrity.ts), and a duel that is closed or has no
                  // opponent yet (409). The panel used to vanish on any refusal; now it says so, in the server's words. A 422
                  // records nothing, so the duel stays open and the next run from the same link submits again.
                  const refused = arenaRefusal(r2.status, await r2.json().catch(() => null));
                  if (refused && mine()) setArenaResult({ settled: false, status: 'REFUSED', myScore: arenaScore, refused });
                  return null;
                });
                if (ar?.ok) {
                  // ARENA-10PHASE P1/P2: keep both settled scores — the card reads the duel from them, not from the mode's own rival.
                  const p1 = typeof ar.p1Score === 'number' ? ar.p1Score : undefined, p2 = typeof ar.p2Score === 'number' ? ar.p2Score : undefined;
                  if (mine()) setArenaResult({
                    settled: Boolean(ar.settled),
                    status: ar.status,
                    result: ar.result,
                    iWon: ar.iWon,
                    payout: ar.payout,
                    feeLc: ar.feeLc,
                    myScore: arenaScore,
                    oppScore: p1 === undefined || p2 === undefined ? undefined : p1 === arenaScore ? p2 : p1,
                  });
                }
              } catch {}
            }

            // Pass 5 phase 5: accepting a friend's async challenge from the results card. The session above is what
            // bestScoreFor reads; the join settles best score vs best score and says who won.
            if (mpCode) {
              try {
                const mj = await fetch('/api/v1/mp/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: mpCode }) }).then((r2) => (r2.ok ? r2.json() : null));
                const m = mj?.match ?? mj;
                if (m && m.status && mine()) setMpResult({ status: m.status, hostScore: Number(m.hostScore ?? 0), guestScore: Number(m.guestScore ?? 0), hostName: m.hostName, iWon: !!m.winnerId && m.winnerId === m.guestId, tie: m.status === 'settled' && !m.winnerId });
              } catch {}
            }

            if (challengeCode) {
              try {
                const cj = await fetch(`/api/challenge/${encodeURIComponent(challengeCode)}/attempt`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ attemptScore: res?.score ?? 0, attemptTag: 'ATHLETE' }),
                }).then((r2) => (r2.ok ? r2.json() : null));
                if (cj && mine()) {
                  setChallengeResult({
                    beat: Boolean(cj.beat),
                    targetScore: Number(cj.targetScore ?? 0),
                    margin: Number(cj.margin ?? 0),
                    vs: typeof cj.vs === 'string' ? cj.vs : undefined,
                    rematchPath: typeof cj.rematch?.path === 'string' ? cj.rematch.path : undefined,
                  });
                }
              } catch {}
            }

            // Court Carnival relay: this stop's reward already posted above
            // through the normal pipeline — this only advances the run so
            // the recap can offer "next stop" instead of Replay/Hub.
            // a stop advances on the run whose card is up: REPLAY before this answered means the rematch is the stop's run
            if (carnivalFlag && mine()) {
              const updated = recordCarnivalResult(mode as CarnivalStop, {
                score: res?.score ?? 0,
                won: Boolean(res?.won),
              });
              setCarnivalRun(updated);
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
          } else if (mine()) {
            setRecap({ xp: 0, shards: 0, credits: 0, prqDelta: 0, prqAfter: 0, ...(j?.reason ? { unpaid: unpaidReason(j.reason, j.detail) } : {}) });
          }
        })
        .catch(() => { if (mine()) setRecap({ xp: 0, shards: 0, credits: 0, prqDelta: 0, prqAfter: 0 }); });
    },
    [mode, storyNodeId, signatureFlag, arenaMatchId, carnivalFlag, mpCode, challengeCode]
  );

  // REPLAY IN PLACE (BRAINBRAWL-RESIDUAL, 2026-09-24): a game that can start its next match on the stage it already has
  // registers a restart (replay-in-place.ts). REPLAY then clears the card and calls it — no key bump, no remount, no splash.
  // A game that registers nothing (every other mode) remounts exactly as before.
  const inPlace = useRef<(() => boolean) | null>(null);
  const registerReplay = useCallback((fn: (() => boolean) | null) => { inPlace.current = fn; }, []);

  const replay = () => {
    setResult(null);
    setRecap(null);
    setRecapCoins(null);
    setStoryReward(null);
    runSeq.current += 1;
    setArenaResult(null);
    setStoryRefused(null);
    setMpResult(null);
    setChallengeResult(null);
    setShareUrl(null);
    setShareState('idle');
    // the next run's evidence of play starts from zero, as a remount would start it — the game's record too: marked before
    // an in-place restart (it keeps the same harness run going, so only what comes after REPLAY is the rematch's)
    runMark.current = markRun(sessionStore.record());
    if (inPlace.current?.()) { inputCount.current = 0; serverRun.current = startServerRun(); return; }
    setGameKey((k) => k + 1);
  };

  // Mint a shareable challenge link from this finished run (M13.4 K-factor loop).
  // PACK THE FIVE #3: `display` may be overridden — the dunk proof card mints the same link with the make/miss line.
  const shareChallenge = useCallback(async (displayOverride?: string) => {
    if (!result) return;
    setShareState('minting');
    try {
      const j = await fetch('/api/challenge/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modeKey: mode,
          score: result.score ?? 0,
          display: displayOverride ?? result.headline ?? `${title} run`,
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

  // Pass 5 phase 3 (was PACK THE FIVE #3, dunk only): one proof line per mode from its own stats — lib/proofLine.ts.
  // ARENA-10PHASE P1/P2 (2026-09-07): ONE source of truth for an Arena run's W/L. The mode's rival (dunk's in-game rival, the 3PT
  // field) and the Triumph Arena house rival are different opponents, so the card read "You won the duel — +45 LC" over a
  // proof line that said "YOU LOST" (playtest d3d4a93, dunk 128–156 in-game vs a lower house draw; 3PT "Tie — refunded" vs
  // "LOST"). When the run was staked, the settlement is the verdict: headline, score line, proof line and the arena card all
  // read from it. A run whose submission never came back keeps the mode's own result (no arena card, no arena claim).
  const arenaVerdict: ProofVerdict | null = arenaMatchId && arenaResult && !arenaResult.refused
    ? (!arenaResult.settled ? 'PENDING' : arenaResult.result === 'tie' ? 'TIE' : arenaResult.iWon ? 'WON' : 'LOST')
    : null;
  const arenaOpp = arenaVerdict && arenaVerdict !== 'PENDING' ? arenaResult?.oppScore : undefined;
  // A staked run whose score the Arena REFUSED (422 over the mode's limit / a dunk card that doesn't add up, 409 closed or no
  // opponent) has no verdict at all — and the mode's own W/L is against its in-game rival, not the Arena. So the card claims
  // nothing: no trophy, no win headline, no proof line, nothing to share (review: gold trophy + 'BIG BRAIN' + 'You won' over
  // 'Score not accepted').
  const arenaRefused = Boolean(arenaMatchId && arenaResult?.refused);
  const proofLine = result && !arenaRefused ? proofLineFor(mode, {
    score: result.score,
    opponentScore: arenaOpp ?? result.opponentScore,
    won: arenaVerdict ? arenaVerdict === 'WON' : result.won,
    outcome: result.outcome, stats: result.stats,
    verdict: arenaVerdict ?? undefined,
  }) : null;
  const cardWon = arenaRefused ? false : arenaVerdict ? arenaVerdict === 'WON' : Boolean(result?.won);
  const cardHeadline = !result ? '' : arenaRefused ? 'SCORE NOT ACCEPTED' : arenaVerdict === 'WON' ? 'DUEL WON' : arenaVerdict === 'LOST' ? 'DUEL LOST' : arenaVerdict === 'TIE' ? 'DUEL TIED' : arenaVerdict === 'PENDING' ? 'SCORE LOCKED IN' : (result.headline ?? (result.won ? 'VICTORY' : 'SESSION COMPLETE'));
  const shareProof = useCallback(() => { if (proofLine) void shareChallenge(`PROOF · ${proofLine}`); }, [proofLine, shareChallenge]);

  // A PHONE HELD SIDEWAYS GETS THE WHOLE SCREEN.
  //
  // Measured at 844x390 before this: the stage is h-[calc(100dvh-3.25rem)], which assumes the header is all
  // that sits above it — but the container also has py-3. 56 (header) + 12 (pad) + 338 (stage) + 12 = 418 on a
  // 390px-tall screen, so the bottom of the game was 16px off the bottom of the phone AND the page scrolled,
  // which on a game means you can flick the thing you are playing off the screen.
  //
  // Landscape is detected by HEIGHT, not by a width breakpoint: a landscape phone is 844 across, wider than
  // plenty of laptops, so a width test gets it exactly backwards.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [immersive, setImmersive] = useState(false);
  const [fsAvailable, setFsAvailable] = useState(false);
  const [fsOn, setFsOn] = useState(false);

  useEffect(() => {
    const measure = () => setImmersive(isLandscapePhone(window.innerWidth, window.innerHeight));
    measure();
    setFsAvailable(canFullscreen(stageRef.current));
    const onFs = () => setFsOn(isFullscreen());
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
    };
  }, []);

  // While the game owns the screen, the document must not scroll — a stray drag should move the player, not
  // the page. Restored on the way out, including if the component unmounts mid-game.
  useEffect(() => {
    if (!immersive && !fsOn) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [immersive, fsOn]);

  const onFullscreen = useCallback(() => { void toggleFullscreen(stageRef.current); }, []);

  const fullBleed = immersive || fsOn;

  return (
    <div className={fullBleed ? 'flex h-[100dvh] flex-col overflow-hidden bg-[#050505]' : 'flex min-h-screen flex-col bg-[#050505]'}>
      {/* Sideways on a phone, the header is a fifth of the screen spent on a back link. It goes; the way out
          lives on the stage instead, where a thumb already is. */}
      <header data-game-chrome className={`sticky top-0 z-40 border-b border-white/10 bg-[#050505]/85 backdrop-blur-md ${fullBleed || streamOn ? 'hidden' : ''}`}>
        <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-2.5">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs font-medium text-white/60 transition-colors hover:border-[#00E5FF]/50 hover:text-[#00E5FF]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Home
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
          {/* BODY CONTROL, for every mode at once. It is an input device, not a mode feature — poseControl maps
              a body to the same FelInput a gamepad produces and emitToLive posts it to whichever bus is running,
              so no mode file knows this exists. */}
          <BodyControl />
          {fsAvailable && (
            <button
              type="button"
              onClick={onFullscreen}
              aria-label={fsOn ? 'Leave full screen' : 'Full screen'}
              className={`grid h-8 w-8 place-items-center rounded-md border border-white/10 text-white/50
                          transition-colors hover:border-[#00E5FF]/50 hover:text-[#00E5FF] ${profile ? '' : 'ml-auto'}`}
            >
              {fsOn ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}
        </div>
      </header>

      <div
        ref={stageRef}
        data-fel-stream={streamOn ? '1' : undefined}
        className={fullBleed
          ? 'relative w-full flex-1 overflow-hidden'
          : 'relative mx-auto w-full max-w-[1200px] flex-1 px-2 py-3 sm:px-4'}
      >
        <GameCaptureHud mode={mode} stageRef={stageRef} streamOn={streamOn} onStreamMode={setStreamOn} />
        {/* The two controls the header was carrying, as thumb-sized glass over the corner of the stage. Only
            while full-bleed — with the header up they would be a second copy of it. */}
        {fullBleed && !streamOn && (
          <div data-game-chrome className="pointer-events-none absolute right-2 top-2 z-30 flex items-center gap-1.5">
            <Link
              href="/play"
              aria-label="Leave the game"
              className="pointer-events-auto grid h-9 w-9 place-items-center rounded-lg border border-white/15
                         bg-black/50 text-white/70 backdrop-blur-md transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="pointer-events-auto"><BodyControl compact /></span>
            {fsAvailable && (
              <button
                type="button"
                onClick={onFullscreen}
                aria-label={fsOn ? 'Leave full screen' : 'Full screen'}
                className="pointer-events-auto grid h-9 w-9 place-items-center rounded-lg border border-white/15
                           bg-black/50 text-white/70 backdrop-blur-md transition-colors hover:text-white"
              >
                {fsOn ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            )}
          </div>
        )}
        {!profile && unreachable && (
          <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
            <p className="font-mono text-sm text-white/80">Can&apos;t reach the server. Check your connection, then try again.</p>
            <button type="button" onClick={() => setProfileTry((n) => n + 1)} className="rounded-md border border-[#00E5FF]/60 px-4 py-2 font-mono text-sm text-[#00E5FF]">RETRY</button>
          </div>
        )}
        {profile ? (
          <ReplayInPlaceContext.Provider value={registerReplay}>
            <Game key={gameKey} grade={profile.grade} prq={profile.prq} onEnd={handleEnd} {...(gameProps ?? {})} />
          </ReplayInPlaceContext.Provider>
        ) : !unreachable ? (
          <div className="flex h-[60vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
          </div>
        ) : null}

        {/* END SCREEN (owner, 2026-10-06): the sequenced, console-style finish — components/games/end-screen. The card reads
            exactly what this shell holds; what counts as a win stays decided above (cardWon / cardHeadline). Slots for the
            lanes building on it: extraActions (multiplayer) and sideCards (knowledge-feed). */}
        <AnimatePresence>
          {result && (
            <EndScreen
              key={runSeq.current}
              mode={mode}
              title={title}
              run={result}
              headline={cardHeadline}
              won={cardWon}
              proofLine={proofLine}
              arenaRefused={arenaRefused}
              arenaVerdict={arenaVerdict}
              staked={Boolean(arenaMatchId)}
              recap={recap}
              coins={recapCoins}
              storyNodeId={storyNodeId}
              storyReward={storyReward}
              storyRefused={storyRefused}
              mpResult={mpResult}
              challengeResult={challengeResult}
              arenaResult={arenaResult}
              carnivalRun={carnivalFlag ? carnivalRun : null}
              signatureRun={Boolean(signatureFlag)}
              share={{ state: shareState, url: shareUrl, onChallenge: () => void shareChallenge(), onProof: shareProof }}
              onReplay={replay}
              onNavigate={(href) => router.push(href)}
            />
          )}
        </AnimatePresence>
      </div>

      {profile && scheme && !result && !babylonOwnsInput && !streamOn && <VirtualController scheme={scheme} />}
    </div>
  );
}
