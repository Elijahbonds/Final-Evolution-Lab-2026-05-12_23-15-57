'use client';

// Dev-only host for the real Groove Academy (MUSIC-SUITE P1, 2026-09-25).
//
// Exists for the same reason /dev/brainbrawl and /dev/threepoint do: /play/music is auth-gated and a lane's dev server
// runs with its database deliberately offline, so the shipped route cannot be opened there — and the Academy is not a
// Babylon ModeDefinition, so the generic /dev/mode runner cannot mount it either. Before this route the Academy had NO
// auth-free way in at all, which is why nothing in it had ever been measured in a browser (the P1 baseline probe,
// scripts/probes/_music-baseline.mts, is its first user).
//
// What is real: StudioMode itself, unchanged, with the props app/play/music/_components/loader.tsx passes (spendShards,
// readOwnedKits, arenaSet) plus the shell's grade/prq/onEnd. What stands in:
//   * spendShards says yes (no wallet on this server) and logs what it was asked for, so a probe can count spends.
//     MUSIC-SUITE P2 (2026-09-25): it answers the typed result the real loader does, and ?shop=<status>|offline makes
//     every spend answer that HTTP status (read through the real purchases.ts spendResultFromStatus) or no answer at all,
//     so each failure's words can be seen in a browser: ?shop=401 'Sign in to unlock', ?shop=409 'Not enough Shards',
//     ?shop=500 or ?shop=offline "Couldn't reach the shop — if it went through, you won't be charged twice" (P2 fix pass);
//   * readOwnedKits stands in for GET /api/music/unlock: the kits named in ?owned=neon,dust plus every kit this page
//     load approved (so a REPLAY remount keeps a kit bought before it). ?shop=offline fails the read too (the cache stands);
//   * GameShell's end card is a small card with REPLAY that REMOUNTS the room — exactly what the shell's REPLAY does
//     (game-shell.tsx bumps gameKey), so "does my beat survive a PERFORM card" can be driven here;
//   * ?stage=studio|perform is read by StudioMode itself (musicStage.ts readMusicStage, `?stage=` wins over the saved
//     pick) — this route only shows which one the URL asked for; ?arena=1 makes the run a staked 32-bar set.
//
// THE DEV HOOK (window.__FEL_STUDIO__). The engine keeps its track list private and StudioMode keeps it in React state,
// so "which tracks are AUDIBLE but not DRAWN" (the hidden-rows finding) had no reader. This route wraps three
// AudioEngine prototype methods — setState (the list the scheduler reads), scheduleStep (the hits it actually starts)
// and dispose (to forget a closed engine) — and publishes what they see. It changes nothing the engine does; it only
// watches. Dev route only: the wrap runs when this module loads, and this module is only in /dev/music's bundle.

