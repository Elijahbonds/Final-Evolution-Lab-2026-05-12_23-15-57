// fel-netd room rules (2026-09-12). The point of a server-held room is that a match outlives
// any one player's browser, so the handover cases are the ones that matter most here.
import { describe, it, expect } from 'vitest';
import {
  createRoom, join, leave, touch, reap, isCollectable, tickAt, ackMap,
  MAX_PLAYERS, PEER_TIMEOUT_MS, EMPTY_ROOM_TTL_MS,
} from '../../server/netd/src/room';

const T0 = 1_000_000;

describe('joining', () => {
  it('the first peer in holds authority', () => {
    const r = createRoom('r1', 'onevone', T0);
    expect(join(r, 'a', T0)).toMatchObject({ ok: true, isAuthority: true });
    expect(join(r, 'b', T0 + 10)).toMatchObject({ ok: true, isAuthority: false });
    expect(r.authority).toBe('a');
  });
  it('refuses a duplicate rather than silently reseating them', () => {
    const r = createRoom('r1', 'onevone', T0);
    join(r, 'a', T0);
    expect(join(r, 'a', T0 + 1)).toEqual({ ok: false, reason: 'duplicate' });
  });
  it('refuses past capacity', () => {
    const r = createRoom('r1', 'carnival', T0);
    for (let i = 0; i < MAX_PLAYERS; i++) expect(join(r, `p${i}`, T0 + i).ok).toBe(true);
    expect(join(r, 'one-too-many', T0)).toEqual({ ok: false, reason: 'full' });
  });
});

describe('authority handover - the reason this is server-held at all', () => {
  it('the match survives the host leaving', () => {
    const r = createRoom('r1', 'onevone', T0);
    join(r, 'host', T0); join(r, 'guest', T0 + 5);
    const res = leave(r, 'host', T0 + 100);
    expect(res.changed).toBe(true);
    expect(res.newAuthority).toBe('guest');
    expect(r.peers.size).toBe(1);          // the room is still alive
  });
  it('a non-authority leaving changes nothing', () => {
    const r = createRoom('r1', 'onevone', T0);
    join(r, 'host', T0); join(r, 'guest', T0 + 5);
    expect(leave(r, 'guest', T0 + 100)).toMatchObject({ changed: false, newAuthority: 'host' });
  });
  it('the longest-present peer inherits, which needs no election', () => {
    const r = createRoom('r1', 'carnival', T0);
    join(r, 'host', T0); join(r, 'early', T0 + 5); join(r, 'late', T0 + 50);
    touch(r, 'early', T0 + 60); touch(r, 'late', T0 + 61);
    leave(r, 'host', T0 + 100);
    expect(r.authority).toBe('early');
  });
  it('the last peer out leaves no authority behind', () => {
    const r = createRoom('r1', 'onevone', T0);
    join(r, 'solo', T0);
    expect(leave(r, 'solo', T0 + 10).newAuthority).toBeNull();
  });
  it('leaving a room you were never in is a no-op', () => {
    const r = createRoom('r1', 'onevone', T0);
    join(r, 'a', T0);
    expect(leave(r, 'ghost', T0 + 1)).toMatchObject({ changed: false });
    expect(r.peers.size).toBe(1);
  });
});

describe('reaping the silent', () => {
  it('keeps a peer that is still talking', () => {
    const r = createRoom('r1', 'onevone', T0);
    join(r, 'a', T0);
    touch(r, 'a', T0 + PEER_TIMEOUT_MS - 1);
    expect(reap(r, T0 + PEER_TIMEOUT_MS).dropped).toEqual([]);
  });
  it('drops a peer that has gone quiet, and hands over if it held authority', () => {
    const r = createRoom('r1', 'onevone', T0);
    join(r, 'host', T0); join(r, 'guest', T0 + 5);
    touch(r, 'guest', T0 + PEER_TIMEOUT_MS + 500);
    const res = reap(r, T0 + PEER_TIMEOUT_MS + 1000);
    expect(res.dropped).toEqual(['host']);
    expect(res.authorityChanged).toBe(true);
    expect(r.authority).toBe('guest');
  });
  it('is generous enough for a phone changing networks', () => {
    expect(PEER_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
  });
});

describe('lifecycle', () => {
  it('an empty room is only collectable after its grace period', () => {
    const r = createRoom('r1', 'onevone', T0);
    join(r, 'a', T0); leave(r, 'a', T0 + 10);
    expect(isCollectable(r, T0 + 10)).toBe(false);
    expect(isCollectable(r, T0 + 10 + EMPTY_ROOM_TTL_MS + 1)).toBe(true);
  });
  it('a rejoin inside the grace period saves the room', () => {
    const r = createRoom('r1', 'onevone', T0);
    join(r, 'a', T0); leave(r, 'a', T0 + 10);
    join(r, 'a', T0 + 20);
    expect(isCollectable(r, T0 + 10 + EMPTY_ROOM_TTL_MS + 1)).toBe(false);
  });
});

describe('the shared clock and acks', () => {
  it('derives the tick from the server clock alone', () => {
    const r = createRoom('r1', 'onevone', T0);
    expect(tickAt(r, T0, 33.333)).toBe(0);
    expect(tickAt(r, T0 + 1000, 33.333)).toBe(30);
  });
  it('acks each peer with the highest input tick it has sent', () => {
    const r = createRoom('r1', 'onevone', T0);
    join(r, 'a', T0); join(r, 'b', T0);
    touch(r, 'a', T0 + 1, 12);
    touch(r, 'a', T0 + 2, 9);     // out-of-order arrival must not lower the ack
    touch(r, 'b', T0 + 2, 7);
    expect(ackMap(r)).toEqual({ a: 12, b: 7 });
  });
});
