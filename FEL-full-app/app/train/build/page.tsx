import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { TabPage } from '@/components/shell/tab-page';
import { ProgramBuilder } from '@/components/program-ask/program-builder';
import { PAGE_LEDE, PAGE_TITLE } from '@/lib/program-ask/copy';
import { MAX_ASK_CHARS } from '@/lib/program-ask/request';

export const dynamic = 'force-dynamic';

/**
 * /train/build — PROGRAM-ASK (2026-11-02): "Build my program". Owner: "The AI should be able to give me an entire workout
 * program if I tell it, all I have is a band." The ask, the chips, the week view and Start today; the build is the
 * server's (POST /api/program-ask). `?q=` arrives from the library's Ask when someone asks it for a whole program.
 */
export default async function BuildProgramPage({ searchParams }: { searchParams?: { q?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(loginPath('/train/build'));
  const q = typeof searchParams?.q === 'string' ? searchParams.q.slice(0, MAX_ASK_CHARS) : '';
  return (
    <TabPage eyebrow="Train" title={PAGE_TITLE} lede={PAGE_LEDE}>
      <ProgramBuilder initialQuestion={q} />
    </TabPage>
  );
}
