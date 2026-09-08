'use client';

/**
 * lib/wallet/use-purchases-enabled.ts — the client side of the ONE purchases truth (lib/wallet/purchases.ts).
 *
 * Asks GET /api/v1/wallet/config once per page load (the promise is shared across every mounted store / chip) and
 * returns `null` until it answers, so copy stays neutral rather than flashing a sale that turns into COMING SOON.
 */

import { useEffect, useState } from 'react';
import type { PurchasesState } from './purchases';

let shared: Promise<boolean> | null = null;

export function fetchPurchasesEnabled(): Promise<boolean> {
  if (!shared) {
    shared = fetch('/api/v1/wallet/config', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { purchasesEnabled: false }))
      .then((d) => Boolean(d?.purchasesEnabled))
      .catch(() => false);
  }
  return shared;
}

/** Test seam: forget the shared answer (a new page load does this naturally). */
export function resetPurchasesEnabledCache(): void { shared = null; }

export function usePurchasesEnabled(): PurchasesState {
  const [state, setState] = useState<PurchasesState>(null);
  useEffect(() => {
    let live = true;
    fetchPurchasesEnabled().then((v) => { if (live) setState(v); });
    return () => { live = false; };
  }, []);
  return state;
}
