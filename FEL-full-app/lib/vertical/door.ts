// door — the ONE front door to measuring a vertical (VERTICAL-EASY, 2026-10-27; owner: "It needs to be way easier to
// measure vertical"). The Quick Screen's jump-only run, read arms free (owner: "allow arm swing"), which asks its own age
// question first (under 18: no camera, lib/screen/store.ts cameraAllowed) and sends nothing. Linked from Play (the
// signed-in home), the signed-out landing, Train, the Quick Screen's start card and the Mirror's Jump tab — one tap each.
//
// The hands-on-hips jump check stays at JUMP_CHECK_HREF: its number is the series the server's jump rows hold (the
// profile tile, the daily drill, challenges, verified jumps), so the links that read those rows keep pointing at it.
//
// Written as literals so lib/nav/reachability.test.ts, which reads link literals, sees them.
export const MEASURE_VERTICAL_HREF = '/play/mirror/assess?run=vertical';
export const JUMP_CHECK_HREF = '/play/mirror/assess?run=jump';
