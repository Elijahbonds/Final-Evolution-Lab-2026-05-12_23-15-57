'use client';

// Dance mode — choreography builder. The player assembles a routine from the
// clip library, places each step on a beat, and can MIRROR any step (resolves to
// the '<clip>.M' variant at playback via mirrored-clips.ts). A live 3D preview
// needs a GPU/character host, so authoring here is data-only; the routine is
// replayed in-game (e.g. as a dunk celebration) by ChoreographyEngine.

import React, { useMemo, useState } from 'react';
import { DANCE_LIBRARY } from '@/lib/modes/dance/choreography-engine';
import type { DanceStep } from '@/lib/creator/creative-card-types';

export interface DancePublishPayload {
  kind: 'dance';
  choreographyId: string;
  sequence: DanceStep[];
  bpm: number;
}

const MIN_STEPS = 3; // acceptance: a routine is >= 3 clips incl one mirrored // TUNE(elijah)

export default function DanceMode({ onPublish }: { onPublish: (p: DancePublishPayload) => void }) {
  const [bpm, setBpm] = useState(96); // TUNE(elijah)
  const [seq, setSeq] = useState<DanceStep[]>([]);

  const nextBeat = useMemo(() => {
    if (!seq.length) return 0;
    const last = seq[seq.length - 1];
    const clip = DANCE_LIBRARY.find((c) => c.id === last.clipId);
    return last.beat + (clip?.beats ?? 4);
  }, [seq]);

  const addClip = (clipId: string) => {
    setSeq((s) => [...s, { clipId, beat: nextBeat, holdBeats: DANCE_LIBRARY.find((c) => c.id === clipId)?.beats ?? 4, mirrored: false }]);
  };
  const toggleMirror = (i: number) => setSeq((s) => s.map((st, j) => (j === i ? { ...st, mirrored: !st.mirrored } : st)));
  const remove = (i: number) => setSeq((s) => s.filter((_, j) => j !== i));

  const hasMirror = seq.some((s) => s.mirrored);
  const canPublish = seq.length >= MIN_STEPS && hasMirror;

  const publish = () => {
    if (!canPublish) return;
    onPublish({ kind: 'dance', choreographyId: `chor_${Date.now()}`, sequence: seq, bpm });
  };

  return (
    <div className="min-h-screen bg-neutral-950 p-5 text-neutral-100">
      <h2 className="mb-1 text-2xl font-black">Choreograph a Routine</h2>
      <p className="mb-4 text-sm text-neutral-400">
        Add at least {MIN_STEPS} steps and mirror at least one. Mirrored steps flip left/right automatically.
      </p>

      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm text-neutral-400">BPM</label>
        <input type="range" min={60} max={140} value={bpm} onChange={(e) => setBpm(+e.target.value)} className="w-48" />
        <span className="w-10 text-sm font-bold">{bpm}</span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DANCE_LIBRARY.map((c) => (
          <button key={c.id} onClick={() => addClip(c.id)}
            className="rounded-xl bg-fuchsia-600/20 p-3 text-left text-sm font-semibold text-fuchsia-200 transition hover:bg-fuchsia-600/40">
            {c.name}
            <span className="mt-1 block text-[11px] font-normal text-neutral-400">{c.beats} beats · lvl {c.difficulty}</span>
          </button>
        ))}
      </div>

      <div className="mb-5 rounded-2xl bg-neutral-900 p-4">
        <div className="mb-2 text-sm font-bold text-neutral-300">Routine ({seq.length})</div>
        {seq.length === 0 ? (
          <p className="text-sm text-neutral-500">No steps yet — tap clips above to build your routine.</p>
        ) : (
          <ol className="space-y-2">
            {seq.map((s, i) => {
              const clip = DANCE_LIBRARY.find((c) => c.id === s.clipId);
              return (
                <li key={i} className="flex items-center gap-3 rounded-lg bg-neutral-800 px-3 py-2 text-sm">
                  <span className="w-8 text-neutral-500">#{i + 1}</span>
                  <span className="flex-1 font-semibold">{clip?.name ?? s.clipId}</span>
                  <span className="text-neutral-500">beat {s.beat}</span>
                  <button onClick={() => toggleMirror(i)}
                    className={`rounded px-2 py-1 text-xs font-bold ${s.mirrored ? 'bg-cyan-500 text-black' : 'bg-neutral-700 text-neutral-300'}`}>
                    {s.mirrored ? 'MIRRORED' : 'mirror'}
                  </button>
                  <button onClick={() => remove(i)} className="rounded px-2 py-1 text-xs font-bold text-red-400 hover:bg-red-500/20">✕</button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {!hasMirror && seq.length >= MIN_STEPS && (
        <p className="mb-3 text-sm text-amber-400">Mirror at least one step to publish.</p>
      )}
      <button onClick={publish} disabled={!canPublish}
        className="rounded-xl bg-fuchsia-500 px-6 py-3 font-bold text-black transition disabled:cursor-not-allowed disabled:opacity-40">
        Publish Routine
      </button>
    </div>
  );
}
