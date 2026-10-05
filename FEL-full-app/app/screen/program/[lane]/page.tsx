import { notFound } from 'next/navigation';
import { isCoachStoreEnabled } from '@/lib/flags';
import { LANE_SLUGS, isLaneSlug } from '@/lib/screen/PROPOSED-program-lanes';
import { AdultDunkLane } from './adult-dunk';
import { ProgramLane } from './program-lane';

/**
 * /screen/program/[lane] — the Dunk Program's sample page for one lane (SCREEN-SHIP A3-4, A4-3). The address carries
 * ONLY the lane: the flag and the results are read from this tab's sessionStorage, never from the URL. Three lanes,
 * built ahead; any other slug is a 404 (notFound), not a guess. Open to guests; no sign-in wall.
 */
export const dynamicParams = false;
export function generateStaticParams() {
  return LANE_SLUGS.map((lane) => ({ lane }));
}

export default function ProgramLanePage({ params }: { params: { lane: string } }) {
  if (!isLaneSlug(params.lane)) notFound();
  if (params.lane === 'dunking' && isCoachStoreEnabled()) return <AdultDunkLane lane={params.lane} />;
  return <ProgramLane lane={params.lane} />;
}
