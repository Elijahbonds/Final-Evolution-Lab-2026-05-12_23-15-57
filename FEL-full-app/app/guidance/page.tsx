import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { TabPage } from '@/components/shell/tab-page';
import { PathwayPanel } from '@/components/guidance/pathway-panel';

export const dynamic = 'force-dynamic';

/** Where this could go — read from what somebody keeps coming back to. */
export default async function GuidancePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login?next=%2Fguidance');
  return (
    <TabPage
      eyebrow="Pathways"
      title="Where this could go"
      lede="Roads out of what you already do — in sport, music, art, dance, acting, scene, cooking, fashion and writing. Each one with a step you could take this week."
      accent="#7B61FF"
    >
      <PathwayPanel />
    </TabPage>
  );
}
