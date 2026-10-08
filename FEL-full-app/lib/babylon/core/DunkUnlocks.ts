// DunkUnlocks — what winning nights and beating challenges open, kept on the device (dunk-next phase 6, 2026-10-06).
//
// Owner, 2026-10-06: "unlocks earned by winning nights (props, courts, celebrations) stored on the device (no DB). Presentation of
// unlocks only; no new currency or payout (the economy is another owner's)." Fans asked for something to chase (fan list #11):
// every prop and celebration was open from the first night.
//
// What it does: a short ladder of the contest's showpieces opens with WON NIGHTS (and one celebration with beaten challenges). A
// locked prop is passed over on the ring and NAMED with what opens it, never silently missing; a locked d-pad celebration says the
// same — and the building still throws it on its own after a big dunk, so you see what you are chasing. The night card says what a
// win just opened, or what the next one is.
// What it never does: pay anything, cost anything, or touch the score, the staked card or the server. Courts are NOT gated here: the
// court is picked in the lobby (another lane's), so a court unlock would be a promise this file cannot keep.
// The SEASON-PASS specials (core/SeasonSpecials) are the economy's and are never on this ladder.
//
// Storage: one small JSON in localStorage. Private mode, cleared storage or a throwing accessor read as a fresh device; a corrupt
// value never throws into the mode. Pure apart from the two storage helpers, which take the storage as an argument.

export type UnlockKind = 'prop' | 'celebration';
export interface DunkUnlock {
  id: string;
  kind: UnlockKind;
  /** the prop ids / celebration id it opens */
  refs: readonly string[];
  label: string;
  /** what opens it: won nights, or beaten challenges */
  need: { nights?: number; challenges?: number };
}

/** TUNED (dunk-next phase 6): the ladder. Conservative: the everyday vocabulary (no prop, the plain oop, the self-lobs, the car, the
 *  three in a row, Dubble Up 1–5, the roar, too small) stays open; the exotic end opens one win at a time. */
export const DUNK_UNLOCKS: readonly DunkUnlock[] = [
  { id: 'prop:oopbounce', kind: 'prop', refs: ['oopbounce'], label: 'THE BOUNCE OOP', need: { nights: 1 } },
  { id: 'celeb:itsover', kind: 'celebration', refs: ['itsover'], label: "IT'S OVER — YOURS TO CALL ON THE D-PAD", need: { nights: 2 } },
  { id: 'prop:row5', kind: 'prop', refs: ['row5'], label: 'OVER FIVE IN A ROW', need: { nights: 3 } },
  { id: 'prop:dubble6', kind: 'prop', refs: ['dubble6', 'dubble7', 'dubble8', 'dubble9', 'dubble10'], label: 'THE DUBBLE UP OVER 6 TO 10', need: { nights: 4 } },
  { id: 'prop:oopcorner', kind: 'prop', refs: ['oopcorner'], label: 'THE OOP OFF THE BUS', need: { nights: 5 } },
  { id: 'celeb:splits', kind: 'celebration', refs: ['spiderman'], label: 'THE SPLITS — YOURS TO CALL ON THE D-PAD', need: { challenges: 2 } },
] as const;

export interface UnlockState {
  v: 1;
  nightsWon: number;
  /** challenge id → best card */
  best: Record<string, number>;
  /** challenges cleared at least once */
  beaten: string[];
}

export function emptyUnlocks(): UnlockState { return { v: 1, nightsWon: 0, best: {}, beaten: [] }; }

const whole = (v: unknown, max = 1e6): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);

/** Read a stored state back. Anything malformed degrades to what can be read, never a throw. */
export function parseUnlocks(raw: unknown): UnlockState {
  let o: unknown = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { return emptyUnlocks(); } }
  if (!o || typeof o !== 'object') return emptyUnlocks();
  const r = o as Record<string, unknown>;
  if (r.v !== 1) return emptyUnlocks();
  const best: Record<string, number> = {};
  if (r.best && typeof r.best === 'object') for (const [k, v] of Object.entries(r.best as Record<string, unknown>)) if (k.length <= 32) best[k] = whole(v, 100);
  const beaten = Array.isArray(r.beaten) ? [...new Set(r.beaten.filter((x): x is string => typeof x === 'string' && x.length <= 32))].slice(0, 64) : [];
  return { v: 1, nightsWon: whole(r.nightsWon), best, beaten };
}

/** Is this unlock open for this state? */
export function isOpen(u: DunkUnlock, s: UnlockState): boolean {
  return s.nightsWon >= (u.need.nights ?? 0) && s.beaten.length >= (u.need.challenges ?? 0);
}

/** Every unlock open now. */
export function openUnlocks(s: UnlockState): DunkUnlock[] { return DUNK_UNLOCKS.filter((u) => isOpen(u, s)); }

