'use client';

// Music mode — Build (16-step grid) + Perform (rhythm layer over your own beat).
// modeRef keeps the perform-scoring closure fresh; expected-note expiry keeps
// the scoring array bounded (un-hit notes expire as misses after 250 ms).

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AudioEngine, type SequencerState, type TrackState } from '@/lib/modes/music/audio-engine';

export interface MusicPublishPayload {
  kind: 'music';
  bpm: number;
  swing: number;
  stemBlobs: Blob[];
  pattern: { sampleId: string; pattern: boolean[] }[];
  performScore: number;
}

const STEPS = 16;
const DEFAULT_KIT = [
  { id: 'kick', name: 'Kick', url: '/audio/kits/808/kick.wav', cat: 'kick' },
  { id: 'snare', name: 'Snare', url: '/audio/kits/808/snare.wav', cat: 'snare' },
  { id: 'hat', name: 'Hat', url: '/audio/kits/808/hat.wav', cat: 'hat' },
  { id: 'open', name: 'Open', url: '/audio/kits/808/openhat.wav', cat: 'hat' },
  { id: 'clap', name: 'Clap', url: '/audio/kits/808/clap.wav', cat: 'perc' },
  { id: 'bass', name: 'Bass', url: '/audio/kits/808/bass.wav', cat: 'bass' },
  { id: 'lead', name: 'Lead', url: '/audio/kits/808/lead.wav', cat: 'melody' },
  { id: 'fx', name: 'FX', url: '/audio/kits/808/fx.wav', cat: 'fx' },
] as const;

function emptyTracks(): TrackState[] {
  return DEFAULT_KIT.map((k) => ({
    sampleId: k.id, pattern: new Array<boolean>(STEPS).fill(false),
    volume: 0.8, muted: false, pan: 0,
  }));
}

type Mode = 'build' | 'perform';
const EXPIRE_S = 0.25;

