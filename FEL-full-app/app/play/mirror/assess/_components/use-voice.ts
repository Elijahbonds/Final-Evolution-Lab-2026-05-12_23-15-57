'use client';

// One spoken line at a time (the runner already rate-limits them), with an off switch that is remembered on this device.
// Every spoken line is also a caption on screen, so the switch never hides an instruction (spec §8 accessibility).
import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'fel.assess.voice';

export function useVoice() {
  const [on, setOnState] = useState(true);
  const onRef = useRef(true);
  useEffect(() => {
    try { if (localStorage.getItem(KEY) === 'off') { setOnState(false); onRef.current = false; } } catch { /* no storage: voice stays on */ }
    return () => { try { window.speechSynthesis?.cancel(); } catch { /* nothing speaking */ } };
  }, []);
  const setOn = useCallback((v: boolean) => {
    setOnState(v);
    onRef.current = v;
    try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* not remembered */ }
    if (!v) { try { window.speechSynthesis?.cancel(); } catch { /* nothing speaking */ } }
  }, []);
  const speak = useCallback((text: string) => {
    if (!onRef.current || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02;
      window.speechSynthesis.speak(u);
    } catch { /* speech unavailable: the caption still shows it */ }
  }, []);
  return { on, setOn, speak };
}
