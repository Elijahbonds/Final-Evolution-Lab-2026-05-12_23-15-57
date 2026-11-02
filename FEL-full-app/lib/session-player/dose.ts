// lib/session-player/dose.ts — PLAT-P01 (2026-10-27): the dose as one big number ("3 × 8", or "30 s") and the words
// that qualify it ("each side"), split from the source's own dose text. Nothing is rewritten: the small part is the
// rest of the source's words, in order.
//
// Pure. Client-safe.
import { isTimed, type Step } from './model';

export interface DoseParts {
  /** The big number: "3 × 8", "3 × 20 m", "30 s", "2 × 20 s". */
  big: string;
  /** The source's remaining words ("each side", "contacts", "fast"), or null. */
  small: string | null;
}

// a leading count (or a range: a coach's "8-10" — PLAT-P06, it split as "8" + "-10"), an optional "x N" (sets of
// N-second reps: "6 x 5 s"), and a short unit (m, s)
const HEAD = /^(\d+(?:\s*[-–]\s*\d+)?(?:\s*[x×]\s*\d+)?(?:\s*(?:m|s|sec)\b)?)[,\s]*(.*)$/i;

const sets = (st: Pick<Step, 'sets'>, head: string): string => (st.sets > 1 ? `${st.sets} × ${head}` : head);

/** The step's dose for the big number. */
export function doseParts(st: Pick<Step, 'sets' | 'reps' | 'workSeconds'>): DoseParts {
  const text = (st.reps ?? '').trim();
  if (isTimed(st)) {
    // the seconds are the number; the source's words after its own "N s" are the qualifier
    const m = /^\d+\s*s\b[,\s]*(.*)$/i.exec(text);
    const small = (m ? m[1] : '').trim();
    return { big: sets(st, `${st.workSeconds} s`), small: small || null };
  }
  const m = HEAD.exec(text);
  if (!m) return { big: sets(st, text || '1'), small: null };
  const head = m[1].replace(/\s*[x×]\s*/i, ' × ').replace(/\s*[-–]\s*/, '-').replace(/\s+/g, ' ');
  return { big: sets(st, head), small: m[2].trim() || null };
}

/** One line for a list ("Goblet Squat to Box · 3 × 8"). */
export const doseLine = (st: Pick<Step, 'sets' | 'reps' | 'workSeconds'>): string => {
  const d = doseParts(st);
  return d.small ? `${d.big} ${d.small}` : d.big;
};

/** A countdown on screen: "45" under a minute, "2:00" from a minute up. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s < 60 ? String(s) : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The finish screen's time: "12:05" (minutes:seconds) or "1:02:05". */
export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
