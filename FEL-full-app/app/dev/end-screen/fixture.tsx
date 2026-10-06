'use client';

// Sample runs for the end screen (dev only). Each case is data shaped exactly like GameShell's state after the servers
// answer; the recap lands after a short delay so the "Tallying rewards…" beat and the reveal both show, as in a real run.

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { EndScreen } from '@/components/games/end-screen/end-screen';
import { applyRun, memoryStore, EMPTY_RECORDS } from '@/components/games/end-screen/records';
import type { EndScreenProps } from '@/components/games/end-screen/types';

type Case = Omit<EndScreenProps, 'share' | 'onReplay' | 'onNavigate' | 'store' | 'title'> & { title?: string; seedBest?: number };

const paid = { xp: 140, shards: 3, credits: 35, prqDelta: 0.8, prqAfter: 63.4, grade: { label: 'Elite', color: '#00E5FF' }, streakDays: 4, streakBonus: 20 };
const season = { name: 'Season 1 · Boardwalk', gained: 420, tier: 6, into: 610, need: 858, hasPro: false, tierUps: [] };

const CASES: Record<string, Case> = {
  win: {
    mode: 'threePoint', run: { score: 21, won: true, duration: 60, opponentScore: 17, stats: { points: 21 } },
    headline: 'BUCKETS', won: true, proofLine: '21 PTS DOWNTOWN vs 17 · WON', arenaRefused: false, arenaVerdict: null,
    recap: { ...paid, season }, coins: { coins: 60, capped: false },
    storyNodeId: null, storyReward: null, storyRefused: null, mpResult: null, challengeResult: null, arenaResult: null, carnivalRun: null,
  },
  record: {
    mode: 'dance', run: { score: 48_250, won: true, duration: 120, stats: { accuracy: 93, stars: 4, maxCombo: 88 } },
    headline: 'GREAT', won: true, proofLine: '48250 PTS · ★★★★ · 93% · GRADE A · ×88 COMBO', arenaRefused: false, arenaVerdict: null,
    recap: { ...paid, xp: 210, season: { ...season, gained: 300, tier: 7, into: 52, need: 926, tierUps: [{ tier: 7, rewards: { free: [{ kind: 'cosmetic', rarity: 'common' }], pro: [] } }] } },
    coins: { coins: 90, capped: false }, seedBest: 41_900,
    storyNodeId: null, storyReward: null, storyRefused: null, mpResult: null, challengeResult: null, arenaResult: null, carnivalRun: null,
  },
  levelup: {
    mode: 'freerun', run: { score: 3_820, won: true, duration: 75, stats: { grade: 5, timeSec: 61.2, place: 1 } },
    headline: '1ST · 61.2s · GRADE S', won: true, proofLine: '3820 PTS · 61.2s · 14 TRICK', arenaRefused: false, arenaVerdict: null,
    recap: { ...paid, season: { ...season, gained: 1500, tier: 9, into: 140, need: 1062, tierUps: [{ tier: 8, rewards: { free: [], pro: [] } }, { tier: 9, rewards: { free: [{ kind: 'cosmetic', rarity: 'common' }], pro: [] } }] },
      mastery: { mode: 'freerun', tier: 'Gold', tierIndex: 3, ups: [{ tier: 'Gold' }] } },
    coins: { coins: 75, capped: false },
    storyNodeId: null, storyReward: null, storyRefused: null, mpResult: null, challengeResult: null, arenaResult: null, carnivalRun: null,
  },
  loss: {
    mode: 'hoops1v1', run: { score: 8, won: false, duration: 300, opponentScore: 11, stats: { foeScore: 11 } },
    headline: 'GAME OVER', won: false, proofLine: '8–11 · LOST', arenaRefused: false, arenaVerdict: null,
    recap: { ...paid, xp: 60, shards: 1, credits: 0, prqDelta: -0.2, streakBonus: 0, season: { ...season, gained: 84, into: 274 } },
    coins: { coins: 40, capped: true }, seedBest: 11,
    storyNodeId: null, storyReward: null, storyRefused: null, mpResult: null, challengeResult: null, arenaResult: null, carnivalRun: null,
  },
  refused: {
    mode: 'dunkContest', run: { score: 128, won: true, duration: 90, opponentScore: 0, stats: { makes: 4, misses: 1 } },
    headline: 'SCORE NOT ACCEPTED', won: false, proofLine: null, arenaRefused: true, arenaVerdict: null, staked: true,
    recap: { ...paid, capMessage: 'Daily reward cap reached for this mode — XP still counts.' }, coins: null,
    storyNodeId: null, storyReward: null, storyRefused: null, mpResult: null, challengeResult: null, carnivalRun: null,
    arenaResult: { settled: false, status: 'REFUSED', myScore: 128, refused: { error: 'SCORE_CARD_MISMATCH', line: "Score 128 is not the dunk card's total (25) — nothing was settled." } },
  },
  unpaid: {
    mode: 'golf', run: { score: 310, won: false, duration: 200, stats: { strokes: 14, holes: 3 } },
    headline: 'SESSION COMPLETE', won: false, proofLine: '14 STROKES · 3 HOLES', arenaRefused: false, arenaVerdict: null,
    recap: { xp: 0, shards: 0, credits: 0, prqDelta: 0, prqAfter: 0, unpaid: 'PLAYTEST' }, coins: null,
    storyNodeId: null, storyReward: null, storyRefused: null, mpResult: null, challengeResult: null, arenaResult: null, carnivalRun: null,
  },
  noplay: {
    mode: 'soccer', run: { score: 0, won: false, duration: 60 },
    headline: 'SESSION COMPLETE', won: false, proofLine: '0 PTS · LOST', arenaRefused: false, arenaVerdict: null,
    recap: { xp: 0, shards: 0, credits: 0, prqDelta: 0, prqAfter: 0, noPlay: true }, coins: null,
    storyNodeId: null, storyReward: null, storyRefused: null, mpResult: null, challengeResult: null, arenaResult: null, carnivalRun: null,
  },
  pending: {
    mode: 'tennis', run: { score: 6, won: true, duration: 240, opponentScore: 3 },
    headline: 'MATCH WON · 6 GAMES', won: true, proofLine: '6–3 · WON', arenaRefused: false, arenaVerdict: null,
    recap: null, coins: null,
    storyNodeId: null, storyReward: null, storyRefused: null, mpResult: null, challengeResult: null, arenaResult: null, carnivalRun: null,
  },
  carnival: {
    mode: 'soccer', run: { score: 400, won: true, duration: 60 },
    headline: 'VICTORY', won: true, proofLine: '400 PTS · WON', arenaRefused: false, arenaVerdict: null,
    recap: { ...paid, season }, coins: { coins: 40, capped: false },
    carnivalRun: { lineup: ['carnival', 'soccer', 'golf'], index: 2, results: [{ stop: 'carnival', score: 220, won: true }, { stop: 'soccer', score: 400, won: true }] } as never,
    storyNodeId: null, storyReward: null, storyRefused: null, mpResult: null, challengeResult: null, arenaResult: null,
  },
  story: {
    mode: 'golf', run: { score: 340, won: true, duration: 200, stats: { strokes: 11, holes: 3 } },
    headline: 'VICTORY', won: true, proofLine: '11 STROKES · 3 HOLES', arenaRefused: false, arenaVerdict: null,
    recap: { ...paid, season }, coins: { coins: 50, capped: false },
    storyNodeId: 'golfGreen.r1', storyReward: { rewardLC: 75, badge: null }, storyRefused: null,
    mpResult: null, challengeResult: null, arenaResult: null, carnivalRun: null,
  },
};