import { useCallback, useEffect, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { prqGrade } from '@/lib/prq';
import type { GameResult } from '@/components/games/game-shell';
import { AudioEngine, type SequencerState } from '@/lib/babylon/music/AudioEngine';
import { isMusicStageId } from '@/lib/babylon/music/musicStage';
import {
  SPEND_REFUSED, SPEND_UNREACHABLE, isKitId, kitForSku, kitSkuId, skuForSpend, spendResultFromStatus,
  type ReadOwnedKits, type ShardSpend,
} from '@/lib/babylon/music/purchases';

const StudioMode = dynamicImport(() => import('@/lib/babylon/music/StudioMode'), { ssr: false });

export interface StudioProbe {
  /** The track list the scheduler reads right now, as it reads it (null before the room mounts an engine). */
  engine(): {
    running: boolean; bpm: number; swing: number; steps: number;
    tracks: { sampleId: string; hits: number; muted: boolean; loaded: boolean }[];
  } | null;
  /** Hits the scheduler actually started since the last reset(), by sampleId (muted, empty and unloaded rows excluded). */
  audible: Record<string, number>;
  /** The last 64 scheduled steps on the audio clock — for the live swing / bar-length check. */
  steps: { step: number; time: number }[];
  /** The engine's audio clock (seconds), to line a tap up with a scheduled note. */
  now(): number | null;
  /** Every spend StudioMode asked this route to approve (MUSIC-SUITE P2: only a confirmed one reaches here). */
  spends: { cost: number; reason: string; nonce?: string }[];
  /** How many times the room read the account's kits (the stand-in for GET /api/music/unlock). */
  ownedReads: number;
  /** The last result StudioMode reported to the (stand-in) shell. */
  ended: GameResult | null;
  reset(): void;
}

declare global { interface Window { __FEL_STUDIO__?: StudioProbe } }

type EngineGuts = {
  ctx: AudioContext;
  state: SequencerState;
  samples: Map<string, unknown>;
  timerId: number | null;
  setState(s: SequencerState): void;
  scheduleStep(step: number, time: number): void;
  dispose(): void;
};

function installStudioProbe(): void {
  if (typeof window === 'undefined') return;
  const proto = AudioEngine.prototype as unknown as EngineGuts & { __felStudioProbe?: boolean };
  if (proto.__felStudioProbe) return;   // HMR re-evaluates this module; wrap once
  proto.__felStudioProbe = true;
  let live: EngineGuts | null = null;
  const probe: StudioProbe = {
    engine: () => {
      if (!live) return null;
      const s = live.state;
      return {
        running: live.timerId !== null, bpm: s.bpm, swing: s.swing, steps: s.steps,
        tracks: s.tracks.map((t) => ({
          sampleId: t.sampleId, hits: t.pattern.filter(Boolean).length, muted: t.muted, loaded: live!.samples.has(t.sampleId),
        })),
      };
    },
    now: () => (live ? live.ctx.currentTime : null),
    audible: {},
    steps: [],
    spends: [],
    ownedReads: 0,
    ended: null,
    reset() { probe.audible = {}; probe.steps = []; },
  };
  // A remount (REPLAY) builds a new engine on a new AudioContext whose clock starts at 0: steps timed on the old clock
  // would read as far in the future, so a new engine starts the record clean.
  const adopt = (e: EngineGuts) => { if (live !== e) { live = e; probe.reset(); } };
  const origSet = proto.setState;
  proto.setState = function (this: EngineGuts, s: SequencerState) { adopt(this); return origSet.call(this, s); };
  const origStep = proto.scheduleStep;
  proto.scheduleStep = function (this: EngineGuts, step: number, time: number) {
    adopt(this);
    for (const t of this.state.tracks) {
      if (t.muted || !t.pattern[step] || !this.samples.has(t.sampleId)) continue;   // the same skips scheduleStep makes
      probe.audible[t.sampleId] = (probe.audible[t.sampleId] ?? 0) + 1;
    }
    probe.steps.push({ step, time });
    if (probe.steps.length > 64) probe.steps.shift();
    return origStep.call(this, step, time);
  };
  const origDispose = proto.dispose;
  proto.dispose = function (this: EngineGuts) { if (live === this) live = null; return origDispose.call(this); };
  window.__FEL_STUDIO__ = probe;
}
installStudioProbe();

/** The kit SKUs this page load approved: the dev account's purchases, so a remount (REPLAY) still owns them. */
const DEV_BOUGHT = new Set<string>();

export function DevMusicLoader() {
  const [ended, setEnded] = useState<GameResult | null>(null);
  const [remounts, setRemounts] = useState(0);
  const [asked, setAsked] = useState<string>('');
  const [arenaSet, setArenaSet] = useState(false);
  // Read on the client only: the query is not known to the server render, and a mismatch would warn on hydration.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get('stage');
    setAsked(isMusicStageId(s) ? s : s ? `${s} (not a stage: the saved pick or STUDIO)` : 'none (the saved pick or STUDIO)');
    setArenaSet(Boolean(q.get('arena')));
  }, []);

  // No wallet here: every spend is approved (unless ?shop= says otherwise), and written down so a probe can count what
  // the room tried to charge. The SKU is resolved the way the real loader resolves it, so an unknown spend is refused.
  const spendShards = useCallback<ShardSpend>(async (cost, reason, opts) => {
    window.__FEL_STUDIO__?.spends.push({ cost, reason, ...(opts?.nonce ? { nonce: opts.nonce } : {}) });
    const shop = new URLSearchParams(window.location.search).get('shop');
    if (shop === 'offline') return SPEND_UNREACHABLE;
    if (shop && /^\d{3}$/.test(shop)) return spendResultFromStatus(Number(shop), null);
    const sku = skuForSpend(reason);
    if (!sku) return SPEND_REFUSED;
    if (kitForSku(sku)) DEV_BOUGHT.add(sku);
    console.info(`[dev-music] spend approved (dev): ${reason} · ${cost}`);
    return { ok: true };
  }, []);
  const readOwnedKits = useCallback<ReadOwnedKits>(async () => {
    if (window.__FEL_STUDIO__) window.__FEL_STUDIO__.ownedReads += 1;
    const q = new URLSearchParams(window.location.search);
    if (q.get('shop') === 'offline') return { ok: false, reason: 'unreachable' };
    const named = (q.get('owned') ?? '').split(',').filter(isKitId).map(kitSkuId);
    return { ok: true, owned: [...new Set([...named, ...DEV_BOUGHT])] };
  }, []);
  const onEnd = useCallback((r: GameResult) => {
    console.log('[dev-music] ended', JSON.stringify(r));
    if (window.__FEL_STUDIO__) window.__FEL_STUDIO__.ended = r;
    setEnded(r);
  }, []);
  // GameShell's REPLAY remounts the Game (a new gameKey); the Academy registers no replay-in-place, so neither does this.
  const replay = () => { setEnded(null); setRemounts((k) => k + 1); };

  return (
    // No padding of its own: the grid's cell size is measured here (the phone-cell finding), so the only insets are
    // StudioMode's own — the best case for the real route, which can only add a shell around it.
    <div className="min-h-screen bg-[#07090d]">
      <p className="px-2 py-1 font-mono text-[10px] text-white/40">
        DEV · real StudioMode (no GameShell) · ?stage= {asked || '…'}{arenaSet ? ' · ARENA SET' : ''} · shards approved (?shop= to fail them)
      </p>
      <div className="relative min-h-[80vh]">
        {arenaSet
          ? <StudioMode key={`a${remounts}`} grade={prqGrade(72)} prq={72} onEnd={onEnd} spendShards={spendShards} readOwnedKits={readOwnedKits} arenaSet />
          : <StudioMode key={`f${remounts}`} grade={prqGrade(72)} prq={72} onEnd={onEnd} spendShards={spendShards} readOwnedKits={readOwnedKits} />}
        {ended && (
          <div data-dev="end-card" className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 font-mono">
            <div className="rounded-xl border border-white/20 bg-[#0b0d14] px-6 py-4 text-center text-white">
              <div className="text-lg font-black">{ended.headline} · {ended.score}</div>
              <div className="mt-1 text-xs text-white/60">{ended.outcome ?? ''} · won {String(ended.won)}</div>
              <button data-dev="replay" onClick={replay} className="mt-3 rounded-md border border-[#00E5FF]/60 px-4 py-2 text-sm text-[#00E5FF]">REPLAY</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
