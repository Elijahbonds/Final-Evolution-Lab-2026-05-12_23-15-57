/**
 * What the shop may sell and deliver, in ONE place: a rule keyed to the store terms version.
 *
 * Owner decision 2026-10-13: the shop matches the terms the buyer ticks. `store-terms-2026-10-12` (LEGAL-COPY-2)
 * covers AUDIOBOOKS ONLY: 18+, stream only, no download, 14-day refund. It does not cover ebooks or the bundle (the
 * approved "block C" is held for EBOOK-1). So until a terms version that covers them exists:
 *   - only the audiobook format is offered, in the UI and by the API (checkout, signed URLs, fulfilment);
 *   - nothing is delivered as a download (no EPUB/PDF, no attachment disposition, no audiobook download).
 *
 * FAIL CLOSED: a terms version that is not listed below offers nothing and delivers nothing. So the day
 * STORE_TERMS_VERSION moves, the shop shuts until someone reads the new text and adds its row here, which is the
 * point: the allow-list is the owner's statement of what each text covers.
 *
 * TO SWITCH EBOOKS ON LATER (EBOOK-1): publish the terms version that covers them, then add that version's row with
 * `formats: ['audiobook', 'ebook', 'bundle']` and `downloads: true`. Nothing else in the shop changes: every surface
 * asks this file. (BOOK_STORE_ENABLED, VIRTUAL_PURCHASES_ENABLED and the age / terms gates are separate and untouched.)
 *
 * Pure and client-safe: no prisma, no next/*, no process.env.
 */

import { STORE_TERMS_VERSION } from '@/lib/store-terms';
import type { BookFormat } from './bookCatalog';

export interface BookTermsPolicy {
  /** The terms version this row was written against. */
  termsVersion: string;
  /** Formats the terms cover. Anything else is hidden and refused. */
  formats: readonly BookFormat[];
  /**
   * May a file be handed out as a download (an attachment, or a file kept offline)? False means stream only: the
   * signed URL is `inline`, carries no filename, and ebook files (which are downloads by nature) are never signed.
   */
  downloads: boolean;
}

/** The allow-list: terms version -> what that text covers. Add a row only after reading the text. */
export const BOOK_TERMS_POLICIES: Readonly<Record<string, Omit<BookTermsPolicy, 'termsVersion'>>> = {
  // §1, §2.7, §4.6: audiobooks, stream only, no download. Ebooks and the bundle are NOT in this text (EBOOK-1).
  'store-terms-2026-10-12': { formats: ['audiobook'], downloads: false },
};

/** The policy for a terms version. An unlisted version gets the closed policy: no formats, no downloads. */
export function bookPolicyFor(termsVersion: string): BookTermsPolicy {
  const row = Object.prototype.hasOwnProperty.call(BOOK_TERMS_POLICIES, termsVersion)
    ? BOOK_TERMS_POLICIES[termsVersion]
    : undefined;
  return row
    ? { termsVersion, formats: row.formats, downloads: row.downloads }
    : { termsVersion, formats: [], downloads: false };
}

/** The policy in force: the one for the live STORE_TERMS_VERSION. */
export function currentBookPolicy(): BookTermsPolicy {
  return bookPolicyFor(STORE_TERMS_VERSION);
}

/** Do the current terms cover this format? */
export function bookFormatAllowed(format: string, policy: BookTermsPolicy = currentBookPolicy()): boolean {
  return (policy.formats as readonly string[]).includes(format);
}

/** May any file be delivered as a download under these terms? */
export function bookDownloadsAllowed(policy: BookTermsPolicy = currentBookPolicy()): boolean {
  return policy.downloads;
}

/**
 * May this offer be shown and sold? The catalog's own `directSale` (KDP Select) AND the terms. Both must say yes.
 */
export function bookOfferAllowed(
  offer: { format: string; directSale: boolean },
  policy: BookTermsPolicy = currentBookPolicy(),
): boolean {
  return offer.directSale && bookFormatAllowed(offer.format, policy);
}

/**
 * May this kind of file be delivered at all? An mp3 is the audiobook and is streamed (inline); an EPUB or PDF is an
 * ebook download. The ebook kinds need the ebook format AND downloads, so they stay refused until EBOOK-1.
 */
export function bookFileKindAllowed(kind: 'epub' | 'pdf' | 'mp3', policy: BookTermsPolicy = currentBookPolicy()): boolean {
  if (kind === 'mp3') return bookFormatAllowed('audiobook', policy);
  return bookFormatAllowed('ebook', policy) && policy.downloads;
}
