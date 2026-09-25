// BodySession — what the body does to the GAME (movement play P3, 2026-09-24): starts it, pauses it, lets go.
//
// The floor (lib/input/bodyFloor.ts) turns moves into presses; this turns the body's presence into the session's
// three verbs, the ones every mode gets whether or not its profile binds a single move:
//
//   START    both hands held up, on the floor, for START_HOLD_MS (channels.handsUpMs: a jump's arms are never it — the
//            hold needs every frame grounded, and a take-off or landing told near it resets it). It WAKES a READY game
//            (once calibrated) and RESUMES a paused one, whatever paused it. While playing it does nothing (owner
//            call 3): arms overhead are a move in half the games. The hold must BEGIN in the phase it fires in: arms
//            already up when the game paused, finished loading or came back from GO AGAIN (a new session, the same
//            camera) are raised again, never a START on the first frame. After it, the session stays LATCHED until
//            both hands have been down HANDS_DOWN_MS, and the floor presses nothing while latched: the START pose is
//            not a jump.
//   PAUSE    the body lost while it is the one playing: only in 'playing', only where the body drives the mode at all
//            (a binding or an onBody), only when the latest input the game counted — or the START that began this
//            run — came from the body (a pad player who walks off camera is never paused, P3 Z5), and only once the
//            body has been seen since the last wake / resume. The grace is LOST_PAUSE_MS from the last tracked
//            frame's arrival, AIR_LOST_PAUSE_MS if that frame was in the air (a jump out of the top of the frame comes
//            back down into it); a body back before it cancels it. Frames that stop arriving altogether (a stalled
//            camera) are the STALL watchdog: release, then the same pause — counted in continuous render ticks too,
//            so a hidden tab (no rendering either) is not a stall.
//   RELEASE  the floor lets go on its own after FLOOR_RELEASE_MS without the body; this raises a release for the
//            cases it cannot see (a stall, a final packet, the game leaving 'playing' for any phase) and before every
//            pause, so a mode sees its axes at 0 while it is still 'playing'. A FINAL packet (Body switched off,
//            recalibrate) releases and never pauses.
//
// While PAUSED a body walking back into the frame only changes the overlay's line: it never resumes by itself (a
// passer-by does not restart a game). Resuming is the hands-up hold, or any real press or tap (owner call 2, the
// harness's own paused branch).
//
// Clocks: `now` is the page's clock, and so is a packet's arrivedAt; read.t is the capture clock. Deadlines against
// `now` are set from arrivals (a probe's pushed frame keeps its fixture t, so a capture time set against the page
// clock would read as seconds late), and the START hold is judged against the capture clock it is measured on.
// Pure: no DOM.
//
// MOVEMENT PLAY P3 (2026-09-24, the step-4a review): why presence has a hold, and goes stale. It is only ever SHOWN
// (the READY and PAUSED lines, the Body card); nothing it decides is a pause or a press (the lost pause runs on
// read.tracking). A presence copied from each frame flickered on a single missed detection, in the middle of the
// hands-up hold the ring was showing — the pause line swapped to "Step back into frame" and back, the READY card
// jumped — while the hold itself (channels.handsUpMs) kept counting through the gap. So a body is 'present' until
// PRESENT_HOLD_MS after its last tracked frame, the same gap the hold forgives: the line and the ring now agree. And
// a camera that stops sending (no packet for STALL_MS, counted in render ticks like the watchdog) sees nobody, in
// every phase: tick() turns its last 'present' into 'absent', so no screen says "raise both hands" to a frozen feed.
import type { ModePhase } from './ModeHarness';
import type { BodyPacket } from './InputBus';
import type { BodyPresence } from './sessionStore';
import { MAX_FLIGHT_MS } from '@/lib/pose/BodyReader';
import { OVERHEAD_GAP_MS } from '@/lib/pose/bodyChannels';

