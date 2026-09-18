'use client';

import { useEffect } from 'react';
import { SessionProvider } from 'next-auth/react';
import { agentEnabled } from '@/lib/babylon/core/AgentBridge';

/**
 * QA SESSIONS SURVIVE A NAVIGATION (2026-09-15).
 *
 * `?agent=1` arms the QA instrumentation (QaTrace, the agent bridge) and `agentEnabled()` remembers it in
 * sessionStorage — but only when it is CALLED while the flag is in the URL. Two routes strip the query before any mode
 * mounts: /try lands on a clean path and the carnival rewrites to `?carnival=1`, so those two ran uninstrumented and
 * the scorecard scored both "no presses at all" on Controls and Feel. Reading it once at the app root, on the first
 * client render of whatever page was opened, is what makes the flag stick for the session.
 *
 * It only ever READS the URL: with no `?agent=1`, nothing is stored and nothing is instrumented.
 */
function AgentFlag() {
  useEffect(() => { agentEnabled(); }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AgentFlag />
      {children}
    </SessionProvider>
  );
}
