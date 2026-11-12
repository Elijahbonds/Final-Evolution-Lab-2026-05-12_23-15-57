import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { TabPage } from '@/components/shell/tab-page';
import { ChapterList } from '@/components/education/chapter-list';
// MIRROR-COACH P9 (2026-09-30), owner decisions #8 and #25: a plain citation as further reading, under the course.
import { FurtherReading } from '@/components/education/further-reading';

export const dynamic = 'force-dynamic';

/** The movement course — the owner's book, taught a chapter at a time. */
export default async function PlaybookPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/education/playbook'));
  return (
    // PREMIUM-UI P7 (2026-10-27): the owner's book opens on the owner's own dunk photograph (public/brand, credited), the
    // lede cut from 24 words to 11; the chapters follow.
    <TabPage
      eyebrow="The Playbook"
      title="How the body moves"
      lede="Ten chapters on human movement. Every drill runs tonight."
      hero={{ image: '/brand/bonds-dunk-gym.jpg', imagePosition: '50% 20%' }}
    >
      <ChapterList />
      <FurtherReading />
    </TabPage>
  );
}
