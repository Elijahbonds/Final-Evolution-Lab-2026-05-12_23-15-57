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
// arenaSet) plus the shell's grade/prq/onEnd. What stands in:
//   * spendShards always says yes (no wallet on this server) and logs what it was asked for, so a probe can count spends;
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
  /** Every spend StudioMode asked this route to approve. */
  spends: { cost: number; reason: string }[];
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

  // No wallet here: every spend is approved, and written down so a probe can count what the room tried to charge.
  const spendShards = useCallback(async (cost: number, reason: string): Promise<boolean> => {
    window.__FEL_STUDIO__?.spends.push({ cost, reason });
    console.info(`[dev-music] spend approved (dev): ${reason} · ${cost}`);
    return true;
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
        DEV · real StudioMode (no GameShell) · ?stage= {asked || '…'}{arenaSet ? ' · ARENA SET' : ''} · shards approved
      </p>
      <div className="relative min-h-[80vh]">
        {arenaSet
          ? <StudioMode key={`a${remounts}`} grade={prqGrade(72)} prq={72} onEnd={onEnd} spendShards={spendShards} arenaSet />
          : <StudioMode key={`f${remounts}`} grade={prqGrade(72)} prq={72} onEnd={onEnd} spendShards={spendShards} />}
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
