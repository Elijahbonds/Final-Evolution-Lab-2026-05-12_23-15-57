'use client';
// PUBLIC-POLISH (2026-11-02): who is looking, from the session context the root layout already provides.
//
// 'unknown' is a render with no SessionProvider above it (tests, renderToStaticMarkup): callers treat it as they treated
// a visitor before this hook existed, so nothing that rendered without a provider changes. 'loading' is the provider's
// first fetch; callers that act on the answer (the adventure stages' closet read) wait it out, and callers that only
// show a hint show nothing yet, so a signed-in player never sees a sign-in hint flash past.
import { useContext } from 'react';
import { SessionContext } from 'next-auth/react';

export type VisitorKind = 'unknown' | 'loading' | 'guest' | 'signed-in';

export function visitorKindFrom(status: string | undefined | null): VisitorKind {
  if (!status) return 'unknown';
  if (status === 'loading') return 'loading';
  return status === 'authenticated' ? 'signed-in' : 'guest';
}

export function useVisitorKind(): VisitorKind {
  // the context, not useSession(): useSession throws with no provider, and these render in provider-less tests
  return visitorKindFrom(useContext(SessionContext)?.status);
}
