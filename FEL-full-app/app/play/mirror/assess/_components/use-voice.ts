'use client';

// One spoken line at a time (the runner already rate-limits them), with an off switch. Every spoken line is also a
// caption on screen, so the switch never hides an instruction (spec §8 accessibility).
//
// SCREEN-SHIP: the switch is held in this page's memory only. PR #20 remembered it in localStorage; the Quick Screen
// writes nothing to localStorage for anyone (A4-6), and nothing at all before the age answer (gate 5).
import { useCallback, useEffect, useRef, useState } from 'react';
import { speakNatural } from '@/lib/babylon/audio/voice/speakNatural';

export function useVoice() {
  const [on, setOnState] = useState(true);
  const onRef = useRef(true);
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch { /* nothing speaking */ } }, []);
  const setOn = useCallback((v: boolean) => {
    setOnState(v);
    onRef.current = v;
    if (!v) { try { window.speechSynthesis?.cancel(); } catch { /* nothing speaking */ } }
  }, []);
  const speak = useCallback((text: string) => {
    if (!onRef.current || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    // VOICEOVER (2026-10-06): the device's least robotic voice (was the engine's default), a rendered take where one exists
    try { speakNatural(text, { source: 'assess', rate: 1.02 }); } catch { /* speech unavailable: the caption still shows it */ }
  }, []);
  return { on, setOn, speak };
}
