import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { instacartConfigured } from '@/lib/kitchens/instacart';
import { mintInstacartList } from '@/lib/kitchens/instacartMint';

export const dynamic = 'force-dynamic';

/** GET — is the Instacart path unlocked on this server? (the key is the whole gate; no key is ever sent down) */
export async function GET() {
  return NextResponse.json({ available: instacartConfigured() });
}

/**
 * POST { items: GroceryItem[], linkbackUrl? } — turn the grocery list into an IDP shopping-list page. The route only
 * does auth; the mint (lib/kitchens/instacartMint.ts) reads the key from the env, builds the payload and calls the
 * fetch it is handed — here the real one, in tests a recorder. 409 `locked` while the key is absent (the client falls
 * back to the list path with the same items). The application for a key stays on HOLD.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { items?: unknown; linkbackUrl?: unknown };
  const r = await mintInstacartList({ items: body.items, linkbackUrl: body.linkbackUrl, fetchImpl: (url, init) => fetch(url, init) });
  return NextResponse.json(r.body, { status: r.status });
}
