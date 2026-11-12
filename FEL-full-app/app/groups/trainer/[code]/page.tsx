import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { SHOP_LOOK as L } from '@/components/shop/look';
import { AcceptTrainerInvite } from '@/components/group-booking/accept-trainer';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Trainer invite · Final Evolution', robots: { index: false, follow: false } };

// GROUP-BOOKING: the link the owner sends a trainer ("invite a trainer" on /coach/groups). Signed in, they accept; the
// code is single-use. Accepting does not make them bookable: that is the owner's GROUP_TRAINERS_BOOKABLE switch.
export default async function TrainerInvitePage({ params }: { params: { code: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath(`/groups/trainer/${encodeURIComponent(params.code)}`));
  return (
    <main className={L.page}>
      <p className={L.eyebrow}>Trainer invite</p>
      <h1 className={L.title}>Join the team</h1>
      <AcceptTrainerInvite code={params.code} />
    </main>
  );
}
