import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { BrainBrawlLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function BrainBrawlPage({ searchParams }: { searchParams?: { round?: string } }) {
  const session = await getServerSession(authOptions);
  // KNOWLEDGE-FEED v2: the Learn feed's "Test yourself" opens the REVIEW round; signing in first keeps it
  if (!session) redirect(loginPath(searchParams?.round === 'review' ? '/play/brain-brawl?round=review' : '/play/brain-brawl'));
  return <BrainBrawlLoader />;
}
