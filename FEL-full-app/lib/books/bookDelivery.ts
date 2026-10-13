/**
 * Signed-URL gate. The client names a catalog file id. The storage path is
 * taken from the catalog, never from the request, and the signer is called
 * only after an entitlement (or a sample flag) says yes.
 */

import { fileNeedsFormat, getBookFile, type BookFile } from './bookCatalog';
import { hasBookAccess, type OwnedOffer } from './bookEntitlements';

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

const CONTENT: Record<BookFile['kind'], { contentType: string; disposition: 'inline' | 'attachment'; ext: string }> = {
  mp3: { contentType: 'audio/mpeg', disposition: 'inline', ext: 'mp3' },
  pdf: { contentType: 'application/pdf', disposition: 'attachment', ext: 'pdf' },
  epub: { contentType: 'application/epub+zip', disposition: 'attachment', ext: 'epub' },
};

export async function issueBookFile(
  input: { bookSlug: string; fileId: string; entitlements: readonly OwnedOffer[] },
  deps: { sign: SignBookFile; ttlSeconds?: number },
): Promise<DeliveryResult> {
  const file = getBookFile(input.bookSlug, input.fileId);
  if (!file || !file.storagePath.startsWith('books/') || file.storagePath.includes('..')) {
    return { ok: false, status: 404, error: 'Unknown file.' };
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
