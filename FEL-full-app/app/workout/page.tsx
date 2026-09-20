import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { WorkoutView } from '@/components/workout-view';

export const dynamic = 'force-dynamic';

export default async function WorkoutPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      <WorkoutView />
    </div>
  );
}
