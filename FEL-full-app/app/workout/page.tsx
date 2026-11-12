import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { loadWorkoutPage } from '@/lib/workout/relaunchServer';
import { WorkoutView, type PageData } from '@/components/workout-view';

export const dynamic = 'force-dynamic';

export default async function WorkoutPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/workout'));
  // SCREEN-FIXES (2026-11-10): the page reads what GET /api/v1/workout/plan answers (the same function, the same JSON) and
  // hands it to the view, so the plan picker is drawn whole the first time. The view used to fetch it after the first
  // paint, and the offer's lines, the template and the products then pushed the picker down: a layout shift of 0.324 on
  // the every-screen rig (the budget is 0.02). If the read fails here, the view fetches as it always did.
  const userId = (session.user as { id?: string } | undefined)?.id;
  const initialData = userId
    ? await loadWorkoutPage(prisma, userId).then((d) => JSON.parse(JSON.stringify(d)) as PageData).catch(() => null)
    : null;
  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      <WorkoutView initialData={initialData} />
    </div>
  );
}
