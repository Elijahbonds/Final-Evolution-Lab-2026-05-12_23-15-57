'use client';

// useOneVoice — a camera tool's voice: one line at a time, each heard in full (TOOLS-EASY, 2026-10-28). The queue is
// lib/tools-easy/voiceQueue.ts; the voice is the app's own (speakNatural: a recorded Coach take where the bank has the
// line, else the device's least robotic voice). Every line is also on screen, so a phone on mute loses nothing.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { VoiceQueue } from '@/lib/tools-easy/voiceQueue';

export function useOneVoice(source: string) {
  const q = useRef<VoiceQueue | null>(null);
  const get = useCallback((): VoiceQueue => {
    if (!q.current) {
      q.current = new VoiceQueue({
        speak: (text, onend) => {
          if (typeof window === 'undefined') { onend(); return; }
          void import('@/lib/babylon/audio/voice/speakNatural')
            .then(({ speakNatural }) => speakNatural(text, { source, rate: 1.02, onend }))
            .catch(() => onend());
        },
        cancel: () => {
          void import('@/lib/babylon/audio/voice/speakNatural').then(({ cancelNatural }) => cancelNatural()).catch(() => {});
        },
      }, { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) });
    }
    return q.current;
  }, [source]);
  useEffect(() => () => { q.current?.stop(); }, []);
  const say = useCallback((text: string) => get().say(text), [get]);
  const stop = useCallback(() => q.current?.stop(), []);
  const hush = useCallback(() => q.current?.hush(), []);
  return useMemo(() => ({ say, stop, hush }), [say, stop, hush]);
}
