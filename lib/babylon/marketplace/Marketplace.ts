// Marketplace — books, audiobooks, art & music as Shards-priced listings
// (M60, Phase 9). Same honest storage pattern as StudioLibrary (M57):
// localStorage today, marked SYNC SEAMs where the real backend goes.
// Ties into contracts that already exist:
//   - Creator Cards (M28): a listing can reference the seller's card
//   - Shards economy: purchases spend Shards via the injected seam
//   - All-Access (this batch): pass holders pay a lower seller fee
//
// THE KDP TRUTH (why "export package", not "publish button"): Amazon KDP
// has NO public self-publishing API — every KDP book is uploaded through
// the KDP web dashboard by the account owner. So the correct design (not a
// compromise) is: FEL sells the work in-app for Shards, and EXPORTS a
// clean, KDP-ready manuscript package the creator uploads to their own
// KDP account for Amazon distribution. Double publishing, honestly built.

import { marketFeePct, type PassState } from '../shared/allAccessPass';

export type ListingKind = 'book' | 'audiobook' | 'art' | 'music';

export interface BookChapter { title: string; text: string }
export interface ListingPayload {
  /** book: real chapters. audiobook: audio data URL. art: image data URL.
   *  music: a Studio track id (played via StudioLibrary). */
  chapters?: BookChapter[];
  audioDataUrl?: string;
  imageDataUrl?: string;
  studioTrackId?: string;
}

export interface MarketListing {
  id: string;
  kind: ListingKind;
  title: string;
  blurb: string;
  sellerId: string;
  sellerName: string;
  sellerHasPass: boolean;
  creatorCardId: string | null;      // optional link to the seller's Creator Card (M28)
  priceShards: number;
  payload: ListingPayload;
  createdAt: number;
  sales: number;
}

export interface PurchaseReceipt {
  listingId: string;
  at: number;
  paidShards: number;
  sellerNetShards: number;           // after the marketplace fee
}

const KEY_LISTINGS = 'fel_market_listings_v1';
const KEY_PURCHASES = 'fel_market_purchases_v1';

function readListings(): MarketListing[] {
  try { return JSON.parse(localStorage.getItem(KEY_LISTINGS) ?? '[]') as MarketListing[]; }
  catch { return []; }
}
function writeListings(all: MarketListing[]): void {
  localStorage.setItem(KEY_LISTINGS, JSON.stringify(all.slice(0, 60)));
}
function readPurchases(): PurchaseReceipt[] {
  try { return JSON.parse(localStorage.getItem(KEY_PURCHASES) ?? '[]') as PurchaseReceipt[]; }
  catch { return []; }
}

export const Marketplace = {
  publish(l: Omit<MarketListing, 'id' | 'createdAt' | 'sales'>): MarketListing {
    const full: MarketListing = { ...l, id: `lst_${Date.now()}_${Math.floor(Math.random() * 1e5)}`, createdAt: Date.now(), sales: 0 };
    writeListings([full, ...readListings()]);
    // SYNC SEAM: POST /api/market/listings — server stores payload blobs in
    // object storage and returns the canonical record. UGC review: book/
    // audiobook/art payloads should enter the same pending_review flow
    // CreatorCardTypes already defines for music/acting.
    return full;
  },

  list(kind?: ListingKind): MarketListing[] {
    const all = readListings();
    return kind ? all.filter((l) => l.kind === kind) : all;
  },
  bySeller(sellerId: string): MarketListing[] {
    return readListings().filter((l) => l.sellerId === sellerId);
  },
  get(id: string): MarketListing | null {
    return readListings().find((l) => l.id === id) ?? null;
  },
  remove(id: string, sellerId: string): void {
    writeListings(readListings().filter((l) => !(l.id === id && l.sellerId === sellerId)));
  },

  /** Buy with Shards. `spendShards` is the economy seam (same contract the
   *  Studio uses). Fee: 10% standard, 5% for All-Access sellers. */
  async buy(
    id: string,
    spendShards: (cost: number, reason: string) => Promise<boolean>,
    sellerPass: PassState | null,
  ): Promise<PurchaseReceipt | null> {
    const l = this.get(id);
    if (!l) return null;
    const ok = await spendShards(l.priceShards, `market buy ${l.kind} "${l.title}"`);
    if (!ok) return null;
    const fee = Math.ceil(l.priceShards * marketFeePct(sellerPass) / 100);
    const receipt: PurchaseReceipt = {
      listingId: id, at: Date.now(), paidShards: l.priceShards, sellerNetShards: l.priceShards - fee,
    };
    const purchases = readPurchases();
    purchases.push(receipt);
    localStorage.setItem(KEY_PURCHASES, JSON.stringify(purchases));
    const all = readListings();
    const rec = all.find((x) => x.id === id);
    if (rec) { rec.sales++; writeListings(all); }
    // SYNC SEAM: POST /api/market/buy — server debits buyer, credits seller
    // net of fee, records the receipt atomically.
    return receipt;
  },

  myPurchases(): PurchaseReceipt[] { return readPurchases(); },
  owned(id: string): boolean { return readPurchases().some((p) => p.listingId === id); },
};

/** KDP EXPORT — build the upload-ready manuscript package for a book
 *  listing: a clean full manuscript plus a checklist of exactly what the
 *  KDP dashboard will ask for. Returns files as name→Blob for download. */
export function exportForKdp(l: MarketListing): Map<string, Blob> | null {
  if (l.kind !== 'book' || !l.payload.chapters?.length) return null;
  const out = new Map<string, Blob>();
  const manuscript = [
    l.title, '', `by ${l.sellerName}`, '', '— — —', '',
    ...l.payload.chapters.flatMap((c, i) => [`CHAPTER ${i + 1}: ${c.title}`, '', c.text, '', '']),
  ].join('\n');
  out.set(`${l.title.replace(/[^\w ]+/g, '').trim() || 'manuscript'}.txt`, new Blob([manuscript], { type: 'text/plain' }));
  const checklist = [
    `KDP UPLOAD CHECKLIST — "${l.title}"`, '',
    'Amazon KDP has no public API; you upload this yourself at kdp.amazon.com:',
    '1. Sign in to YOUR KDP account (kdp.amazon.com) → Create → eBook.',
    `2. Title: ${l.title} · Author: ${l.sellerName}.`,
    `3. Description: ${l.blurb}`,
    '4. Upload the manuscript .txt (or paste into your formatter of choice;',
    '   Kindle Create imports plain text cleanly).',
    '5. Cover: KDP Cover Creator, or export your FEL art listing as the base.',
    '6. Pricing: KDP royalty tiers are 35%/70% — your call; FEL takes nothing',
    '   from Amazon sales, only the in-app Shards fee on FEL sales.',
    '7. KDP review typically takes ~72 hours.',
    '', `Chapters: ${l.payload.chapters.length} · Exported from FEL ${new Date().toISOString()}`,
  ].join('\n');
  out.set('KDP-CHECKLIST.txt', new Blob([checklist], { type: 'text/plain' }));
  return out;
}

/** Trigger browser downloads for an export package. */
export function downloadPackage(files: Map<string, Blob>): void {
  for (const [name, blob] of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
}
