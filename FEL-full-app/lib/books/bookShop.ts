/**
 * NOT USED BY LISTENING ANY MORE (owner, 2026-10-13): paid buyers keep streaming with the shop off, so neither
 * POST /api/books/stream nor /press/library calls this (bookShopListeningTests pin that). Kept for a SELLING-side
 * check that wants the two switches without Stripe; do not put it back in front of the player.
 *
 * Is the book shop open? The same two switches that open checkout, read the same way, and nothing else:
 *   BOOK_STORE_ENABLED (default off, fail closed) and the release's B10 fence VIRTUAL_PURCHASES_ENABLED.
 * Listening needs no Stripe key and no site origin (those are checkout's), so this is not bookCheckoutGate.
 * Server only (the checkout module pulls in Stripe).
 */

import 'server-only';
import type { StoreClosedReason } from '@/lib/coach-store/stripeMode';
import { bookStoreEnabled, virtualPurchasesOn } from './bookCheckout';

export function bookShopClosedReason(env: NodeJS.ProcessEnv = process.env): StoreClosedReason | null {
  if (!bookStoreEnabled(env)) return 'book_store_off';
  if (!virtualPurchasesOn(env)) return 'virtual_purchases_off';
  return null;
}
