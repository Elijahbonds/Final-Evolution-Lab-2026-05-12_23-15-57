// lib/create/creator-context.ts — CREATE HUB: what the /create pages tell the client about the signed-in creator.
// Server only. `publicCreator` is lane/soundtrack's rule (creative-card-review.ts ownerIsPublicCreator: verified 18+ by
// the DATABASE's birth year, strict; unknown age = not public). A failed read is "not public": the safe side.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ownerIsPublicCreator } from '@/lib/creator/creative-card-review';

export interface CreatorContext { userId: string; creatorName: string; publicCreator: boolean }

export async function creatorContext(): Promise<CreatorContext | null> {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; name?: string | null } | undefined;
  if (!user?.id) return null;
  const publicCreator = await ownerIsPublicCreator(prisma, user.id).catch(() => false);
  return { userId: user.id, creatorName: (user.name ?? '').trim() || 'You', publicCreator };
}
