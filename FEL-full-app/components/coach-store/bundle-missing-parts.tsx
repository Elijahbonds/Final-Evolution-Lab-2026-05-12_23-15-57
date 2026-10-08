'use client';

/**
 * BUNDLE-MISSING-PARTS-UI. Presentational only — no fetch, no routing. book-form.tsx owns the POST to
 * /api/coach-store/checkout for each part and passes the result back in via `busyKey` / `errors` / `auth`.
 */
import type { BundlePartWithListing } from '@/lib/coach-store/bundleParts';
import { partIsBuyable, partPriceCents } from '@/lib/coach-store/bundleParts';
import { formatCents } from '@/lib/coach-store/money';
import type { OwnedBundlePart } from '@/lib/coach-store/entitlement';

export type PartAuthState = 'sign_in' | 'adults_only';

export function BundleMissingParts({
  owned,
  missing,
  onBuy,
  busyKey,
  errors,
  auth,
  renderAuth,
  buyDisabled = false,
}: {
  owned: readonly OwnedBundlePart[];
  missing: readonly BundlePartWithListing[];
  onBuy: (part: BundlePartWithListing) => void;
  busyKey?: string | null;
  errors?: Readonly<Record<string, string>>;
  /** STORE-SIGNIN-RETURN: per-part 401/403 outcome; rendered through renderAuth so the copy lives in book-form. */
  auth?: Readonly<Record<string, PartAuthState>>;
  renderAuth?: (part: BundlePartWithListing, state: PartAuthState) => React.ReactNode;
  /** STORE-TERMS-3 (T6): a bundle-part buy is a checkout too — the per-part Buy button is disabled until the buyer ticks the terms box. */
  buyDisabled?: boolean;
}) {
  const allOwned = missing.length === 0;
  return (
    <section aria-labelledby="bundle-missing-parts-heading" className="space-y-3 rounded-xl border border-white/20 p-4">
      <h2 id="bundle-missing-parts-heading" className="text-base font-bold text-white">
        {allOwned ? 'You already own every part of this bundle' : 'You already own part of this bundle'}
      </h2>
      {allOwned ? null : <p className="text-sm text-white/80">Buy the parts you don&apos;t have yet:</p>}
      <ul className="space-y-2">
        {owned.map((part) => (
          <li key={part.key} className="text-sm text-white/70">
            {part.title ?? part.key} — <span>Owned</span>
          </li>
        ))}
        {missing.map((part) => {
          const priceCents = partPriceCents(part);
          const buyable = partIsBuyable(part);
          const busy = busyKey === part.key;
          const error = errors?.[part.key];
          const title = part.title ?? part.key;
          return (
            <li key={part.key} className="space-y-1 text-sm text-white">
              <div className="flex items-center justify-between gap-3">
                <span>
                  {title}
                  {priceCents !== null ? `, ${formatCents(priceCents)}` : ''}
                </span>
                {buyable ? (
                  <button
                    type="button"
                    aria-label={`Buy ${title}, ${formatCents(priceCents as number)}`}
                    aria-busy={busy}
                    disabled={busy || buyDisabled}
                    className="rounded-lg bg-cyan-300 px-3 py-1 text-xs font-bold text-black disabled:opacity-60"
                    onClick={() => onBuy(part)}
                  >
                    {busy ? 'Starting…' : 'Buy'}
                  </button>
                ) : (
                  <span className="text-xs text-white/50">Not available</span>
                )}
              </div>
              {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}
              {auth?.[part.key] && renderAuth ? renderAuth(part, auth[part.key]) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
