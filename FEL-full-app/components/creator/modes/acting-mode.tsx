'use client';

// Acting mode — AUDIO ONLY (compliance: no camera/video capture). The player
// picks a scene prompt, records a voice line, previews it, and publishes. Cards
// with recorded audio enter pending_review before they can be listed publicly.

import React, { useRef, useState } from 'react';
import { VoiceCapture, SCENE_PROMPTS, type ScenePrompt } from '@/lib/modes/acting/voice-capture';

export interface ActingPublishPayload {
  kind: 'acting';
  sceneId: string;
  slot: string;
  audioBlob: Blob;
}

type Phase = 'idle' | 'recording' | 'recorded';

export default function ActingMode({ onPublish }: { onPublish: (p: ActingPublishPayload) => void }) {
  const [scene, setScene] = useState<ScenePrompt>(SCENE_PROMPTS[0]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const capRef = useRef<VoiceCapture | null>(null);

  const start = async () => {
    setErr(null);
    try {
      const cap = new VoiceCapture();
      capRef.current = cap;
      await cap.start();
      setPhase('recording');
    } catch (e) {
      setErr('Microphone unavailable. Check permissions and try again.');
      setPhase('idle');
    }
  };

  const stop = async () => {
    const cap = capRef.current;
    if (!cap) return;
    const b = await cap.stop();
    setBlob(b);
    setUrl(URL.createObjectURL(b));
    setPhase('recorded');
  };

  const reset = () => { setBlob(null); setUrl(null); setPhase('idle'); };

  const publish = () => {
    if (!blob) return;
    onPublish({ kind: 'acting', sceneId: scene.id, slot: scene.slot, audioBlob: blob });
  };

  return (
    <div className="min-h-screen bg-neutral-950 p-5 text-neutral-100">
      <h2 className="mb-1 text-2xl font-black">Record a Line</h2>
      <p className="mb-4 text-sm text-neutral-400">Audio only. Your line plays in-game at the moment below. Submissions are reviewed before going public.</p>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SCENE_PROMPTS.map((s) => (
          <button key={s.id} onClick={() => setScene(s)} disabled={phase === 'recording'}
            className={`rounded-xl p-3 text-left text-sm transition ${scene.id === s.id ? 'bg-amber-500 text-black' : 'bg-neutral-900 text-neutral-200 hover:bg-neutral-800'}`}>
            <span className="font-bold">{s.line}</span>
            <span className="mt-1 block text-[11px] opacity-70">plays: {s.slot}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 rounded-2xl bg-neutral-900 p-5 text-center">
        <p className="mb-3 text-lg font-bold">“{scene.line}”</p>
        {phase === 'idle' && (
          <button onClick={start} className="rounded-full bg-red-500 px-8 py-3 font-bold text-white">● Record</button>
        )}
        {phase === 'recording' && (
          <button onClick={stop} className="animate-pulse rounded-full bg-red-600 px-8 py-3 font-bold text-white">■ Stop</button>
        )}
        {phase === 'recorded' && url && (
          <div className="space-y-3">
            <audio src={url} controls className="mx-auto" />
            <div className="flex justify-center gap-3">
              <button onClick={reset} className="rounded-xl bg-neutral-700 px-4 py-2 text-sm font-bold">Re-record</button>
              <button onClick={publish} className="rounded-xl bg-amber-500 px-6 py-2 text-sm font-bold text-black">Publish for Review</button>
            </div>
          </div>
        )}
        {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
      </div>
    </div>
  );
}
