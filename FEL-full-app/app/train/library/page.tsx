import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { TabPage } from '@/components/shell/tab-page';
import { LibraryBrowser } from '@/components/library/library-browser';

export const dynamic = 'force-dynamic';

/**
 * /train/library — EXERCISE-LIBRARY (2026-10-25): the shared exercise library for athletes. Owner: "Make sure people
 * can search for what they need, ask ai." Approved entries only (drafts are a coach opt-in on /coach); youth rules
 * apply to the viewer on the server.
 * PLAT-P08 (2026-11-02): the lede goes (the search box says what to do); the screen is the search, the quick chips and the
 * moving demos.
 */
export default async function TrainLibraryPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(loginPath('/train/library'));
  return (
    <TabPage eyebrow="Train" title="Exercise library" accent="#00E5FF">
      <div className="mx-auto max-w-[720px]">
        <LibraryBrowser />
      </div>
    </TabPage>
  );
}
