'use client';

// The results address's client half: read this tab's result once, after mount (the server has none to render), then
// show the cards, or the "not saved" card. No request, no write: "Done, clear my results" only removes.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { screenNextRoute } from '@/lib/screen/config';
import { clearScreen, localForClear, recall, tabStorage } from '@/lib/screen/store';
import type { ScreenSummary } from '@/lib/screen/checks';
import { ResultsView } from './results-view';
import { NotSavedCard } from './not-saved';
import { ScreenFrame, StepCard } from './screen-ui';

export function ResultsPage() {
  const router = useRouter();
  const [state, setState] = useState<{ summary: ScreenSummary } | 'none' | 'reading'>('reading');
  useEffect(() => {
    const r = recall(tabStorage());
    setState(r ? { summary: r.summary } : 'none');
  }, []);
  const clear = () => {
    clearScreen(tabStorage(), localForClear());
    router.replace('/play/mirror/assess');
  };
  return (
    <ScreenFrame>
      {state === 'reading' ? <StepCard testId="reading"><p className="text-white/60">Reading your results…</p></StepCard> : null}
      {state === 'none' ? <NotSavedCard /> : null}
      {typeof state === 'object' ? (
        <ResultsView summary={state.summary} nextRoute={screenNextRoute(process.env.NEXT_PUBLIC_SCREEN_NEXT_ROUTE)} onClear={clear} />
      ) : null}
    </ScreenFrame>
  );
}
