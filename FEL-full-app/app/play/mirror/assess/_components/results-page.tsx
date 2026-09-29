'use client';

// The results address's client half: read this tab's result once, after mount (the server has none to render), then
// show the cards, or the "not saved" card. No request, no write: "Done, clear my results" only removes. The tab's
// age answer decides the links (lib/screen/age.ts): the stricter of the tab's lock and the result's own gate record.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { strictestAge, type AgeBand } from '@/lib/screen/age';
import { clearScreen, localForClear, readAge, recall, tabStorage } from '@/lib/screen/store';
import { ASSESS_PATH, SCREEN_HOME } from '@/lib/screen/routes';
import type { ScreenSummary } from '@/lib/screen/checks';
import { ResultsView } from './results-view';
import { NotSavedCard } from './not-saved';
import { ScreenFrame, StepCard } from './screen-ui';

export function ResultsPage() {
  const router = useRouter();
  const [state, setState] = useState<{ summary: ScreenSummary; age: AgeBand | null } | 'none' | 'reading'>('reading');
  useEffect(() => {
    const tab = tabStorage();
    const r = recall(tab);
    setState(r ? { summary: r.summary, age: strictestAge(readAge(tab), r.gate.ageBand) } : 'none');
  }, []);
  const clear = () => {
    clearScreen(tabStorage(), localForClear());
    router.replace(ASSESS_PATH);
  };
  return (
    <ScreenFrame back={SCREEN_HOME}>
      {state === 'reading' ? <StepCard testId="reading"><p className="text-white/60">Reading your results…</p></StepCard> : null}
      {state === 'none' ? <NotSavedCard /> : null}
      {typeof state === 'object' ? <ResultsView summary={state.summary} age={state.age} onClear={clear} /> : null}
    </ScreenFrame>
  );
}
