import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { encryptSecret, keyHint } from '@/lib/cell-crypto';

export const dynamic = 'force-dynamic';

const PROVIDERS = ['openai', 'anthropic', 'google'] as const;
type KeyProvider = (typeof PROVIDERS)[number];

async function loadState(userId: string) {
  const [keys, settings] = await Promise.all([
    prisma.cellApiKey.findMany({ where: { userId }, orderBy: { provider: 'asc' } }),
    prisma.cellSettings.findUnique({ where: { userId } }),
  ]);
  return {
    keys: keys.map((k) => ({ provider: k.provider, hint: k.hint, updatedAt: k.updatedAt })),
    budgetUsd: settings?.budgetUsd ?? 0,
    preferCheap: settings?.preferCheap ?? true,
  };
}

/** GET — masked keys + budget + preference. Never returns raw key material. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await loadState(userId));
}

/**
 * POST — update budget/preference and/or add-or-update a provider API key.
 * Body: { budgetUsd?, preferCheap?, provider?, apiKey? }
 * A provider key is stored encrypted; only the last-4 hint is ever surfaced.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  // settings (budget / preferCheap)
  if (body.budgetUsd !== undefined || body.preferCheap !== undefined) {
    const budgetUsd = body.budgetUsd !== undefined ? Math.max(0, Number(body.budgetUsd) || 0) : undefined;
    const preferCheap = body.preferCheap !== undefined ? Boolean(body.preferCheap) : undefined;
    await prisma.cellSettings.upsert({
      where: { userId },
      create: {
        userId,
        budgetUsd: budgetUsd ?? 0,
        preferCheap: preferCheap ?? true,
      },
      update: {
        ...(budgetUsd !== undefined ? { budgetUsd } : {}),
        ...(preferCheap !== undefined ? { preferCheap } : {}),
      },
    });
  }

  // provider key
  if (body.provider && typeof body.apiKey === 'string' && body.apiKey.trim()) {
    const provider = String(body.provider) as KeyProvider;
    if (!PROVIDERS.includes(provider)) {
      return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
    }
    const raw = body.apiKey.trim();
    await prisma.cellApiKey.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, keyCipher: encryptSecret(raw), hint: keyHint(raw) },
      update: { keyCipher: encryptSecret(raw), hint: keyHint(raw) },
    });
  }

  return NextResponse.json(await loadState(userId));
}

/** DELETE ?provider=openai — remove a stored provider key. */
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const provider = new URL(req.url).searchParams.get('provider') as KeyProvider | null;
  if (!provider || !PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: 'provider required' }, { status: 400 });
  }
  await prisma.cellApiKey.deleteMany({ where: { userId, provider } });
  return NextResponse.json(await loadState(userId));
}
