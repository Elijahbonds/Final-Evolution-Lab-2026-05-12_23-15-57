import { useCallback, useEffect, useState } from 'react';
import { fetchAiAvailability, type AiAvailability, type AiFeature } from '@/lib/abacus/aiStatus';

export type AiStatusState = 'loading' | AiAvailability;

/**
 * ABACUS-KILL: asks /api/ai/status once on mount. It says 'loading' until the answer comes back, and the Coach and
 * Studio send nothing to an AI route unless it says 'available'. markComingSoon() is for a 503 coming_soon from an
 * AI route (the switch went off after the page loaded).
 */
export function useAiStatus(feature: AiFeature): [AiStatusState, () => void] {
  const [state, setState] = useState<AiStatusState>('loading');
  useEffect(() => {
    let live = true;
    fetchAiAvailability(feature).then((a) => {
      if (live) setState(a);
    });
    return () => {
      live = false;
    };
  }, [feature]);
  const markComingSoon = useCallback(() => setState('coming_soon'), []);
  return [state, markComingSoon];
}