/** Is this prop / celebration usable? Anything not on the ladder is always open. */
export function refOpen(kind: UnlockKind, ref: string, s: UnlockState): boolean {
  const u = DUNK_UNLOCKS.find((x) => x.kind === kind && x.refs.includes(ref));
  return !u || isOpen(u, s);
}

/** What opens it, in words: "WIN 2 MORE NIGHTS" / "BEAT 1 MORE CHALLENGE". '' when open or not on the ladder. */
export function needLine(kind: UnlockKind, ref: string, s: UnlockState): string {
  const u = DUNK_UNLOCKS.find((x) => x.kind === kind && x.refs.includes(ref));
  if (!u || isOpen(u, s)) return '';
  const nights = Math.max(0, (u.need.nights ?? 0) - s.nightsWon), ch = Math.max(0, (u.need.challenges ?? 0) - s.beaten.length);
  const bits = [nights ? `WIN ${nights} MORE NIGHT${nights > 1 ? 'S' : ''}` : '', ch ? `BEAT ${ch} MORE CHALLENGE${ch > 1 ? 'S' : ''} ON THE PRACTICE RUNWAY` : ''].filter(Boolean);
  return `LOCKED — ${u.label.split(' — ')[0]} · ${bits.join(' AND ')}`;
}

/** The next unlock still to come, and how far off it is (for the night card). */
export function nextUnlockLine(s: UnlockState): string {
  const u = DUNK_UNLOCKS.find((x) => !isOpen(x, s));
  if (!u) return 'EVERYTHING IS OPEN';
  const nights = Math.max(0, (u.need.nights ?? 0) - s.nightsWon), ch = Math.max(0, (u.need.challenges ?? 0) - s.beaten.length);
  return `NEXT: ${u.label.split(' — ')[0]} — ${nights ? `WIN ${nights} MORE NIGHT${nights > 1 ? 'S' : ''}` : `BEAT ${ch} MORE CHALLENGE${ch > 1 ? 'S' : ''}`}`;
}

function diff(before: UnlockState, after: UnlockState): DunkUnlock[] {
  return DUNK_UNLOCKS.filter((u) => !isOpen(u, before) && isOpen(u, after));
}

/** A night won: one more on the count, and what it just opened. Never mutates `s`. */
export function recordNightWon(s: UnlockState): { state: UnlockState; opened: DunkUnlock[] } {
  const state: UnlockState = { ...s, nightsWon: s.nightsWon + 1 };
  return { state, opened: diff(s, state) };
}

/** A challenge attempt judged: its best card kept, and cleared ones remembered; what that opened. Never mutates `s`. */
export function recordChallenge(s: UnlockState, id: string, total: number, cleared: boolean): { state: UnlockState; opened: DunkUnlock[] } {
  const best = { ...s.best, [id]: Math.max(s.best[id] ?? 0, whole(total, 100)) };
  const beaten = cleared && !s.beaten.includes(id) ? [...s.beaten, id] : s.beaten;
  const state: UnlockState = { ...s, best, beaten };
  return { state, opened: diff(s, state) };
}

// ── the device ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const UNLOCKS_KEY = 'fel.dunk.unlocks.v1';
export interface KeyStore { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** The device's state (a fresh one when storage is missing, blocked or corrupt). */
export function loadUnlocks(store: KeyStore | null | undefined): UnlockState {
  try { return store ? parseUnlocks(store.getItem(UNLOCKS_KEY)) : emptyUnlocks(); } catch { return emptyUnlocks(); }
}
/** Keep it on the device. False when storage refused (the night still plays; the unlock lives for this visit). */
export function saveUnlocks(store: KeyStore | null | undefined, s: UnlockState): boolean {
  try { if (!store) return false; store.setItem(UNLOCKS_KEY, JSON.stringify(s)); return true; } catch { return false; }
}

/** Dev only: `?unlocks=all` opens the ladder, `?unlocks=0` reads the device; an agent run (`?agent=1`, the probes) is open unless
 *  `?unlocks=0`, so a probe that steps the whole prop ring keeps working on a fresh profile. */
export function devUnlockOverride(search: string): 'all' | 'device' | null {
  try {
    const q = new URLSearchParams(search);
    const v = q.get('unlocks');
    if (v === 'all' || v === '1') return 'all';
    if (v === '0' || v === 'device') return 'device';
    if (q.get('agent') === '1') return 'all';
  } catch { /* no url */ }
  return null;
}

/** Every unlock open (the dev override's state). */
export function allOpen(): UnlockState {
  const nights = Math.max(...DUNK_UNLOCKS.map((u) => u.need.nights ?? 0));
  const ch = Math.max(...DUNK_UNLOCKS.map((u) => u.need.challenges ?? 0));
  return { v: 1, nightsWon: nights, best: {}, beaten: Array.from({ length: ch }, (_, i) => `dev-${i}`) };
}
