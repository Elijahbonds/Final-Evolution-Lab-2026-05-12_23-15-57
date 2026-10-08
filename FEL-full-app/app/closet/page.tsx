import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { ClosetView } from '@/components/closet-view';
import { prisma } from '@/lib/db';
import { isFaceScanEnabled } from '@/lib/flags';
import { readDobYear } from '@/lib/privacy/scanSaveGate';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';

export const dynamic = 'force-dynamic';

export default async function ClosetPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/closet'));
  const userId = (session.user as { id?: string } | undefined)?.id;
  const adult = userId ? verifiedAdult(await readDobYear(prisma, userId, 'look_hold_page')) : false;
  // CREATOR-PLAN phase 4d: the Closet is the Studio — a full-screen stage sized to the viewport under the status rail
  // (and above the phone's tab bar), so the page itself no longer pads for the bottom bar.
  return (
    <div className="bg-[#050505]">
      <ClosetView adult={adult} faceScan={isFaceScanEnabled()} />
    </div>
  );
}
