import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { TabPage } from '@/components/shell/tab-page';
import { ChapterList } from '@/components/education/chapter-list';
// MIRROR-COACH P9 (2026-09-30), owner decisions #8 and #25: a plain citation as further reading, under the course.
import { FurtherReading } from '@/components/education/further-reading';

export const dynamic = 'force-dynamic';

/** The movement course — the owner's book, taught a chapter at a time. */
export default async function PlaybookPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login?next=%2Feducation%2Fplaybook');
  return (
    <TabPage
      eyebrow="The Playbook"
      title="How the body actually moves"
      lede="Ten chapters on human movement — the control panel, the joints, the jump, the landing, the reset. Every drill is one you can run tonight."
      accent="#00FF9D"
    >
      <ChapterList />
      <FurtherReading />
    </TabPage>
  );
}
