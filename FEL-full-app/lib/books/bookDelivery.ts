/**
 * Signed-URL gate. The client names a catalog file id. The storage path is
 * taken from the catalog, never from the request, and the signer is called
 * only after an entitlement (or a sample flag) says yes.
 *
 * The store terms decide first (lib/books/bookTerms.ts, owner 2026-10-13): under `store-terms-2026-10-12` only the
 * audiobook is covered and it is stream only, so an EPUB or PDF is refused even to an owner or a sample, fail closed,
 * and an mp3 is always signed `inline` (the streaming disposition, no filename). Nothing here hands out a download.
 */

import { fileNeedsFormat, getBookFile, type BookFile } from './bookCatalog';
import { hasBookAccess, type OwnedOffer } from './bookEntitlements';
import { bookFileKindAllowed, currentBookPolicy, type BookTermsPolicy } from './bookTerms';

export const DEFAULT_SIGNED_URL_TTL_SECONDS = 600;

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

/** Why an ebook file is refused. The shop sells stream-only audiobooks until EBOOK-1 terms exist. */
export const FORMAT_NOT_OFFERED_ERROR = 'This format is not available. Audiobooks are stream only.';

const CONTENT: Record<BookFile['kind'], { contentType: string; disposition: 'inline' | 'attachment'; ext: string }> = {
  mp3: { contentType: 'audio/mpeg', disposition: 'inline', ext: 'mp3' },
  pdf: { contentType: 'application/pdf', disposition: 'attachment', ext: 'pdf' },
  epub: { contentType: 'application/epub+zip', disposition: 'attachment', ext: 'epub' },
};

export async function issueBookFile(
  input: { bookSlug: string; fileId: string; entitlements: readonly OwnedOffer[] },
  deps: { sign: SignBookFile; ttlSeconds?: number; policy?: BookTermsPolicy },
): Promise<DeliveryResult> {
  const file = getBookFile(input.bookSlug, input.fileId);
  if (!file || !file.storagePath.startsWith('books/') || file.storagePath.includes('..')) {
    return { ok: false, status: 404, error: 'Unknown file.' };
  }
  // The terms come first: a file kind the current terms do not cover is never signed, owner or not, sample or not.
  if (!bookFileKindAllowed(file.kind, deps.policy ?? currentBookPolicy())) {
    return { ok: false, status: 403, error: FORMAT_NOT_OFFERED_ERROR };
  }
  if (!file.sample && !hasBookAccess(input.entitlements, input.bookSlug, fileNeedsFormat(file.kind))) {
    return { ok: false, status: 403, error: 'You do not own this file.' };
  }

  const spec = CONTENT[file.kind];
  const ttlSeconds = deps.ttlSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS;
  const url = await deps.sign({
    storagePath: file.storagePath,
    ttlSeconds,
    contentType: spec.contentType,
    disposition: spec.disposition,
    downloadName: `${input.bookSlug}-${file.id}.${spec.ext}`,
  });
  return { ok: true, url, expiresIn: ttlSeconds, file };
}
