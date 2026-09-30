// heardQueue — a value that belongs to a scheduled step, shown only once that step is HEARD (MUSIC-SUITE P10, 2026-09-29).
//
// WHAT WAS WRONG (P6's open item, musicsuite/p6/REPORT.md "Not done" row 1): in song mode the room learns the next
// section when the engine SCHEDULES the bar line (SongPanel's onBar → onSongNow — the scheduler runs up to 100 ms ahead,
// and onBar fires as the previous bar's last step is scheduled), and the PERFORM lanes and the read-only grid drew from
// that at once. Measured live in P6: at 5 of 5 section changes the next section's chart was on screen 233–255 ms before
// its bar was heard. The judge was right (it offers notes by the scheduled step); only the picture ran ahead.
//
// The fix follows P6's own fix for the bar number (perfBarQueueRef): each scheduled step carries the section it was
// scheduled under, and the picture changes when that step is heard (onStepAudible). Tagged with the step's AUDIO time
// rather than kept 1:1 with the steps, because AudioEngine.stop() drops its scheduled list without hearing it — a queue
// kept by count would slip a whole stop's worth; by time, anything left from an earlier run is simply older than the
// next heard step and leaves with it.
export class HeardQueue<T> {
  private q: { at: number; v: T }[] = [];
  constructor(private readonly cap = 512) {}

  /** `v` belongs to the step heard at `at` (audio-clock seconds). */
  push(at: number, v: T): void {
    this.q.push({ at, v });
    if (this.q.length > this.cap) this.q.splice(0, this.q.length - this.cap);
  }

  /** Every entry heard by `at` leaves; the newest of them is returned (null = nothing is heard yet). */
  take(at: number): { v: T } | null {
    let got: { at: number; v: T } | null = null;
    while (this.q.length && this.q[0].at <= at + 1e-9) got = this.q.shift()!;
    return got ? { v: got.v } : null;
  }

  clear(): void { this.q = []; }
  get size(): number { return this.q.length; }
}

/**
 * MUSIC-SUITE P10 FIX (2026-09-29): WHEN A SCHEDULED SECTION IS SHOWN — now, or when its first step is heard. The first
 * cut deferred EVERY change while the engine ran, including SONG MODE switched on mid-play: the room showed nothing
 * (null), so studioEdit.shownSection fell back to the chain's FIRST section — playing bar 6 of A (1–4) → B (5–8), the
 * read-only grid, the lock line ('SONG MODE is playing "A"') and the PERFORM lanes showed A for the ~100–250 ms until
 * B's first step was heard (code reading; before P10 they showed B at once). A change FROM nothing (song mode just
 * switched on) is shown at once — nothing section-shaped was on screen to run ahead of; a change between sections (the
 * bar line P6 measured 233–255 ms early) and back to the grid (song mode off) still wait for the ear. Stopped: at once.
 */
export function sectionShownOnSchedule(shown: string | null, next: string | null, running: boolean): 'now' | 'heard' {
  if (!running) return 'now';
  return shown === null && next !== null ? 'now' : 'heard';
}
