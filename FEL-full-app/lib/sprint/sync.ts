// sync — two phones, one clock (SPRINT-SPEED, 2026-10-25): a start phone and a finish phone, or a phone at each line of
// a flying sprint.
//
// The handshake is NTP's: this phone sends a ping at t0 (its clock), the other stamps it t1 on arrival and t2 as it
// answers, and this phone reads the answer at t3. Then
//   offset = ((t1 − t0) + (t2 − t3)) ÷ 2      (their clock − this one's)
//   delay  = (t3 − t0) − (t2 − t1)            (the round trip on the wire)
// and the offset is wrong by at most delay ÷ 2, whatever the asymmetry. Several pings, and the one with the shortest
// round trip wins. Its half-delay is the ±, as a bound (not an SD).
//
// THE TRANSPORT IS AN ADAPTER (owner brief: "build it only if the existing transport makes it clean"). The app's one
// peer channel is the controller link's WebRTC DataChannel (lib/controller-link: a host and phones that send gameplay
// input, joined through a mode's control schema). A second timing phone would need its own schema row, a host/phone role
// pair and signalling under that link's routes — files another lane holds. So this module is the handshake and the
// merge, against `SyncLink` (send a message, hear messages): a DataChannel, a BroadcastChannel in a test, anything that
// carries JSON both ways. No UI offers two phones yet; docs/SPRINT-SPEED.md §6 says what the wiring takes.
//
// Pure (the handshake awaits only the link it is given).

export interface SyncSample { t0: number; t1: number; t2: number; t3: number }

export function offsetOf(s: SyncSample): { offsetMs: number; delayMs: number } {
  return { offsetMs: ((s.t1 - s.t0) + (s.t2 - s.t3)) / 2, delayMs: (s.t3 - s.t0) - (s.t2 - s.t1) };
}

export type ClockOffset = { ok: true; offsetMs: number; boundMs: number; samples: number } | { ok: false; why: string };

/** The offset from the pings: the shortest round trip's, bounded by its half-delay. */
export function estimateOffset(samples: readonly SyncSample[]): ClockOffset {
  const good = samples.map(offsetOf).filter((x) => Number.isFinite(x.offsetMs) && x.delayMs >= 0);
  if (good.length < 3) return { ok: false, why: 'The phones could not agree a clock. Keep both on the same Wi-Fi and try again.' };
  const best = good.reduce((a, b) => (b.delayMs < a.delayMs ? b : a));
  if (best.delayMs > 400) return { ok: false, why: 'The link between the phones is too slow to time with.' };
  return { ok: true, offsetMs: best.offsetMs, boundMs: best.delayMs / 2, samples: good.length };
}

/** The other phone's time, on this phone's clock. */
export const toLocal = (remoteT: number, offsetMs: number): number => remoteT - offsetMs;

// ── the handshake over a link ──

export type SyncMessage =
  | { type: 'sync.ping'; k: number; t0: number }
  | { type: 'sync.pong'; k: number; t0: number; t1: number; t2: number }
  | { type: 'sync.start'; t: number; sdMs: number; kind: 'go' | 'movement' };

/** Anything that carries JSON both ways between the two phones. */
export interface SyncLink {
  send(msg: SyncMessage): void;
  /** Hear messages; returns the unsubscribe. */
  onMessage(cb: (msg: SyncMessage) => void): () => void;
}

/** The other phone's half: answer every ping with its own clock's arrival and reply stamps. */
export function answerPings(link: SyncLink, now: () => number): () => void {
  return link.onMessage((m) => {
    if (m.type !== 'sync.ping') return;
    const t1 = now();
    link.send({ type: 'sync.pong', k: m.k, t0: m.t0, t1, t2: now() });
  });
}

/** This phone's half: `count` pings `gapMs` apart; resolves with the offset (their clock − this one's). */
export async function measureOffset(link: SyncLink, now: () => number, o: { count?: number; gapMs?: number; timeoutMs?: number; wait?: (ms: number) => Promise<void> } = {}): Promise<ClockOffset> {
  const count = o.count ?? 8, gap = o.gapMs ?? 60, timeout = o.timeoutMs ?? 3000;
  const wait = o.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const got: SyncSample[] = [];
  const off = link.onMessage((m) => { if (m.type === 'sync.pong') got.push({ t0: m.t0, t1: m.t1, t2: m.t2, t3: now() }); });
  try {
    for (let k = 0; k < count; k++) { link.send({ type: 'sync.ping', k, t0: now() }); await wait(gap); }
    const end = now() + timeout;
    while (got.length < count && now() < end) await wait(gap);
  } finally { off(); }
  return estimateOffset(got);
}

/** A start the other phone read, on this phone's clock, its ± widened by the clock's bound. */
export function remoteStart(msg: Extract<SyncMessage, { type: 'sync.start' }>, clock: Extract<ClockOffset, { ok: true }>): { t: number; sdMs: number; reactionIncluded: boolean } {
  // a bound b on a uniform error is an SD of b ÷ √3
  return { t: toLocal(msg.t, clock.offsetMs), sdMs: Math.hypot(msg.sdMs, clock.boundMs / Math.sqrt(3)), reactionIncluded: msg.kind === 'go' };
}