export type BodyIntent = 'wake' | 'resume' | 'pause-lost' | 'pause-stall';
export interface SessionStep { release: boolean; intents: BodyIntent[]; latched: boolean; presence: BodyPresence; handsUp01: number }
/** Both hands up this long (ms) is START. */
export const START_HOLD_MS = 800;
/** Both hands down this long (ms) lets go of the START latch. */
export const HANDS_DOWN_MS = 250;
/** A body gone this long (ms, from its last tracked frame) pauses a game it is playing… */
export const LOST_PAUSE_MS = 1200;
/** …or this long when it was last seen in the air: the reader's longest flight and a margin. */
export const AIR_LOST_PAUSE_MS = MAX_FLIGHT_MS + 200;
/** No packet at all for this long (ms) after a tracked one, while the page kept rendering, is a stalled camera… */
export const STALL_MS = 1000;
/** …once at least this many render ticks have passed since that packet… */
export const STALL_TICKS = 20;
/** …spanning at least this long (ms) of continuous rendering: 20 ticks are 333 ms at 60 Hz but 167 ms at 120 Hz, less
 *  than a camera takes to come back when a hidden tab is shown again. */
export const STALL_RENDER_MS = 333;
/** A render tick this long (ms) after the one before means rendering was suspended (a hidden tab): the watchdog's
 *  count starts over. */
export const TICK_GAP_MS = 250;
/** A body stays 'present' this long (capture ms) after its last tracked frame: a missed detection is not a body gone.
 *  The hands-up hold's own gap (bodyChannels), so the line under a hold never says "step back" while its ring fills. */
export const PRESENT_HOLD_MS = OVERHEAD_GAP_MS;

const NONE: readonly BodyIntent[] = [];

export class BodySession {
  private readonly drives: boolean;
  /** Reserved for owner call 3(b) (a long hold that pauses where overhead arms are not a move); unread in P3. */
  readonly overheadIsPlay: boolean;
  private presence: BodyPresence = 'off';
  /** The last tracked frame's capture time: presence holds PRESENT_HOLD_MS past it. */
  private trackT = -Infinity;
  private driver: 'body' | 'external' = 'external';
  /** A tracked frame since the last begin(): the lost pause is armed only for a body this run has seen. */
  private seen = false;
  /** The last tracked frame's arrival (page clock), and whether it was in the air. */
  private lastTrackAt = -Infinity;
  private lastTrackAir = false;
  /** The arrival the current absence counts from (null = the body is here, or no deadline armed). */
  private lostSince: number | null = null;
  private lastTracking = false;
  // the stall watchdog: render ticks since the last packet, in one continuous run of rendering
  private ticks = 0;
  private tickFrom = -Infinity;
  private lastTickAt = -Infinity;
  private stalled = false;
  // the phase as last seen, and the capture time of the first packet read in it (null until one comes): a START hold
  // counts only if it began at or after that frame
  private phase: ModePhase | null = null;
  private phaseReadT: number | null = null;
  // the START hold
  private held = false;        // this hold already fired (re-armed when the hands come down)
  private latched = false;
  private handsUp01 = 0;

  constructor(opts: { drives: boolean; overheadIsPlay: boolean }) {
    this.drives = opts.drives;
    this.overheadIsPlay = opts.overheadIsPlay;
  }

