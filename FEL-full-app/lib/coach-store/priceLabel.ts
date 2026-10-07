// STORE-PRICE-ON-CARD (COACHING-UX tip 1, STORE-PREFLIP-FIXES item 3): every listing card shows the price, the
// length and the billing period before Stripe, and the Continue button repeats them. All of it comes from the
// listing row (`MarketplaceListing.priceUsd` cents + its manifest) — no hard-coded dollar amounts. Money strings
// still come from formatCents (./money), the one place UI money is formatted.
import { formatCents } from './money';
import type { CoachManifest } from './manifest';

/** The length the card must name, e.g. "30 min" / "8 weeks". Null when the kind has no length of its own. */
export function listingLengthLabel(manifest: CoachManifest): string | null {
  if (manifest.kind === 'live_1on1') return `${manifest.durationMin} min`;
  if (manifest.kind === 'program') return `${manifest.weeks ?? 8} weeks`;
  return null;
}

/** The billing period the card must name, e.g. "/month" for memberships. Null when the kind bills one time. */
export function billingPeriodLabel(manifest: CoachManifest): string | null {
  if (manifest.kind === 'membership') return `/${manifest.interval}`;
  return null;
}

/** Card label: price, then length and billing period joined by " · ", e.g. "$65.00 · 30 min" or "$29.99/month". */
export function listingPriceLabel(priceCents: number, manifest: CoachManifest): string {
  const price = formatCents(priceCents);
  const period = billingPeriodLabel(manifest);
  const parts = [period ? `${price}${period}` : price, listingLengthLabel(manifest)].filter((p): p is string => p !== null);
  return parts.join(' · ');
}

/** The Continue button repeats the card, e.g. "Book 30 min · $65.00" or "Join · $29.99/month". */
export function continueLabel(priceCents: number, manifest: CoachManifest): string {
  const length = listingLengthLabel(manifest);
  const price = formatCents(priceCents);
  const period = billingPeriodLabel(manifest);
  if (manifest.kind === 'live_1on1') return `Book ${length} · ${price}`;
  if (manifest.kind === 'membership') return `Join · ${price}${period}`;
  if (length) return `Buy ${length} · ${price}`;
  return `Buy · ${price}${period ?? ''}`;
}
