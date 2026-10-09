import { isCoachStoreEnabled } from '@/lib/flags';
import { ResultsPage } from '../_components/results-page';
import { AdultTrainResults } from './adult-train';

// The Quick Screen's results (SCREEN-SHIP A4-5, A4-6): an address that carries no data. The cards come from this tab's
// memory or sessionStorage; a tab without them (a refresh after "Done, clear my results", a new tab, a deep link) shows
// "Your results aren't saved. Run the screen again", never a guess and never another athlete's screen.
// Train with Elijah is added by the server only when the store is on and the account is a verified adult.
export default function MirrorAssessResultsPage() {
  if (isCoachStoreEnabled()) return <AdultTrainResults />;
  return <ResultsPage />;
}