export default function MusicMode({ onPublish }: { onPublish: (payload: MusicPublishPayload) => void }) {
  const engineRef = useRef<AudioEngine | null>(null);
  const modeRef = useRef<Mode>('build');                // closure-safe mode
  const expectedRef = useRef<{ step: number; time: number }[]>([]);
  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<Mode>('build');
  const [playhead, setPlayhead] = useState(-1);
  const [bpm, setBpm] = useState(92);
  const [swing, setSwing] = useState(0.15);
  const [tracks, setTracks] = useState<TrackState[]>(emptyTracks());
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [judgement, setJudgement] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    const eng = new AudioEngine({ bpm, steps: STEPS, tracks, swing });
    engineRef.current = eng;
    void (async () => {
      try {
        await Promise.all(DEFAULT_KIT.map((k) => eng.loadSample(k.id, k.name, k.url, k.cat)));
        setReady(true);
      } catch (e) {
        console.error('[FEL-MUSIC] kit load failed', e);
        setLoadErr(true);
      }
    })();
    eng.onStep = (s) => setPlayhead(s);
    eng.onStepAudible = (s, t) => {
      if (modeRef.current !== 'perform') return;
      const exp = expectedRef.current;
      exp.push({ step: s, time: t });
      const cutoff = eng.context.currentTime - EXPIRE_S;
      while (exp.length && exp[0].time < cutoff) {
        exp.shift();
        setCombo(0);
        setJudgement('MISS');
      }
    };
    return () => eng.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setState({ bpm, steps: STEPS, tracks, swing });
  }, [bpm, tracks, swing]);

  const toggleCell = (ti: number, si: number) =>
    setTracks((prev) => prev.map((t, i) =>
      i !== ti ? t : { ...t, pattern: t.pattern.map((v, j) => (j === si ? !v : v)) }));

  const togglePlay = () => {
    const eng = engineRef.current!;
    if (playing) { eng.stop(); setPlaying(false); setPlayhead(-1); expectedRef.current = []; }
    else { eng.start(); setPlaying(true); }
  };

  const handleTap = useCallback(() => {
    const eng = engineRef.current;
    if (!eng || modeRef.current !== 'perform') return;
    const now = eng.context.currentTime;
    const exp = expectedRef.current;
    let bestIdx = -1, bestDelta = Infinity;
    for (let i = 0; i < exp.length; i++) {
      const d = Math.abs(exp[i].time - now);
      if (d < bestDelta) { bestDelta = d; bestIdx = i; }
    }
    if (bestIdx === -1 || bestDelta > 0.2) { setCombo(0); setJudgement('MISS'); return; }
    exp.splice(bestIdx, 1);
    const [pts, label] =
      bestDelta <= 0.035 ? [300, 'PERFECT'] :
      bestDelta <= 0.075 ? [200, 'GREAT'] :
      bestDelta <= 0.12 ? [100, 'GOOD'] : [50, 'LATE'];
    setCombo((c) => { const nc = c + 1; setScore((s) => s + (pts as number) + nc * 2); return nc; });
    setJudgement(label as string);
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); handleTap(); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [handleTap]);

  const publish = async () => {
    const eng = engineRef.current!;
    setBusy(true);
    try {
      const stems = await eng.renderStems(2);
      onPublish({
        kind: 'music', bpm, swing, stemBlobs: stems,
        pattern: tracks.map((t) => ({ sampleId: t.sampleId, pattern: t.pattern })),
        performScore: score,
      });
    } finally {
      setBusy(false);
    }
  };

  if (loadErr) return (
    <div className="p-8 text-center text-neutral-300">
      Couldn&apos;t load the drum kit. Refresh to try again.
    </div>
  );
  if (!ready) return <div className="p-8 text-center text-neutral-300">Loading kit…</div>;

  return (
    <div className="min-h-screen select-none bg-neutral-950 p-4 text-neutral-100">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button onClick={togglePlay} className="rounded-lg bg-emerald-500 px-5 py-2 font-bold text-black">
          {playing ? 'Stop' : 'Play'}
        </button>
        <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-400">
          BPM
          <input type="range" min={60} max={180} value={bpm} onChange={(e) => setBpm(+e.target.value)} />
          <span className="w-10 tabular-nums text-neutral-100">{bpm}</span>
        </label>
        <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-400">
          Swing
          <input type="range" min={0} max={100} value={swing * 100} onChange={(e) => setSwing(+e.target.value / 100)} />
        </label>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setMode('build')}
            className={`rounded-lg px-4 py-2 ${mode === 'build' ? 'bg-neutral-100 text-black' : 'bg-neutral-800'}`}>Build</button>
          <button onClick={() => { setMode('perform'); setScore(0); setCombo(0); expectedRef.current = []; }}
            className={`rounded-lg px-4 py-2 ${mode === 'perform' ? 'bg-neutral-100 text-black' : 'bg-neutral-800'}`}>Perform</button>
        </div>
      </div>

      <div className="space-y-1">
        {tracks.map((t, ti) => (
          <div key={t.sampleId} className="flex items-center gap-1">
            <button
              onClick={() => setTracks((p) => p.map((x, i) => (i === ti ? { ...x, muted: !x.muted } : x)))}
              className={`w-16 shrink-0 rounded py-2 text-xs ${t.muted ? 'bg-neutral-800 text-neutral-500' : 'bg-neutral-700'}`}>
              {DEFAULT_KIT[ti].name}
            </button>
            <div className="flex flex-1 gap-1">
              {t.pattern.map((on, si) => (
                <button key={si} onClick={() => toggleCell(ti, si)}
                  className={[
                    'h-9 flex-1 rounded transition-colors',
                    on ? 'bg-emerald-400' : si % 4 === 0 ? 'bg-neutral-700' : 'bg-neutral-800',
                    playhead === si ? 'ring-2 ring-white' : '',
                  ].join(' ')} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {mode === 'perform' && (
        <div className="mt-6 text-center" onPointerDown={handleTap}>
          <div className="text-5xl font-black tabular-nums">{score}</div>
          <div className="h-6 font-bold text-emerald-400">{judgement}</div>
          <div className="text-sm text-neutral-400">Combo ×{combo}</div>
          <button className="mt-4 w-full rounded-2xl bg-neutral-800 py-10 text-lg font-bold active:bg-emerald-500 active:text-black">
            TAP ON BEAT (or Space)
          </button>
        </div>
      )}

      <button onClick={publish} disabled={busy}
        className="mt-6 w-full rounded-lg bg-amber-400 py-3 font-bold text-black disabled:opacity-40">
        {busy ? 'Rendering stems…' : 'Publish as Creator Card'}
      </button>
    </div>
  );
}
