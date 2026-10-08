import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { isCoachStoreEnabled } from '@/lib/flags';
import { isAllowlistedCoach } from '@/lib/coach-store/coaches';
import { isMissingTable, logStoreUnavailable } from '@/lib/coach-store/gate';
import { HoursEditor } from '@/components/coach-store/hours-editor';
import type { WeeklyWindow } from '@/lib/coach-store/slots';

export const dynamic = 'force-dynamic';

export default async function CoachHoursSettingsPage() {
  if (!isCoachStoreEnabled()) notFound();
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect(loginPath('/coach/dashboard/settings'));
  if (!isAllowlistedCoach(userId)) notFound();

  let instructor: { weeklyHours: unknown; blackoutDates: unknown } | null = null;
  try {
    instructor = await prisma.instructor.findUnique({ where: { userId }, select: { weeklyHours: true, blackoutDates: true } });
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    logStoreUnavailable();
    return <main className="px-4 py-8 text-white">Coach store is not set up yet.</main>;
  }

  if (!instructor) {
    return <main className="mx-auto max-w-3xl px-4 py-8 text-white">Your coach profile isn&apos;t set up yet.</main>;
  }

  const weeklyHours = Array.isArray(instructor.weeklyHours) ? (instructor.weeklyHours as WeeklyWindow[]) : [];
  const blackoutDates = Array.isArray(instructor.blackoutDates) ? (instructor.blackoutDates as string[]) : [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-white">
      <h1 className="text-2xl font-black">Hours and days off</h1>
      <p className="mt-2 text-sm">All times Pacific.</p>
      <HoursEditor initialWeeklyHours={weeklyHours} initialBlackoutDates={blackoutDates} />
    </main>
  );
}
