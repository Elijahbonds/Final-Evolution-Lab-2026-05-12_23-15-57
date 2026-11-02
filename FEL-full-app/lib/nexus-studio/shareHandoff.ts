// NEX-06: the same-tab hand-off from a share link's landing to the mode. Pure constants and one reader, so the landing (a client
// component) and the runtime share them without the landing importing node's crypto (share.ts).

import { sanitizeVenueExport, type StudioVenueExport } from './exportVenue';
import { publicView } from './published';

/** sessionStorage key prefix: `fel.nexusStudio.share.<link id>` holds the venue the landing handed over. */
export const SHARE_HANDOFF_PREFIX = 'fel.nexusStudio.share.';
const ID = /^ssl_[A-Za-z0-9_-]{16}$/;

/** The handed-over venue for `?share=<id>`, read as untrusted (sanitised, no cast), or null. */
export function readShareHandoff(id: string | null | undefined, store: Pick<Storage, 'getItem'> | null): StudioVenueExport | null {
  if (!id || !ID.test(id) || !store) return null;
  try {
    const raw = store.getItem(SHARE_HANDOFF_PREFIX + id);
    if (!raw) return null;
    const exp = sanitizeVenueExport(JSON.parse(raw));
    return exp ? publicView(exp) : null;
  } catch {
    return null;
  }
}

/** Where a hand-off opens: the mode's own SHIPPED page with the hand-off key (the live tiebreak is Tennis's variant). share.ts's
 *  shareRoute is this; the Studio's production Play-test (STUDIO-EASY) uses it too. */
export function modeRoute(mode: string, key: string): string | null {
  const k = encodeURIComponent(key);
  switch (mode) {
    case 'tiebreak': return `/play/tennis?variant=tiebreak&share=${k}`;
    case 'football': return `/play/football?share=${k}`;
    case 'volleyball': return `/play/volleyball?share=${k}`;
    case 'derby': return `/play/derby?share=${k}`;
    default: return null;
  }
}

/**
 * STUDIO-EASY (coordinator decision 4, 2026-10-28): Play-test in a production build, on the shipped engine only. The editor hands
 * its venue over exactly as a share link's landing does — this tab's sessionStorage, read back by runtime.ts through
 * readShareHandoff (sanitised, no cast) — and opens the mode's own page with `?share=<key>`, so GameShell runs it as PRACTICE
 * (playtest: unpaid, unranked, never competitive). Nothing leaves the device. A fresh key per press, in the share id's shape.
 */
export function playtestKey(rand: () => number = Math.random): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let k = 'ssl_';
  for (let i = 0; i < 16; i++) k += A[Math.floor(rand() * A.length) % A.length];
  return k;
}

/** Hand `exp` over under `key` in `store`; false when the store refuses (private mode, quota). */
export function handOff(store: Pick<Storage, 'setItem'> | null, key: string, exp: StudioVenueExport): boolean {
  if (!store || !ID.test(key)) return false;
  try { store.setItem(SHARE_HANDOFF_PREFIX + key, JSON.stringify(exp)); return true; } catch { return false; }
}