export function EndScreenFixture({ name }: { name: string }) {
  const c = CASES[name] ?? CASES.win;
  const [open, setOpen] = useState(true);
  const [runN, setRunN] = useState(0);   // keyed by run, as GameShell keys the card (runSeq)
  const [landed, setLanded] = useState(false);
  const [log, setLog] = useState<string>('');
  const store = useMemo(() => memoryStore(c.seedBest !== undefined
    ? applyRun(EMPTY_RECORDS, { mode: c.mode, score: c.seedBest, won: false, accepted: true, nowMs: Date.now() - 86_400_000 }).next
    : EMPTY_RECORDS), [c]);
  useEffect(() => { const t = setTimeout(() => setLanded(true), 450); return () => clearTimeout(t); }, [open]);

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#050505]">
      {/* stand-in for the live 3D scene under the card */}
      <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(80% 60% at 30% 70%, #1d4d6b 0%, transparent 60%), radial-gradient(70% 50% at 75% 30%, #6b3d1d 0%, transparent 60%), linear-gradient(180deg, #0d1622 0%, #18222c 55%, #2a2016 100%)' }} />
      <div aria-hidden className="absolute bottom-[18%] left-[12%] h-[38%] w-[10%] rounded-t-full bg-black/40 blur-[2px]" />
      <div aria-hidden className="absolute bottom-[18%] right-[20%] h-[30%] w-[8%] rounded-t-full bg-black/35 blur-[2px]" />
      <div className="absolute left-3 top-3 z-[60] flex flex-wrap gap-2 font-mono text-xs text-white/70">
        {Object.keys(CASES).map((k) => <a key={k} href={`/dev/end-screen?case=${k}`} className={`rounded border px-2 py-1 ${k === name ? 'border-[#00E5FF] text-[#00E5FF]' : 'border-white/20'}`}>{k}</a>)}
        {log && <span data-fixture-log className="rounded bg-black/60 px-2 py-1">{log}</span>}
      </div>
      <AnimatePresence>
        {open && (
          <EndScreen
            key={runN}
            {...c}
            title={c.title ?? 'Fixture'}
            recap={landed ? c.recap : null}
            coins={landed ? c.coins : null}
            storyReward={landed ? c.storyReward : null}
            arenaResult={landed ? c.arenaResult : null}
            store={store}
            share={{ state: 'idle', url: null, onChallenge: () => setLog('challenge minted'), onProof: () => setLog('proof shared') }}
            onReplay={() => { setLog('PLAY AGAIN'); setOpen(false); setLanded(false); setRunN((n) => n + 1); setTimeout(() => setOpen(true), 1200); }}
            onNavigate={(href) => setLog(`navigate → ${href}`)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
