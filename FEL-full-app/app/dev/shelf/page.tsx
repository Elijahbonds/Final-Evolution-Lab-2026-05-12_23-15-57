import { PlayShelf } from '@/components/shell/play-shelf';
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
      lede="Seven families, twenty-eight modes. Open one to see what is inside."
      accent="#00E5FF"
    >
      <PlayShelf />
    </TabPage>
  );
}
