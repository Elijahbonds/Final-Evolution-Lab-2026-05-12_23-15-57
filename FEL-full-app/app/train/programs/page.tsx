import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { TabPage } from '@/components/shell/tab-page';
import { ProgramList } from '@/components/signature/program-list';
import { defaultDeps, programsOverview, signatureViewer } from '@/lib/signature/server';
import { PROGRAMS_LEDE, PROGRAMS_TITLE } from '@/lib/signature/copy';

export const dynamic = 'force-dynamic';

/**
 * /train/programs — SIGNATURE-PROGRAMS (2026-10-25): FEL's four signature programs (vertical jump, basketball skills,
 * athletic foundation, pain-free prehab). Approved programs only; the admin also sees the drafts, labelled.
 */
export default async function ProgramsPage() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) redirect(loginPath('/train/programs'));
  const deps = defaultDeps();
  const viewer = await signatureViewer(user.id, user.role, deps);
  const o = await programsOverview(viewer, deps).catch(() => ({ ready: false, admin: viewer.isAdmin, youth: viewer.youth, programs: [] }));
  return (
    <TabPage eyebrow="Train" title={PROGRAMS_TITLE} lede={PROGRAMS_LEDE} accent="#00FF9D">
      <ProgramList {...o} />
    </TabPage>
  );
}
