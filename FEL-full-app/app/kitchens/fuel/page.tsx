import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { FuelView } from '@/components/kitchens/fuel-view';

export const dynamic = 'force-dynamic';

/** /kitchens/fuel — FEL Kitchens' Fuel floor: today's MealRx from Your Build (read-only) + the grocery list (v0). */
export default async function KitchensFuelPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505] pb-24 text-white">
      <FuelView />
    </div>
  );
}
