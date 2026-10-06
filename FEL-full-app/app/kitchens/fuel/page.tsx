import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { fuelAudience } from '@/lib/kitchens/audience';
import { FuelView } from '@/components/kitchens/fuel-view';
import { FuelYouthView } from '@/components/kitchens/fuel-youth-view';

export const dynamic = 'force-dynamic';

/** /kitchens/fuel — FEL Kitchens' Fuel floor: today's MealRx from Your Build (read-only) + the grocery list (v0). */
export default async function KitchensFuelPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/kitchens/fuel'));
  // owner-approved 2026-10-06: under 18 (or no birth year on file — not a verified adult) the floor is recipes and
  // cooking only: no calorie targets, no weight framing, no food scoring (lib/kitchens/audience.ts). A failed read is
  // no birth year: the youth floor.
  const userId = (session.user as { id?: string } | undefined)?.id;
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } }).catch(() => null) : null;
  const audience = fuelAudience(user?.dobYear ?? null);
  return (
    <div className="min-h-screen bg-[#050505] pb-24 text-white">
      {audience === 'adult' ? <FuelView /> : <FuelYouthView />}
    </div>
  );
}
