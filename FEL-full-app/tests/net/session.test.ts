// FEL NETPLAY — session behaviour (2026-09-12), driven through a fake transport so two peers can
// be wired to each other in-process and the asymmetry between authority and client is testable.
import { describe, it, expect } from 'vitest';
import { NetSession } from '../../lib/net/NetSession';
import { TICK_MS, type Intent, type NetMsg, type Transport, type BodyState } from '../../lib/net/protocol';

const intent = (over: Partial<Intent> = {}): Intent => ({
  moveX: 0, moveY: 0, sprint: false, action: false, actionHeld: 0, pass: false, steal: false, ...over,
});

/** A pair of transports wired to each other, with a controllable clock. */
function wire() {
  const handlers: Array<(m: NetMsg) => void> = [];
  const sent: NetMsg[] = [];
  let t = 100_000;
  const make = (): Transport => ({
    send: (m) => { sent.push(m); for (const h of handlers) h(m); },
    onMessage: (h) => { handlers.push(h); },
    close: () => {},
  });
  return { make, sent, now: () => t, advance: (ms: number) => { t += ms; }, handlers };
}

describe('roles are asymmetric by design', () => {
  it('an authority simulates from input and ignores foreign snapshots', () => {
    const w = wire();
    const host = new NetSession({ transport: w.make(), selfId: 'host', isAuthority: true, now: w.now });
    // a client's input arrives
    host['receive']({ t: 'input', from: 'guest', tick: host.tickNow(), intent: intent({ sprint: true }), sent: w.now() });
    expect(host.intentFor('guest')?.sprint).toBe(true);
    // an authority never renders someone else's world
    expect(host.renderBodies()).toEqual([]);
  });

  it('a client ignores raw input and waits for the snapshot, so peers cannot disagree', () => {
    const w = wire();
    const client = new NetSession({ transport: w.make(), selfId: 'guest', isAuthority: false, now: w.now });
    client['receive']({ t: 'input', from: 'other', tick: 0, intent: intent({ sprint: true }), sent: w.now() });
    // nothing was queued to simulate from
    expect(client.intentFor('other')).toBeNull();
  });
});

describe('sending', () => {
  it('sends at most one input per tick, not once per rendered frame', () => {
    const w = wire();
    const s = new NetSession({ transport: w.make(), selfId: 'me', isAuthority: false, now: w.now });
    s.sendLocalIntent(intent({ moveX: 1 }));
    s.sendLocalIntent(intent({ moveX: 1 }));   // same tick, 60fps second frame
    expect(w.sent.filter((m) => m.t === 'input')).toHaveLength(1);
    w.advance(TICK_MS + 1);
    s.sendLocalIntent(intent({ moveX: 1 }));
    expect(w.sent.filter((m) => m.t === 'input')).toHaveLength(2);
  });

  it('a non-authority never publishes a world', () => {
    const w = wire();
    const s = new NetSession({ transport: w.make(), selfId: 'me', isAuthority: false, now: w.now });
    s.publish(() => [{ id: 'me', x: 1, y: 0, z: 0, yaw: 0, speed: 0 }]);
    expect(w.sent.filter((m) => m.t === 'snap')).toHaveLength(0);
  });

  it('the authority publishes the world once per tick', () => {
    const w = wire();
    const s = new NetSession({ transport: w.make(), selfId: 'host', isAuthority: true, now: w.now });
    const bodies = (): BodyState[] => [{ id: 'host', x: 2, y: 0, z: 3, yaw: 0, speed: 1 }];
    s.publish(bodies); s.publish(bodies);
    expect(w.sent.filter((m) => m.t === 'snap')).toHaveLength(1);
  });
});

describe('a client renders the authority\'s world, slightly in the past', () => {
  it('is empty until snapshots arrive, so a caller keeps its own pose rather than snapping to origin', () => {
    const w = wire();
    const c = new NetSession({ transport: w.make(), selfId: 'guest', isAuthority: false, now: w.now });
    expect(c.renderBodies()).toEqual([]);
  });

  it('interpolates between snapshots once it has them', () => {
    const w = wire();
    const c = new NetSession({ transport: w.make(), selfId: 'guest', isAuthority: false, now: w.now });
    for (let tick = 0; tick <= 12; tick++) {
      c['receive']({
        t: 'snap', from: 'host', tick, sent: w.now(),
        bodies: [{ id: 'host', x: tick, y: 0, z: 0, yaw: 0, speed: 1 }], ack: {},
      });
    }
    const drawn = c.renderBodies();
    expect(drawn).toHaveLength(1);
    // rendered behind the newest tick (12) by the render delay, never ahead of it
    expect(drawn[0].x).toBeLessThan(12);
    expect(drawn[0].x).toBeGreaterThan(0);
  });
});

describe('authority handover', () => {
  it('a promoted client starts publishing and stops rendering foreign worlds', () => {
    const w = wire();
    const c = new NetSession({ transport: w.make(), selfId: 'guest', isAuthority: false, now: w.now });
    c.setAuthority(true);
    w.advance(TICK_MS + 1);
    c.publish(() => [{ id: 'guest', x: 0, y: 0, z: 0, yaw: 0, speed: 0 }]);
    expect(w.sent.filter((m) => m.t === 'snap')).toHaveLength(1);
    expect(c.renderBodies()).toEqual([]);
  });
  it('setting the same role twice is a no-op', () => {
    const w = wire();
    const s = new NetSession({ transport: w.make(), selfId: 'a', isAuthority: true, now: w.now });
    s.setAuthority(true);
    expect(s.isAuthority).toBe(true);
  });
});

describe('peers and health', () => {
  it('tracks peers from traffic and forgets them on bye', () => {
    const w = wire();
    const s = new NetSession({ transport: w.make(), selfId: 'me', isAuthority: true, now: w.now });
    s['receive']({ t: 'input', from: 'them', tick: 0, intent: intent(), sent: w.now() });
    expect(s.peers).toContain('them');
    s['receive']({ t: 'bye', from: 'them' });
    expect(s.peers).not.toContain('them');
  });
  it('never counts itself as a peer', () => {
    const w = wire();
    const s = new NetSession({ transport: w.make(), selfId: 'me', isAuthority: true, now: w.now });
    s['receive']({ t: 'input', from: 'me', tick: 0, intent: intent(), sent: w.now() });
    expect(s.peers).not.toContain('me');
  });
});
