import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { TabPage } from '@/components/shell/tab-page';
import { AthletePicker, PrqFoundation } from '@/components/profile-view';
import { CardEditor } from '@/components/creator/card-editor';
import { ReferralCard } from '@/components/marketing/referral-card';

export const dynamic = 'force-dynamic';

/**
 * EDIT PROFILE (PROFILE V2, 2026-10-24). Everything you CHANGE about your profile, moved off the profile itself so the
 * profile can lead with progress: your athlete, your creator card (the public page, for adults), the invite card, and
 * logging a measurement by hand. The settings (motion, data rights, health data) are on /account.
 */
export default async function EditProfilePage() {
  const session = await getServerSession(authOptions);
  const me = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !me) redirect(loginPath('/profile/edit'));
  const profile = await prisma.playerProfile.findUnique({ where: { userId: me }, select: { avatarKey: true } }).catch(() => null);

  return (
    <TabPage eyebrow="Profile" title="Edit profile" lede="Your athlete, your card, and anything you measured yourself." accent="#FFD700"
      aside={<Link href="/profile" className="rounded-xl border border-white/10 px-3 py-2 text-[12px] font-bold text-white/75 hover:bg-white/[0.05] hover:text-white">← Back to profile</Link>}>
      <nav aria-label="On this page" className="mb-7 flex flex-wrap gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
        <a href="#athlete" className="hover:text-white">Athlete</a><span aria-hidden>·</span>
        <a href="#card" className="hover:text-white">Creator card</a><span aria-hidden>·</span>
        <a href="#invite" className="hover:text-white">Invite</a><span aria-hidden>·</span>
        <a href="#measure" className="hover:text-white">Log a measurement</a>
      </nav>
      <section id="athlete" className="scroll-mt-20"><AthletePicker initialKey={profile?.avatarKey ?? null} /></section>
      <section id="card" className="mt-10 scroll-mt-20">
        <h2 className="fel-heading text-[19px] font-bold text-white">Your creator card</h2>
        <p className="mt-1 text-[12.5px] text-white/40">Scanned by somebody new, it pays you both in shards. Publishing it is your public profile switch.</p>
        <div className="mt-3"><CardEditor /></div>
      </section>
      <section id="invite" className="mt-10 scroll-mt-20"><ReferralCard /></section>
      <section id="measure" className="mt-2 scroll-mt-20"><PrqFoundation /></section>
    </TabPage>
  );
}
