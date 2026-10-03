'use client';

import { useEffect } from 'react';
import { CrashScreen, GENERIC_CRASH_COPY, reportCrash } from '@/components/reliability/global-error-boundary';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[FEL-BOUNDARY] app segment crash:', error);
    reportCrash(error, 'boundary');
  }, [error]);

  return <CrashScreen onRetry={reset} copy={GENERIC_CRASH_COPY} />;
}
