// FEL Kitchens — the Instacart mint, lifted out of the route so it can be proven without the network. The route
// (app/api/kitchens/instacart-list/route.ts) does auth and hands the body here with the real `fetch`; tests hand a
// fake key and a fake fetch and read the exact request that would have gone out. No key is ever read from anywhere
// but the env object passed in (process.env by default); nothing here stores or logs it.

import { buildInstacartPayload, IDP_DEFAULT_HOST, IDP_PRODUCTS_LINK_PATH, instacartConfigured } from './instacart';
import type { GroceryItem, GroceryUnit } from './types';

/** The slice of fetch the mint needs — the global fetch satisfies it, so does a recording stub. */
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface MintResult {
  status: 200 | 400 | 409 | 502;
  body: { url: string } | { locked: true; reason: string } | { error: string; status?: number };
}

const UNITS: GroceryUnit[] = ['g', 'ml', 'each', 'tbsp', 'tsp', 'cup', 'oz'];
export const MAX_ITEMS = 60;

/** Only well-formed items go out; anything else in the posted array is dropped. Capped at 60 lines. */
export function parseItems(raw: unknown): GroceryItem[] {
  if (!Array.isArray(raw)) return [];
  const out: GroceryItem[] = [];
  for (const i of raw as unknown[]) {
    if (!i || typeof i !== 'object') continue;
    const it = i as Record<string, unknown>;
    if (typeof it.name !== 'string' || !it.name.trim() || typeof it.qty !== 'number' || !Number.isFinite(it.qty) || typeof it.unit !== 'string' || !UNITS.includes(it.unit as GroceryUnit)) continue;
    out.push({ name: it.name.trim(), qty: it.qty, unit: it.unit as GroceryUnit, optional: Boolean(it.optional), aisleHint: typeof it.aisleHint === 'string' ? it.aisleHint : undefined, externalSkuHint: null });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

/**
 * Turn a grocery list into an IDP shopping-list page. 409 `locked` while the key is absent (the client falls back to
 * the list path with the same items), 400 without items, 502 when Instacart does not answer with a link.
 */
export async function mintInstacartList(input: {
  items: unknown;
  linkbackUrl?: unknown;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
}): Promise<MintResult> {
  const env = input.env ?? process.env;
  if (!instacartConfigured(env)) return { status: 409, body: { locked: true, reason: 'Instacart IDP key not configured (apply HOLD)' } };

  const items = parseItems(input.items);
  if (!items.length) return { status: 400, body: { error: 'No items' } };

  const linkbackUrl = typeof input.linkbackUrl === 'string' && /^https?:\/\//.test(input.linkbackUrl) ? input.linkbackUrl : undefined;
  const host = env.INSTACART_IDP_HOST?.trim() || IDP_DEFAULT_HOST;
  const doFetch = input.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  try {
    const r = await doFetch(host + IDP_PRODUCTS_LINK_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${env.INSTACART_IDP_KEY!.trim()}` },
      body: JSON.stringify(buildInstacartPayload(items, { linkbackUrl })),
    });
    const j = (await r.json().catch(() => ({}))) as { products_link_url?: unknown };
    if (!r.ok || typeof j.products_link_url !== 'string') return { status: 502, body: { error: 'Instacart did not return a link', status: r.status } };
    return { status: 200, body: { url: j.products_link_url } };
  } catch {
    return { status: 502, body: { error: 'Instacart unreachable' } };
  }
}
