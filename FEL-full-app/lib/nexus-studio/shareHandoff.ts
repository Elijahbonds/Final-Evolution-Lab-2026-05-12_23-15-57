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
