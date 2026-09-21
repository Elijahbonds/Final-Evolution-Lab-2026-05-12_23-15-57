import { PlayShelf } from '@/components/shell/play-shelf';
import { SHELF_LEDE } from '@/lib/nav/families';
import { TabPage } from '@/components/shell/tab-page';

export const dynamic = 'force-dynamic';

/**
 * A dev view of the Play shelf with no session, so the design can be looked at at both widths without an account —
 * the same reason /dev/mode exists for the game modes. It renders the real components, not a mock, so what is
 * reviewed here is what ships.
 */
export default function DevShelfPage() {
  return (
    <TabPage
      eyebrow="Play"
      title="Pick your lane"
      lede={SHELF_LEDE}
      accent="#00E5FF"
    >
      <PlayShelf />
    </TabPage>
  );
}
