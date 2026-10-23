'use client';
// COUCH (FN-0, 2026-10-19): the "Couch (2–4)" start on a mode's /play page, and the room it opens.
//
// The /play page stays behind its sign-in gate; the signed-in visitor is the HOST, and the couch room is that same page
// with ?couch=1 — so the host's session is the one the page already checked, and nobody else signs in. The room is the
// TV stage (HostStage) in couch mode: seats by pad and phone code (lib/party/seats.ts), no camera, no party chat or voice.
//
// This file stays light: every /play page imports it, so the stage (and Babylon with it) is loaded only once the couch
// is actually opened.

import { useSyncExternalStore } from 'react';
import dynamicImport from 'next/dynamic';
import { Loader2, Users } from 'lucide-react';
import { sessionStore } from '@/lib/babylon/core/sessionStore';
import { couchHref, couchModeById } from '@/lib/party/catalog';

/** The start's words: what a family reads on the READY card. */
export const COUCH_START_LABEL = 'Couch (2–4)';

const CouchStage = dynamicImport(() => import('./host-stage').then((m) => m.HostStage), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-screen place-items-center bg-[#05070c]"><Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" /></div>
  ),
});

/** The couch room for one mode: the host stage, couch on. */
export function CouchRoom({ modeId }: { modeId: string }) {
  const m = couchModeById(modeId);
  if (!m) return null;
  return <CouchStage modeId={m.id} couch exitHref={m.href} />;
}

/**
 * Shown while the solo game waits on its start card (or its end card): one tap opens the couch room. A plain link, not a
 * client navigation: the page reloads, so a camera the solo game's body play had open does not carry into the couch.
 */
export function CouchStart({ modeId }: { modeId: string }) {
  const phase = useSyncExternalStore(sessionStore.subscribe, () => sessionStore.view().phase, () => null);
  const m = couchModeById(modeId);
  if (!m || (phase !== 'ready' && phase !== 'ended')) return null;
  return (
    <a
      href={couchHref(m)}
      data-testid="couch-start"
      className="fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-40 flex items-center gap-1.5 rounded-full border border-[#00E5FF]/50 bg-black/70 px-3 py-1.5 font-mono text-xs font-bold text-[#00E5FF] backdrop-blur hover:bg-[#00E5FF]/15"
    >
      <Users className="h-4 w-4" />
      {COUCH_START_LABEL}
    </a>
  );
}
