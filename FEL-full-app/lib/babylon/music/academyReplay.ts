// REPLAY IN PLACE for the Groove Academy (MUSIC-SUITE P6 phone-replay, 2026-09-26) — owner decision #36: "Phone pad
// through REPLAY: YES, REPLAY IN PLACE in the Academy (the REPLAY-in-place seam), built in P6."
//
// What was wrong (P5 REPORT 'Not done', measured in the code): a PERFORM set ends on GameShell's card (StudioMode endSet →
// onEnd), and the card's REPLAY bumped the shell's gameKey (game-shell.tsx replay → setGameKey) because the Academy
// registered no in-place restart. The remount disposed the whole room — the AudioEngine, and with it <HostLobby>, whose
// unmount disposes the HostSession (host-lobby.tsx, the session effect's cleanup): the paired phone was left
// "Reconnecting…" to a room that no longer existed, and had to scan a NEW code. It also sent the player back through the
// boot splash and its STAGE pick, for a set they had just played.
//
// Now the room registers a restart through the shell's existing seam (components/games/replay-in-place.ts — the one Brain
// Brawl uses; game-shell.tsx is HELD and needs no edit: its replay() already calls a registered restart and skips the
// remount when it answers true). The restart (replayAcademyInPlace, below):
//   * RESETS PERFORM: a fresh PerformSet through the room's ONE way into PERFORM (StudioMode enterPerform — no notes, no
//     score, the calibration re-read), on the STUDIO view where the set is played (TAP / Space / the phone judge there).
//   * RESETS THE TRANSPORT: the engine stopped (stop() takes back every hit not yet sounded; the next PLAY starts on bar 0),
//     PLAYING off, the playhead cleared, and ARM REC off (a remount started with it off — a REPLAY must not start a set
//     that writes every phone hit into the grid). A take still recording is stopped the way the remount's unmount stopped
//     it (it lands in its project).
//   * GIVES THE KEYS BACK: endSet suspends the room's keys while the card covers it; the card is gone.
//   * KEEPS the project (it never touches it — autosave, undo history, the bank on the pads all stay) and THE PHONE ROOM
//     (it has no handle on it at all: no remount, so HostLobby's session is the same object — same room code, the pads
//     still paired), and skips the splash and the stage pick (`started` stays true).
// It answers FALSE — and the shell remounts exactly as before — for:
//   * an ARENA set: one attempt per match (PHASE-6 ARENA CONTRACT (b) — a second start is refused 409 ONE_ATTEMPT), so a
//     REPLAY there is not a new set in this room; what a remounted Arena room says is the Arena lane's, unchanged here;
//   * a room not on screen (the splash still up) or with no engine: nothing to restart in place.
// NOT IN SCOPE: a full page reload still drops the phone (the room code is made fresh by HostSession.start → createRoom;
// a resumable room code is a bigger change — P5 REPORT, decision 4).

/** Why the room cannot restart in place (the shell then remounts, as before), or null when it can. */
export type AcademyReplayRefusal = 'arena' | 'not-shown' | 'no-engine';

export function academyReplayRefusal(s: { arenaSet: boolean; shown: boolean; engine: boolean }): AcademyReplayRefusal | null {
  if (s.arenaSet) return 'arena';
  if (!s.shown) return 'not-shown';
  if (!s.engine) return 'no-engine';
  return null;
}

/**
 * What the restart may touch — and, by what is NOT here, what it may not: there is no project, no store, no phone room.
 * StudioMode fills it from its own state each render.
 */
export interface AcademyReplayRoom {
  arenaSet: boolean;
  /** The splash has let the player in (StudioMode roomShown). */
  shown: boolean;
  /** The room's audio engine (null before it exists). */
  engine: { stop(): void } | null;
  /** A take is recording in the booth (SongPanel). */
  takeRecording: boolean;
  /** SongPanel's STOP TAKE (the take lands in the project it was recorded in). */
  stopTake(): void;
  /** PLAYING off, the playhead cleared, the scheduled-step marks forgotten. */
  transportStopped(): void;
  /** ARM REC off. */
  disarmRec(): void;
  /** The STUDIO view (the set's TAP, keys and phone judge live there). */
  showStudio(): void;
  /** StudioMode's enterPerform: a fresh PerformSet, mode PERFORM, score / combo / judgement / bar reset, clock stamped. */
  enterPerform(): void;
  /** The keys endSet suspended under the card are the room's again. */
  wakeKeys(): void;
}

/** The step names, in order (the tests read the order the restart ran them in). */
export type AcademyReplayStep = 'stop-take' | 'stop-engine' | 'transport' | 'disarm' | 'studio' | 'perform' | 'keys';

/**
 * REPLAY in place: true = restarted (the shell clears its card and does NOT remount), false = the shell remounts as
 * before. `log` (tests) receives each step as it runs.
 */
export function replayAcademyInPlace(room: AcademyReplayRoom, log?: (step: AcademyReplayStep) => void): boolean {
  if (academyReplayRefusal({ arenaSet: room.arenaSet, shown: room.shown, engine: !!room.engine })) return false;
  const step = (s: AcademyReplayStep, fn: () => void): void => { fn(); log?.(s); };
  if (room.takeRecording) step('stop-take', room.stopTake);
  step('stop-engine', () => room.engine!.stop());
  step('transport', room.transportStopped);
  step('disarm', room.disarmRec);
  step('studio', room.showStudio);
  step('perform', room.enterPerform);
  step('keys', room.wakeKeys);
  return true;
}
