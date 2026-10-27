// door — the ONE front door to measuring a vertical (VERTICAL-EASY, 2026-10-27; owner: "It needs to be way easier to
// measure vertical"). Every "measure your jump" link in the app goes here: the Quick Screen's jump-only run, which asks
// its own age question first (under 18: no camera, lib/screen/store.ts cameraAllowed) and sends nothing. Linked from
// Play (the signed-in home), the signed-out landing, and Train — one tap from each.
//
// Written as a literal so lib/nav/reachability.test.ts, which reads link literals, sees it.
export const MEASURE_VERTICAL_HREF = '/play/mirror/assess?run=jump';
