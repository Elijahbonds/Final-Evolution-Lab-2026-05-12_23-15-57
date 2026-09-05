import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { buildInstacartPayload, instacartConfigured, IDP_DEFAULT_HOST, IDP_PRODUCTS_LINK_PATH } from '@/lib/kitchens/instacart';
import type { GroceryItem } from '@/lib/kitchens/types';

export const dynamic = 'force-dynamic';

/** GET — is the Instacart path unlocked on this server? (the key is the whole gate; no key is ever sent down) */
export async function GET() {
  return NextResponse.json({ available: instacartConfigured() });
}

/**
 * POST { items: GroceryItem[] } — turn the grocery list into an IDP shopping-list page. 409 while the key is absent
 * (the client falls back to the list path with the same items). The application for a key stays on HOLD.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!instacartConfigured()) return NextResponse.json({ locked: true, reason: 'Instacart IDP key not configured (apply HOLD)' }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as { items?: GroceryItem[]; linkbackUrl?: string };
  const items = Array.isArray(body.items) ? body.items.filter((i) => i && typeof i.name === 'string' && typeof i.qty === 'number' && typeof i.unit === 'string').slice(0, 60) : [];
  if (!items.length) return NextResponse.json({ error: 'No items' }, { status: 400 });

  const host = process.env.INSTACART_IDP_HOST?.trim() || IDP_DEFAULT_HOST;
  try {
    const r = await fetch(host + IDP_PRODUCTS_LINK_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${process.env.INSTACART_IDP_KEY}` },
      body: JSON.stringify(buildInstacartPayload(items, { linkbackUrl: body.linkbackUrl })),
    });
    const j = (await r.json().catch(() => ({}))) as { products_link_url?: string; error?: unknown };
    if (!r.ok || !j.products_link_url) return NextResponse.json({ error: 'Instacart did not return a link', status: r.status }, { status: 502 });
    return NextResponse.json({ url: j.products_link_url });
  } catch {
    return NextResponse.json({ error: 'Instacart unreachable' }, { status: 502 });
  }
}
