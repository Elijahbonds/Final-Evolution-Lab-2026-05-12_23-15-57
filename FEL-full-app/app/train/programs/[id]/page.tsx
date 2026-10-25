import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { TabPage } from '@/components/shell/tab-page';
import { ProgramPage } from '@/components/signature/program-page';
import { isSignatureId } from '@/lib/signature/content';
import { defaultDeps, programPage, signatureViewer } from '@/lib/signature/server';

export const dynamic = 'force-dynamic';

/**
 * /train/programs/:id — SIGNATURE-PROGRAMS (2026-10-25): one program — the overview, today's session under today's gates,
 * and the week view. 404 for a program this viewer may not see (a draft, to anyone but the admin).
 */
export default async function SignatureProgramPage({ params }: { params: { id: string } }) {
  if (!isSignatureId(params.id)) notFound();
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) redirect(loginPath(`/train/programs/${params.id}`));
  const deps = defaultDeps();
  const viewer = await signatureViewer(user.id, user.role, deps);
  const view = await programPage(viewer, params.id, deps);
  if (!view) notFound();
  return (
    <TabPage eyebrow="Signature program" title={view.title} lede={view.tagline} accent="#00FF9D"
      aside={<Link href="/train/programs" className="rounded-xl border border-white/10 px-3 py-2 text-[12px] font-bold text-white/75 hover:bg-white/[0.05] hover:text-white">← All programs</Link>}>
      <ProgramPage initial={view} />
    </TabPage>
  );
}
