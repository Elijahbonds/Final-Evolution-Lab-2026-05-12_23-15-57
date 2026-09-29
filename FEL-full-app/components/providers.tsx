'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { SessionContext, SessionProvider } from 'next-auth/react';
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

/**
 * THE QUICK SCREEN SENDS NOTHING BEFORE THE AGE QUESTION (SCREEN-SHIP, Squad gate 5, 2026-09-29).
 *
 * next-auth's SessionProvider fetches /api/auth/session as it mounts and then writes `nextauth.message` to
 * localStorage (its cross-tab broadcast), on every page. The Quick Screen's pages (/screen, /screen/**,
 * /play/mirror/assess/**) must make no /api request and write no storage before the athlete says how old they are,
 * and they never use the session (nothing is saved to an account in this ship). So on exactly those paths the app gets
 * a fixed signed-out session from the context itself: no fetch, no broadcast, no storage. The rail and the tab bar
 * render nothing when signed out, as they already do for a guest. Every other path keeps the same SessionProvider,
 * unchanged; moving between the two remounts the provider, so the first page after the screen fetches its session
 * as any page load does. (components/providers.test.tsx pins both.)
 */
export const isQuickScreenPath = (p: string): boolean => /^\/(screen|play\/mirror\/assess)(\/|$)/.test(p);

const SIGNED_OUT = { data: null, status: 'unauthenticated' as const, update: async () => null };

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  if (isQuickScreenPath(pathname)) {
    return (
      <SessionContext.Provider value={SIGNED_OUT}>
        <AgentFlag />
        {children}
      </SessionContext.Provider>
    );
  }
  return (
    <SessionProvider>
      <AgentFlag />
      {children}
    </SessionProvider>
  );
}
