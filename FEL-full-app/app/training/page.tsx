import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';

export const dynamic = 'force-dynamic';

/**
 * /training — ONE HOME (PLAT-P06, 2026-10-28). A coached athlete had two homes for the same session: this page
 * (TrainingClientView, the older step-through) and /coach → Today. Today is now the one: the coach's reply on top, Start
 * today's session (the phase-1 player), the week. So /training sends everyone there, signed out to sign in first (as
 * before). "No coach yet", the state this page showed an athlete with no coach and no program, moved onto Today
 * (app/coach/_components/today-view.tsx), so the join flow's push here (app/coach/join/[token]/join-button.tsx) still lands.
 *
 * REVERSIBLE: components/training/TrainingDashboard.tsx stays in the tree, unmounted (its header says so). Putting this
 * page back is restoring the previous version of this file (git history: the page before PLAT-P06).
 */
export default async function TrainingPage() {
  const session = await getServerSession(authOptions);
  const me = (session?.user as { id?: string } | undefined)?.id;
  if (!me) redirect(loginPath('/training'));
  return redirect('/coach');
}
