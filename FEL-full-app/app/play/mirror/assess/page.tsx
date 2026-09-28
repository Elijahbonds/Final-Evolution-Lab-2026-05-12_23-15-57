import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AssessApp } from './_components/assess-app';

export const dynamic = 'force-dynamic';

// Mirror Assess: the Quick Screen (lib/assess; FEL-MIRROR-REALTIME-SPEC phases 1–2). A new route beside the Mirror's
// existing tabs, which it does not touch. Open to anyone: a guest sees their scores and nothing is saved; a signed-in
// athlete's numbers are saved (never the picture). Camera and pose run in the browser; there is no Babylon here.
export default async function MirrorAssessPage() {
  const session = await getServerSession(authOptions);
  return <AssessApp signedIn={!!(session?.user as { id?: string } | undefined)?.id} />;
}
