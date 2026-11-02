'use client';
// BookBuy — PLAT-P07 (2026-11-02): an audiobook through the one buy sheet: what you get (stream in FEL, no download), the
// store terms the book route checks (lib/store-terms.ts STORE_TERMS_VERSION, the same box components/press/buy-button.tsx
// shows), then pay (POST /api/books/checkout, unchanged). A client wrapper, because the pay step is a function.
import { BuyEntry } from './buy-sheet';
import { payBook } from '@/lib/shop/checkout';
import { STORE_TERMS_VERSION } from '@/lib/store-terms';
import type { ShopItem } from '@/lib/shop/model';

export const AUDIO_INCLUDES = ['Stream in FEL. No download.'] as const;

export function BookBuy({ item, back = '/press' }: { item: ShopItem; back?: string }) {
  return <BuyEntry item={item} label="Buy audiobook" action="buy-book" includes={AUDIO_INCLUDES} terms={{ href: '/store-terms' }}
    pay={() => payBook(fetch, { offerId: item.id, termsVersion: STORE_TERMS_VERSION, back })} />;
}
