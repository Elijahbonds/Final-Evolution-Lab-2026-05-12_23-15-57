import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { TabPage } from '@/components/shell/tab-page';
import { ProgramPage } from '@/components/signature/program-page';
import { isSignatureId, signatureProgram } from '@/lib/signature/content';
import { defaultDeps, programPage, signatureViewer } from '@/lib/signature/server';
import { libraryState } from '@/lib/library/server';
import { clipsFor } from '@/lib/session-player/clips';
import { signatureExerciseIds } from '@/lib/session-player/fromSignature';

export const dynamic = 'force-dynamic';

/**
 * /train/programs/:id — SIGNATURE-PROGRAMS (2026-10-25): one program — the overview, today's session under today's gates,
 * and the week view. 404 for a program this viewer may not see (a draft, to anyone but the admin).
 * PLAT-P01 (2026-10-27): the page also hands the session player each exercise's loop (lib/session-player/clips.ts, read
 * here because the library is server-only), so Start plays the demo with no further request. The tagline moved from the
 * header into "About this program": above the fold the page is today's session and Start.
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
  const { index } = await libraryState().catch(() => ({ index: null }));
  const clips = index ? clipsFor(signatureExerciseIds(signatureProgram(params.id)!), (x) => index.docs[index.byId.get(x) ?? -1] ?? null) : {};
  return (
    <TabPage eyebrow="Signature program" title={view.title} accent="#00FF9D"
      aside={<Link href="/train/programs" className="inline-flex min-h-[44px] items-center font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-fel-soft hover:text-white">← All programs</Link>}>
      <ProgramPage initial={view} clips={clips} />
    </TabPage>
  );
}
