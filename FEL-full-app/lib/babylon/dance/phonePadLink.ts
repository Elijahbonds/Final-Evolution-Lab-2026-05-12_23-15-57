// phonePadLink — MUSIC-SUITE P9 FIX PASS (2026-09-29): what the Cypher's phone dance pad (dance/ui/DancePhonePad.tsx, a
// React component beside the canvas) tells the room (DanceMode.ts, a Babylon mode) that the InputBus cannot carry.
//
// A phone's press reaches the room as a plain FelInput on the room's own bus (modeBridge.toInputBus) — the same A:down a
// pad sends — so the room could not tell a phone press from a pad press, and two things went wrong (the phase review):
//   * PHONE PRESSES WERE JUDGED WHEN THEY ARRIVED. A phone press crosses Wi-Fi first: a 60 ms round trip judged every
//     phone press ~30 ms late — clean hits dropped from PERFECT (±40 ms) to GREAT, the rush/drag line said "You dragged",
//     and past 60 ms it told the player to recalibrate /play/calibrate, which would move the screen-and-speaker offset for
//     every OTHER input. PERFORM already corrects a free-play phone tap by half its measured round trip (P6,
//     music/phonePad.ts oneWaySec, capped); the Cypher now does the same in FREE PLAY (phonePressBackdateSec). An Arena run
//     never shows the pad at all (a latency correction is not something a staked run can trust — DancePhonePad hides its
//     badge on `?arena=`), so an Arena press is always judged as it arrives, as the rejudge assumes.
//   * THE PICK SCREEN STARTED THE SONG WHILE THE PLAYER WAS PAIRING. Tapping the badge, scanning the QR and loading the
//     page are not bus inputs, and the 6 s auto-start fired mid-pairing (danceRoomFlow.pickTimer's `held`).
//
// How: the pad delivers each phone event through deliver(), which marks it as the phone's for exactly the duration of the
// synchronous bus emit (InputBus.emit → the harness's listener → DanceMode.onInput, all in one call stack), with the
// paired phone's last measured round trip. Module state, one room per page — the same scope the bus itself has.

import { oneWaySec } from '../music/phonePad';

let armed = false;
let current: { rttMs: number | null } | null = null;

export const phonePadLink = {
  /** The player reached for the phone pad (touched its badge) or a phone joined: the pick screen stops starting itself. */
  arm(): void { armed = true; },
  /** The pad left the page (unmounted): nothing is pairing any more. */
  disarm(): void { armed = false; current = null; },
  armed(): boolean { return armed; },
  /** Run `emit` as a PHONE event: DanceMode.onInput reads current() inside it. The mark never outlives the call. */
  deliver(rttMs: number | null | undefined, emit: () => void): void {
    const was = current;
    current = { rttMs: typeof rttMs === 'number' && Number.isFinite(rttMs) ? rttMs : null };
    try { emit(); } finally { current = was; }
  },
  /** The phone event being delivered right now, or null (a pad, the keyboard, touch, the body). */
  current(): { rttMs: number | null } | null { return current; },
};

/**
 * How much earlier than its arrival a phone press is judged: half the paired phone's round trip (music/phonePad.ts
 * oneWaySec — the one PERFORM uses, capped at its MAX_ONE_WAY_MS), in free play only; 0 in an Arena run (see the header)
 * or with no measured round trip. Pure.
 */
export function phonePressBackdateSec(rttMs: number | null | undefined, arena: boolean): number {
  return arena ? 0 : oneWaySec(rttMs);
}
