/**
 * Signed-URL gate. The client names a catalog file id. The storage path is
 * taken from the catalog, never from the request, and the signer is called
 * only after an entitlement (or a sample flag) says yes.
 *
 * Two doors, never mixed (owner 2026-10-13, store-terms-2026-10-12: audiobooks, stream only, no download):
 *   - issueBookStream: an audiobook chapter (mp3). Always signed `inline`, with a short lifetime and no filename.
 *     This is the only door that is open under the current terms.
 *   - issueBookDownload: an ebook file (EPUB/PDF), signed as an `attachment`. Refused unless the store terms cover
 *     ebooks AND downloads (lib/books/bookTerms.ts), which no terms version does yet, so it signs nothing today.
 * The terms are checked first in both: a file the current terms do not cover is never signed, owner or not.
 */

import { fileNeedsFormat, getBookFile, type BookFile } from './bookCatalog';
import { hasBookAccess, type OwnedOffer } from './bookEntitlements';
import { bookFileKindAllowed, currentBookPolicy, type BookTermsPolicy } from './bookTerms';

export const DEFAULT_SIGNED_URL_TTL_SECONDS = 600;
/** A stream URL lives this long at most: the player asks for a fresh one on the next play (and on a playback error). */
export const STREAM_URL_TTL_SECONDS = 300;

export interface SignRequest {
  storagePath: string;
  ttlSeconds: number;
  contentType: string;
  disposition: 'inline' | 'attachment';
  downloadName: string;
}

export type SignBookFile = (request: SignRequest) => Promise<string>;

export type DeliveryResult =
  | { ok: true; url: string; expiresIn: number; file: BookFile }
  | { ok: false; status: 403 | 404; error: string };

/** Why an ebook file / a download is refused. The shop sells stream-only audiobooks until EBOOK-1 terms exist. */
export const FORMAT_NOT_OFFERED_ERROR = 'This format is not available. Audiobooks are stream only.';

const DOWNLOAD_CONTENT: Record<'pdf' | 'epub', { contentType: string; ext: string }> = {
  pdf: { contentType: 'application/pdf', ext: 'pdf' },
  epub: { contentType: 'application/epub+zip', ext: 'epub' },
};

interface DeliveryInput { bookSlug: string; fileId: string; entitlements: readonly OwnedOffer[] }
interface DeliveryDeps { sign: SignBookFile; ttlSeconds?: number; policy?: BookTermsPolicy }

function lookup(input: DeliveryInput): BookFile | null {
  const file = getBookFile(input.bookSlug, input.fileId);
  if (!file || !file.storagePath.startsWith('books/') || file.storagePath.includes('..')) return null;
  return file;
}

/** Stream one audiobook chapter: an owner, or the catalog's free sample. Always `inline`, never a download. */
export async function issueBookStream(input: DeliveryInput, deps: DeliveryDeps): Promise<DeliveryResult> {
  const file = lookup(input);
  if (!file || file.kind !== 'mp3') return { ok: false, status: 404, error: 'Unknown file.' };
  if (!bookFileKindAllowed('mp3', deps.policy ?? currentBookPolicy())) {
    return { ok: false, status: 403, error: FORMAT_NOT_OFFERED_ERROR };
  }
  if (!file.sample && !hasBookAccess(input.entitlements, input.bookSlug, 'audiobook')) {
    return { ok: false, status: 403, error: 'You do not own this file.' };
  }
  const ttlSeconds = Math.min(deps.ttlSeconds ?? STREAM_URL_TTL_SECONDS, STREAM_URL_TTL_SECONDS);
  const url = await deps.sign({
    storagePath: file.storagePath,
    ttlSeconds,
    contentType: 'audio/mpeg',
    disposition: 'inline',
    downloadName: `${input.bookSlug}-${file.id}.mp3`,
  });
  return { ok: true, url, expiresIn: ttlSeconds, file };
}

/** Download one ebook file (EPUB/PDF). Closed today: no terms version covers ebooks and downloads. */
export async function issueBookDownload(input: DeliveryInput, deps: DeliveryDeps): Promise<DeliveryResult> {
  const file = lookup(input);
  if (!file || file.kind === 'mp3') return { ok: false, status: 404, error: 'Unknown file.' };
  if (!bookFileKindAllowed(file.kind, deps.policy ?? currentBookPolicy())) {
    return { ok: false, status: 403, error: FORMAT_NOT_OFFERED_ERROR };
  }
  if (!file.sample && !hasBookAccess(input.entitlements, input.bookSlug, fileNeedsFormat(file.kind))) {
    return { ok: false, status: 403, error: 'You do not own this file.' };
  }
  const spec = DOWNLOAD_CONTENT[file.kind];
  const ttlSeconds = deps.ttlSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS;
  const url = await deps.sign({
    storagePath: file.storagePath,
    ttlSeconds,
    contentType: spec.contentType,
    disposition: 'attachment',
    downloadName: `${input.bookSlug}-${file.id}.${spec.ext}`,
  });
  return { ok: true, url, expiresIn: ttlSeconds, file };
}
