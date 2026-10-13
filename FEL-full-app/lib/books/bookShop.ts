/**
 * Is the book shop open for LISTENING? The same two switches that open checkout, read the same way, and nothing else:
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
