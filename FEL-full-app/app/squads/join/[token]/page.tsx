import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { TabPage } from '@/components/shell/tab-page';
import { JoinLanding } from '@/components/groups/join-landing';
import { previewInvite, type GroupsDb } from '@/lib/groups/server';
import { COMING_SOON, SQUADS_PATH } from '@/lib/groups/copy';
import type { GroupColor, GroupKind } from '@/lib/groups/types';

export const dynamic = 'force-dynamic';

/** A squad or team invite link (and its QR). What it is before sign-in; the join gate runs on the button. */
export default async function JoinGroupPage({ params }: { params: { token: string } }) {
  const token = decodeURIComponent(String(params.token));
  const session = await getServerSession(authOptions);
  const signedIn = !!(session?.user as { id?: string } | undefined)?.id;
  const r = await previewInvite(prisma as unknown as GroupsDb, { token }).catch(() => null);
  const b = (r?.body ?? {}) as { available?: boolean; kind?: GroupKind; name?: string; color?: GroupColor };
  return (
    <TabPage eyebrow="Train together" title="You’re invited" accent="#00E5FF">
      {r?.status === 200 && b.available && b.kind && b.name && b.color
        ? <JoinLanding token={token} kind={b.kind} name={b.name} color={b.color} signedIn={signedIn} loginHref={loginPath(`/squads/join/${encodeURIComponent(token)}`)} />
        : (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-[14px] text-white/70">
            {b.available === false ? COMING_SOON : 'This invite is not open any more. Ask for a new code.'}
            <Link href={SQUADS_PATH} className="mt-3 block min-h-[44px] font-bold text-[#00E5FF]">Squads and teams →</Link>
          </section>
        )}
    </TabPage>
  );
}
