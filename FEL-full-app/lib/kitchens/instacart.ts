// FEL Kitchens — Instacart Developer Platform (IDP) shopping-list link, wired BEHIND THE KEY (owner decision
// 2026-09-05). The application itself stays on HOLD (pad-grade + AM paste + Elijah GO); nothing here signs up for
// anything. The moment `INSTACART_IDP_KEY` exists in the server env, /api/kitchens/instacart-list turns the same
// GroceryItem[] the list path uses into a shoppable page. Pure payload builder here (testable); the fetch lives in the
// route. Endpoint and body shape per the IDP "create shopping list page" docs — verify against the docs on first key.

import type { GroceryItem, GroceryUnit } from './types';

/** IDP hosts: the dev sandbox by default; production only when INSTACART_IDP_HOST says so. */
export const IDP_DEFAULT_HOST = 'https://connect.dev.instacart.tools';
export const IDP_PRODUCTS_LINK_PATH = '/idp/v1/products/products_link';

/** Our units → IDP measurement units. */
export const IDP_UNIT: Record<GroceryUnit, string> = {
  g: 'gram', ml: 'milliliter', each: 'each', tbsp: 'tablespoon', tsp: 'teaspoon', cup: 'cup', oz: 'ounce',
};

export interface IdpLineItem { name: string; quantity: number; unit: string; display_text: string }
export interface IdpProductsLinkPayload {
  title: string;
  link_type: 'shopping_list';
  expires_in?: number;
  instructions?: string[];
  line_items: IdpLineItem[];
  landing_page_configuration?: { partner_linkback_url?: string; enable_pantry_items?: boolean };
}

/** Pure: the payload for one grocery list. Optional items are kept (the shopper decides); nothing else is added. */
export function buildInstacartPayload(items: GroceryItem[], opts: { title?: string; linkbackUrl?: string } = {}): IdpProductsLinkPayload {
  return {
    title: opts.title ?? 'FEL Kitchens · today\'s fuel',
    link_type: 'shopping_list',
    expires_in: 30,
    instructions: ['Performance fuel, not medical advice. Food tags describe the plate, not a treatment.'],
    line_items: items.map((i) => ({
      name: i.name,
      quantity: Math.max(1, Math.round(i.qty * 100) / 100),
      unit: IDP_UNIT[i.unit] ?? 'each',
      display_text: `${i.name} — ${i.qty} ${i.unit}${i.optional ? ' (optional)' : ''}`,
    })),
    landing_page_configuration: opts.linkbackUrl ? { partner_linkback_url: opts.linkbackUrl, enable_pantry_items: true } : { enable_pantry_items: true },
  };
}

/** Server-side: is the path unlocked? A key in the env is the whole gate. */
export function instacartConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.INSTACART_IDP_KEY && env.INSTACART_IDP_KEY.trim());
}