  step(phase: ModePhase, p: BodyPacket, now: number): SessionStep {
    const left = this.notePhase(phase);
    this.ticks = 0;
    this.stalled = false;
    if (p.final) {
      // the source stopped on purpose: let go, forget the body, never pause. The latch goes too: a source that
      // starts again calibrates again, on a still stand, before the floor presses anything.
      this.presence = 'off'; this.trackT = -Infinity;
      this.lostSince = null; this.lastTrackAt = -Infinity; this.lastTracking = false;
      this.held = false; this.latched = false; this.handsUp01 = 0;
      return { release: true, intents: [], latched: false, presence: 'off', handsUp01: 0 };
    }
    const r = p.read, ch = p.channels;
    if (this.phaseReadT === null) this.phaseReadT = r.t;
    // a missed detection inside PRESENT_HOLD_MS is still the body in frame (the header, the step-4a review); a capture
    // clock that went back (a probe feed played again from its start) holds nothing
    if (r.tracking) this.trackT = r.t;
    const sinceTrack = r.t - this.trackT;
    this.presence = !r.calibrated ? 'calibrating' : sinceTrack >= 0 && sinceTrack <= PRESENT_HOLD_MS ? 'present' : 'absent';
    this.lastTracking = r.tracking;
    const intents: BodyIntent[] = [];
    let release = left;
    if (r.tracking) {
      // found (or never gone): any deadline is cancelled
      this.lastTrackAt = p.arrivedAt;
      this.lastTrackAir = r.airborne === true;
      this.lostSince = null;
      this.seen = true;
    } else if (this.lostSince === null && Number.isFinite(this.lastTrackAt)) {
      this.lostSince = this.lastTrackAt;
    }
    if (this.lostDue(phase, now)) { release = true; intents.push('pause-lost'); this.lostSince = null; }

    // ── START: both hands up, held — a hold begun in this phase ──
    const up = ch.handsUpMs;
    if (up <= 0) this.held = false;
    const fresh = r.t - up >= this.phaseReadT;
    const canFire = phase === 'ready' || phase === 'paused';
    this.handsUp01 = canFire && fresh ? Math.min(1, Math.max(0, up) / START_HOLD_MS) : 0;
    if (up >= START_HOLD_MS && !this.held && fresh) {
      if (phase === 'ready' && r.calibrated) { this.held = true; this.latched = true; intents.push('wake'); }
      else if (phase === 'paused') { this.held = true; this.latched = true; intents.push('resume'); }
      // 'playing': nothing (owner call 3); 'error' / 'ended' / 'loading': nothing
    }
    if (this.latched && ch.handsDownMs >= HANDS_DOWN_MS) this.latched = false;
    return { release, intents, latched: this.latched, presence: this.presence, handsUp01: this.handsUp01 };
  }

  /** The render loop, every phase: the lost deadline and the stall watchdog (lastPacketAt = the bus's lastBodyAt()). */
  tick(phase: ModePhase, now: number, lastPacketAt: number): SessionStep {
    let release = this.notePhase(phase);
    if (now - this.lastTickAt > TICK_GAP_MS) this.ticks = 0;   // rendering was suspended: count from here
    this.lastTickAt = now;
    if (this.ticks === 0) this.tickFrom = now;
    this.ticks++;
    // no packet for STALL_MS over a continuous run of rendering: the camera stopped sending
    const silent = now - lastPacketAt > STALL_MS && this.ticks >= STALL_TICKS && now - this.tickFrom >= STALL_RENDER_MS;
    // …and in any phase its last frame's 'present' is nobody anyone can see now, nor a hold anyone is making (the header)
    if (silent && this.presence === 'present') { this.presence = 'absent'; this.handsUp01 = 0; }
    let intents: BodyIntent[] = NONE as BodyIntent[];
    if (this.lostDue(phase, now)) { release = true; intents = ['pause-lost']; this.lostSince = null; }
    else if (phase === 'playing' && this.lastTracking && !this.stalled && silent) {
      this.stalled = true;
      release = true;
      if (this.armed(phase)) intents = ['pause-stall'];
    }
    return { release, intents, latched: this.latched, presence: this.presence, handsUp01: this.handsUp01 };
  }

  /** Every counted evidence item: the latest one decides who is playing. */
  noteInput(src: 'body' | 'external', _now: number): void {
    this.driver = src;
  }

  /**
   * Wake / resume: the run (re)starts, and whoever started it is the driver until the game counts an input — the body
   * for a hands-up START, a hand for a tap, a key or a pad (a player who resumed with a pad is not paused for walking
   * off). The body must be seen again before its absence can pause.
   */
  begin(_now: number, by: 'body' | 'external'): void {
    this.driver = by;
    this.seen = false;
    this.lostSince = null;
    this.stalled = false;
    this.ticks = 0;
  }

  // ── internals ──

  /** Track the phase; true when the game has just left 'playing' (for any phase: every exit lets the body go). */
  private notePhase(phase: ModePhase): boolean {
    if (phase === this.phase) return false;
    const left = this.phase === 'playing';
    this.phase = phase;
    this.phaseReadT = null;
    return left;
  }

  private armed(phase: ModePhase): boolean {
    return phase === 'playing' && this.drives && this.driver === 'body' && this.seen;
  }

  private lostDue(phase: ModePhase, now: number): boolean {
    if (this.lostSince === null || !this.armed(phase)) return false;
    return now >= this.lostSince + (this.lastTrackAir ? AIR_LOST_PAUSE_MS : LOST_PAUSE_MS);
  }
}
