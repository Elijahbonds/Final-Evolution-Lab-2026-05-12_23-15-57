/**
 * GET /api/story — campaign merged with the signed-in user's progress.
 * Response body: CampaignStatus (see lib/progression.ts).
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { evaluateCampaign } from '@/lib/progression';
import { loadProgressionInput } from '@/lib/story-service';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const input = await loadProgressionInput(userId);
    const status = evaluateCampaign(input);

    return NextResponse.json(status);
  } catch (error) {
    console.error('[api/story] GET failed:', error);
    return NextResponse.json(
      { error: 'Failed to load story progress' },
      { status: 500 },
    );
  }
}
