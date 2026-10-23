'use client';

import { useCallback, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { InputBus, ModePhase } from '@/lib/babylon';

type BootRetryOptions = {
  busRef: MutableRefObject<InputBus | null>;
  endedRef?: MutableRefObject<boolean>;
  setPhase: Dispatch<SetStateAction<ModePhase>>;
  setLoadError?: Dispatch<SetStateAction<string | null>>;
  setCountdown?: Dispatch<SetStateAction<number | null>>;
  reset?: () => void;
};

export function useBabylonBootRetry(opts: BootRetryOptions): { bootAttempt: number; retryBoot: () => void } {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const [bootAttempt, setBootAttempt] = useState(0);

  const retryBoot = useCallback(() => {
    const current = optsRef.current;
    if (current.endedRef) current.endedRef.current = false;
    current.busRef.current = null;
    current.setLoadError?.(null);
    current.setCountdown?.(null);
    current.setPhase('loading');
    current.reset?.();
    setBootAttempt((n) => n + 1);
  }, []);

  return { bootAttempt, retryBoot };
}
