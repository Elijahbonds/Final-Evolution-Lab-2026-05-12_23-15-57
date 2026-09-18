// FOUR PHONES, ONE BALL — turn order for a shootout (2026-09-13).
//
// Mission Phase C: "Support 4 PAD clients against 1 HOST."
//
// I opened 3PT's lobby to four phones and then checked what the host actually does with them: the input
// callback ignores the slot entirely and funnels every phone into the same InputBus, which drives the ONE
// shooter the mode has. Four phones would have meant four people fighting over one pair of hands — worse
// than admitting one phone, because the lobby would be promising something it could not deliver.
//
// The fix is not gating three people out. A three-point shootout is TURN-BASED in real life: you take your
// racks, your score goes on the board, the next player shoots. So the turn is the mechanic, and this is it.
//
// Pure: no Babylon, no transport. The host component owns the mode; this owns whose turn it is.

export const MAX_SHOOTERS = 4;

export interface Shooter {
  slot: number;
  name: string;
  /** Null until they have taken their turn. */
  score: number | null;
}

export interface ShootoutOrder {
  shooters: Shooter[];
  /** Index into `shooters`, not a slot number. */
  turn: number;
  done: boolean;
}

export function freshOrder(): ShootoutOrder {
  return { shooters: [], turn: 0, done: false };
}

/**
 * Fold the lobby into the running order.
 *
 * Joins are accepted while nobody has shot yet; once the first score is in, a late phone WATCHES rather
 * than being slotted into the middle of a running order. That is the polite version of what a real shootout
 * does — you cannot join a competition after it has started — and it avoids the ugly case where someone
 * joins during player 3's turn and silently changes what "last" means.
 */
export function syncLobby(order: ShootoutOrder, lobby: { slot: number | null; name: string; connected: boolean }[]): ShootoutOrder {
  const started = order.shooters.some((s) => s.score !== null);
  const present = lobby.filter((p) => p.connected && p.slot !== null).slice(0, MAX_SHOOTERS);
  const shooters = order.shooters.slice();
  for (const p of present) {
    const slot = p.slot as number;
    const existing = shooters.find((s) => s.slot === slot);
    if (existing) { existing.name = p.name || existing.name; continue; }
    if (started) continue;                       // the order is locked once the first rack is in the books
    if (shooters.length >= MAX_SHOOTERS) continue;
    shooters.push({ slot, name: p.name || `PLAYER ${slot + 1}`, score: null });
  }
  shooters.sort((a, b) => a.slot - b.slot);
  return { ...order, shooters };
}

/** Whose turn is it? Null when nobody has joined, or when the shootout is over. */
export function activeShooter(order: ShootoutOrder): Shooter | null {
  if (order.done || !order.shooters.length) return null;
  return order.shooters[Math.min(order.turn, order.shooters.length - 1)] ?? null;
}

/**
 * Does this slot drive the game right now?
 *
 * The single question the host's input callback asks. With nobody joined it returns true for everything,
 * so a solo player on a keyboard or a local pad is never gated by a lobby they are not using.
 */
export function slotDrives(order: ShootoutOrder, slot: number): boolean {
  if (!order.shooters.length) return true;
  const active = activeShooter(order);
  return active ? active.slot === slot : false;
}

/** A turn finished with this score. Advances, and finishes the shootout after the last shooter. */
export function recordTurn(order: ShootoutOrder, score: number): ShootoutOrder {
  if (order.done || !order.shooters.length) return order;
  const shooters = order.shooters.map((s, i) => (i === order.turn ? { ...s, score } : s));
  const next = order.turn + 1;
  return { shooters, turn: Math.min(next, shooters.length - 1), done: next >= shooters.length };
}

/** The board, best first. Unshot players sort last, because a blank is not a zero. */
export function standings(order: ShootoutOrder): Shooter[] {
  return order.shooters.slice().sort((a, b) => {
    if (a.score === null && b.score === null) return a.slot - b.slot;
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score;
  });
}

/** The winner, or null while anyone still has a turn to take. */
export function winner(order: ShootoutOrder): Shooter | null {
  if (!order.done) return null;
  const board = standings(order);
  return board[0]?.score === null ? null : board[0] ?? null;
}

/** What the TV says between turns. */
export function turnBanner(order: ShootoutOrder): string {
  if (!order.shooters.length) return '';
  if (order.done) {
    const w = winner(order);
    return w ? `${w.name} WINS — ${w.score}` : 'SHOOTOUT COMPLETE';
  }
  const a = activeShooter(order);
  return a ? `${a.name} — YOU'RE UP` : '';
}

/** What a phone that is not shooting should be told, so waiting never looks like a broken link. */
export function waitingBanner(order: ShootoutOrder, slot: number): string {
  if (slotDrives(order, slot)) return '';
  const a = activeShooter(order);
  const mine = order.shooters.find((s) => s.slot === slot);
  if (mine?.score !== null && mine !== undefined) return `YOU SHOT ${mine.score}`;
  return a ? `${a.name} IS SHOOTING` : 'WAITING';
}
