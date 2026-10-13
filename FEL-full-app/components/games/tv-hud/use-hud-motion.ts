'use client';

// The HUD's reduced-motion answer: the app's one source (lib/a11y/reducedMotion — the OS setting, overridable either
// way by the player's own choice), live, so flipping it in settings calms the very next banner.
import { useEffect, useState } from 'react';
import { onMotionChange, reducedMotion } from '@/lib/a11y/reducedMotion';

export function useHudReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => reducedMotion());
  useEffect(() => {
    const sync = () => setReduced(reducedMotion());
    sync();
    return onMotionChange(sync);
  }, []);
  return reduced;
}
