// FN-0 COUCH-HOST-SEATS (2026-10-19): the couch's seat rule — 1 to 4 seats, pads first, a 5th joiner waits.
import { describe, expect, it } from 'vitest';
import {
  COUCH_ROOM_PHONES, COUCH_SEATS, CouchSession, couchActive, couchSeatCount, couchSeatTable, enterCouch, subscribeCouch,
  type PadIn, type PhoneIn,
} from './seats';

const pad = (slot: number): PadIn => ({ slot, name: 'Xbox Wireless Controller' });
const phone = (peerId: string, slot: number, name = peerId): PhoneIn => ({ peerId, name, slot, ready: true, connected: true });

describe('couch seats', () => {
  it('seats 1 to 4, and the count the mode reads follows', () => {
    expect(COUCH_SEATS).toBe(4);
    for (let n = 1; n <= 4; n++) {
      const t = couchSeatTable([], Array.from({ length: n }, (_, i) => phone(`p${i}`, i)));
      expect(t.seats).toHaveLength(n);
      expect(t.waiting).toHaveLength(0);
      expect(couchSeatCount(t)).toBe(n);
      expect(t.seats.map((s) => s.label)).toEqual(Array.from({ length: n }, (_, i) => `P${i + 1}`));
    }
  });

  it('an empty couch still counts the host as one seat', () => {
    expect(couchSeatCount(couchSeatTable([], []))).toBe(1);
  });

  it('pads sit first in slot order, phones after them in join order', () => {
    const t = couchSeatTable([pad(1), pad(0)], [phone('b', 1, 'Leo'), phone('a', 0, 'Mia')]);
    expect(t.seats.map((s) => [s.label, s.kind, s.key])).toEqual([
      ['P1', 'pad', 'pad:0'], ['P2', 'pad', 'pad:1'], ['P3', 'phone', 'phone:a'], ['P4', 'phone', 'phone:b'],
    ]);
    expect(t.seats.map((s) => s.name)).toEqual(['XBOX PAD', 'XBOX PAD', 'Mia', 'Leo']);
  });

  it('a 5th joiner waits, and sits down when a seat opens', () => {
    const s = new CouchSession();
    let t = s.seat([pad(0), pad(1)], [phone('a', 0), phone('b', 1), phone('c', 2)]);
    expect(t.seats).toHaveLength(4);
    expect(t.waiting.map((w) => [w.key, w.label, w.index])).toEqual([['phone:c', 'NEXT', null]]);
    expect(s.seatOfPhone('c')).toBeNull();
    expect(s.seatCount()).toBe(4);
    t = s.seat([pad(0), pad(1)], [phone('a', 0), phone('c', 2)]);   // b leaves
    expect(t.waiting).toHaveLength(0);
    expect(s.seatOfPhone('c')).toBe(3);
  });

  it('a 5th phone can connect to wait (the room holds one past the seats); a pad pressed late pushes the phones down', () => {
    expect(COUCH_ROOM_PHONES).toBe(5);
    const phones = ['a', 'b', 'c', 'd', 'e'].map((id, i) => phone(id, i));
    const t = couchSeatTable([], phones);
    expect(t.seats.map((x) => x.key)).toEqual(['phone:a', 'phone:b', 'phone:c', 'phone:d']);
    expect(t.waiting.map((x) => x.key)).toEqual(['phone:e']);
    const withPad = couchSeatTable([pad(0)], phones.slice(0, 4));
    expect(withPad.seats[0].key).toBe('pad:0');
    expect(withPad.waiting.map((x) => x.key)).toEqual(['phone:d']);
  });

  it('end() forgets every seat', () => {
    const s = new CouchSession();
    s.seat([pad(0)], [phone('a', 0, 'Grandma')]);
    s.end();
    expect(s.current()).toEqual({ seats: [], waiting: [] });
    expect(s.seatOfPhone('a')).toBeNull();
    expect(s.seatCount()).toBe(1);
  });

  it('the couch flag is on while any couch is open, and each closer closes only its own', () => {
    const seen: boolean[] = [];
    const off = subscribeCouch(() => seen.push(couchActive()));
    expect(couchActive()).toBe(false);
    const a = enterCouch();
    const b = enterCouch();
    a(); a();
    expect(couchActive()).toBe(true);
    b();
    expect(couchActive()).toBe(false);
    off();
    expect(seen).toEqual([true, true, true, false]);
  });
});
