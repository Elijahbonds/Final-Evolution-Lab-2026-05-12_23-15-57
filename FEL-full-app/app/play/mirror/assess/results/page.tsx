import { ResultsPage } from '../_components/results-page';

// The Quick Screen's results (SCREEN-SHIP A4-5, A4-6): an address that carries no data. The cards come from this tab's
// memory or sessionStorage; a tab without them (a refresh after "Done, clear my results", a new tab, a deep link) shows
// "Your results aren't saved. Run the screen again", never a guess and never another athlete's screen.
export default function MirrorAssessResultsPage() {
  return <ResultsPage />;
}
