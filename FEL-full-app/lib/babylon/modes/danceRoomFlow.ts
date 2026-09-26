// lib/babylon/modes/danceRoomFlow.ts — the Cypher's room decisions, pure: when to hold the song, how a resume comes back,
// when the pick screen starts a track by itself, and when a tap in the count-in is already a tap on beat 0.
//
// MUSIC-SUITE P2 FIX PASS (2026-09-25). Phase 2 gave DanceMode a pause (syncHold), a count back in, a pick timeout that
// restarts on every browse and a latency read at the count-in — and none of it had a unit test: no *.test.ts imported
// DanceMode (it builds a Babylon scene), so these transitions were covered only by the browser probe
// scripts/probes/_dance-p2-timing.mts. The decisions are lifted out here, unchanged, and DanceMode calls them; the tests
// (danceRoomFlow.test.ts) drive them in node with the real SongClock and the real DancePerformance.
//
// And one fix, found by the review in the same place: STEP 0 COULD NOT BE HIT EARLY. onInput returned while the room was
// in 'countin', and the room left 'countin' on the first frame whose SONG time had reached beat 0 — but taps are judged
// on the HEARD clock (song − latency). Every shipped chart starts on beat 0 (warm-up, cypher, battle), so a tap up to
// 200 ms early on it (its whole early window) was dropped in silence and the step then expired as a MISS, combo gone
// before the song began. The performance is now started when the count-in is armed (DancePerformance takes a future
// start: update() fires nothing before it, and hit()'s early path takes a step up to MISS_AFTER ahead), and a count-in
// tap is forwarded once it is within that reach of beat 0 (countInTapReaches). Earlier count-in taps stay ignored — they
// are the player counting along, not wild taps.

/** The harness's own phase (ModeHarness ctx.phase()): only 'playing' runs the song. */
export type HarnessPhase = string;
/** The Cypher's phase: choosing a track, the one-bar count-in, or the routine. */
export type RoomPhase = 'pick' | 'countin' | 'playing';

/**
 * What syncHold does this frame:
 *   'pause'              — the song clock holds (and the band and kit take back what they queued into the pause);
 *   'resume-count-back'  — the routine was playing: resume one bar early, with four clicks, taps closed until one judge
 *                          window before the pause point;
 *   'resume-rearm'       — the count-in was running: start it again from the top (the next update arms a fresh one);
 *   'resume'             — the pick screen: carry straight on (nothing is scheduled);
 *   'none'               — nothing changes.
 */
export type HoldAction = 'pause' | 'resume-count-back' | 'resume-rearm' | 'resume' | 'none';

/** The song holds whenever the page is hidden or the harness is not 'playing' (START, the 3-2-1, the results). */
export function holdAction(o: { ended: boolean; hidden: boolean; harnessPhase: HarnessPhase; clockPaused: boolean; roomPhase: RoomPhase }): HoldAction {
  if (o.ended) return 'none';
  const hold = o.hidden || o.harnessPhase !== 'playing';
  if (hold && !o.clockPaused) return 'pause';
  if (!hold && o.clockPaused) return o.roomPhase === 'playing' ? 'resume-count-back' : o.roomPhase === 'countin' ? 'resume-rearm' : 'resume';
  return 'none';
}

/** The first beat of the bar being replayed on a count back (song seconds): where its four clicks begin. */
export function countBackFirstBeat(startAt: number, songNow: number, beatSec: number): number {
  return startAt + Math.ceil((songNow - startAt) / beatSec - 1e-9) * beatSec;
}

/**
 * The pick screen's own clock: it starts the track by itself after `timeoutSec` of nobody touching anything, and every
 * browse starts that wait again (P1 measured the default starting 6.07–6.28 s after wake while d-pad presses at +2, +4
 * and +5.5 s were browsing).
 */
export function pickTimer(sec: number, ev: { type: 'tick'; dt: number } | { type: 'browse' }, timeoutSec: number): { sec: number; start: boolean } {
  if (ev.type === 'browse') return { sec: 0, start: false };
  const next = sec + (Number.isFinite(ev.dt) && ev.dt > 0 ? ev.dt : 0);
  return { sec: next, start: next >= timeoutSec };
}

/**
 * Is a tap during the count-in already a tap on beat 0? Only once the count-in is armed (beat 0 has a time) and the
 * tap's HEARD time is within `missAfter` of it — the early window DancePerformance.hit judges. Earlier taps are the
 * player counting along with the clicks: ignored, never a wild MISS.
 */
export function countInTapReaches(o: { countArmed: boolean; heard: number; startAt: number; missAfter: number }): boolean {
  return o.countArmed && Number.isFinite(o.heard) && o.heard >= o.startAt - o.missAfter;
}
