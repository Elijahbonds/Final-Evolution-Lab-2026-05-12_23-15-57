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

/**
 * `initial`: the server's answer when the page had it (SCREEN-FIXES 2026-11-10: /store passes it). Then the first draw is
 * already right, and the coin packs no longer vanish after the page is up — measured as a layout shift of 0.42 on /store
 * (the budget is 0.02). The fetch still runs and gives the same answer; without `initial` nothing changes.
 */
export function usePurchasesEnabled(initial: PurchasesState = null): PurchasesState {
  const [state, setState] = useState<PurchasesState>(initial);
  useEffect(() => {
    let live = true;
    fetchPurchasesEnabled().then((v) => { if (live) setState(v); });
    return () => { live = false; };
  }, []);
  return state;
}
