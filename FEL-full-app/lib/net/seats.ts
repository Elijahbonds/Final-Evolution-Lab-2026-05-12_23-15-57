// FEL NETPLAY — who plays which body (lane/online-play, 2026-11-21). Pure.
//
// A match room's peers are named by netd's "Start together" (server/netd/src/party.ts p_start): the host `h…`, then the mode's
// seat ids in join order (partyRules ONLINE_MODES `seatIds`), watchers `w…`. Every page lays the SAME canonical cast out from its
// own seat, so any page can run the game (1v1 hands it over every possession; 3v3 when the host leaves) and still know which
// human drives which body.
//
//   1v1  canonical [host, foe]                      — the host's rival seat is `foe` (OneVOneMode's sourceFor('foe')).
//   3v3  canonical [host, mate, mate, foe, foe, foe] — the seats ALTERNATE teams, so 2 humans are 1-on-1 with bots, 4 are two a
//        side (VENICE-HUB-PLAN: "a party of 4 plays 2 + 2 bots a side") and 6 are 3-on-3. Before this lane net1 was the FIRST
//        AI seat, mate0 (a teammate). assumption: alternating is the owner's rule for 4, so it is the rule for 2 (net1 is now
//        a rival). Flagged in docs/ONLINE-FINISH-PLAN.md.

export interface SeatLayout {
  /** Canonical body keys, in cast order: [me, my team…, the other team…] from the HOST's side. */
  keys: readonly string[];
  /** Each canonical body's team (0 = the host's). */
  teams: readonly number[];
  /** seat id → canonical index (the host, `h…`, is 0 and not listed). */
  seats: Readonly<Record<string, number>>;
}

export const SEAT_LAYOUTS: Readonly<Record<string, SeatLayout>> = {
  onevone: { keys: ['me', 'foe'], teams: [0, 1], seats: { foe: 1 } },
  threevthree: {
    keys: ['me', 'mate0', 'mate1', 'foe0', 'foe1', 'foe2'], teams: [0, 0, 0, 1, 1, 1],
    seats: { net1: 3, net2: 1, net3: 4, net4: 2, net5: 5 },
  },
};

export const isHostPeer = (peer: string): boolean => /^h/.test(peer);
export const isWatcherPeer = (peer: string): boolean => /^w/.test(peer);

/** The canonical body a peer drives, or null (a watcher, or an id this mode has no seat for). */
export function canonicalOf(mode: string, peer: string): number | null {
  const L = SEAT_LAYOUTS[mode];
  if (!L) return null;
  if (isHostPeer(peer)) return 0;
  return Object.prototype.hasOwnProperty.call(L.seats, peer) ? L.seats[peer] : null;
}

/**
 * This page's cast, in canonical indices: [my body, my team's others, the other team] (the modes spawn [me, mates…, foes…]).
 * A watcher, or a page with no seat, lays it out as the host does.
 */
export function localCanonical(mode: string, self: string): number[] {
  const L = SEAT_LAYOUTS[mode];
  if (!L) return [];
  const mine = canonicalOf(mode, self) ?? 0;
  const team = L.teams[mine];
  const all = [...L.keys.keys()];
  return [mine, ...all.filter((c) => c !== mine && L.teams[c] === team), ...all.filter((c) => L.teams[c] !== team)];
}

/** The peer that drives canonical body `c`, among `present` (null: nobody — an AI plays it). */
export function peerFor(mode: string, c: number, present: Iterable<string>): string | null {
  for (const p of present) if (canonicalOf(mode, p) === c) return p;
  return null;
}

/** The local body key a page's mode spawned for its local cast index i ("me", "mate0", …). */
export function localKeyAt(mode: string, i: number): string | null {
  return SEAT_LAYOUTS[mode]?.keys[i] ?? null;
}

/** For a page's mode: which peer drives its local body `key` (e.g. 'foe0'), among `present`. */
export function peerForLocal(mode: string, self: string, key: string, present: Iterable<string>): string | null {
  const L = SEAT_LAYOUTS[mode];
  if (!L) return null;
  const i = L.keys.indexOf(key);
  if (i < 0) return null;
  const c = localCanonical(mode, self)[i];
  if (c === undefined) return null;
  const p = peerFor(mode, c, present);
  return p === self ? null : p;
}
