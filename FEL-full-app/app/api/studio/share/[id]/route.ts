import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isStudioShareEnabled } from '@/lib/flags';
import type { RawDb } from '@/lib/coach/pendingSchema';
import { studioNotFound } from '@/lib/nexus-studio/audience';
import { revokeShareLink } from '@/lib/nexus-studio/share';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/studio/share/[id] — NEX-06: the creator revokes their own link; its venue is deleted (the payload nulled), and the
 * link answers "not found" from then on. Any other account's link, or none, is the same 404. The creator may revoke even if they
 * have since left the Studio's audience: taking their own content down is always theirs.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!isStudioShareEnabled()) return studioNotFound();
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const r = await revokeShareLink(prisma as unknown as RawDb, params.id, userId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return r.value ? NextResponse.json({ revoked: true }) : studioNotFound();
}
