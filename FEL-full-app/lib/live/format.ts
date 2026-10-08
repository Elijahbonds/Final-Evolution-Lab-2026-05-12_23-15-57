/**
 * lib/live/format.ts
 * ==================
 * Display formatting for a live-stream slot, always in America/Los_Angeles.
 * The schedule is stored as PT wall-clock text (see lib/live/schedule.ts),
 * so formatting it is plain string arithmetic — no Date/Intl/timezone
 * conversion needed, and the output text is identical year-round regardless
 * of whether the instance it describes falls in PDT or PST.
 */

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatHhMm(hhmm: string): string {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** e.g. "Wed 1:00 PM - 3:30 PM PT". Always Pacific time, independent of DST. */
export function formatSlotPT(slot: { dow: number; start: string; end: string }): string {
  const day = WEEKDAY_SHORT[slot.dow] ?? '?';
  return `${day} ${formatHhMm(slot.start)} - ${formatHhMm(slot.end)} PT`;
}
