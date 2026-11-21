// lane/online-play: who drives which body, from every page's side.
import { describe, it, expect } from 'vitest';
import { canonicalOf, localCanonical, peerForLocal, SEAT_LAYOUTS } from '../../lib/net/seats';
import { ONLINE_MODES } from '../../server/netd/src/partyRules';

describe('seats', () => {
  it('the layouts name every seat netd hands out (partyRules seatIds)', () => {
    for (const m of ONLINE_MODES) {
      const L = SEAT_LAYOUTS[m.id];
      if (!L) continue;
      expect(m.seatIds, m.id).toBeDefined();
      for (const id of m.seatIds!) expect(canonicalOf(m.id, id), `${m.id} ${id}`).not.toBeNull();
      expect(m.seatIds!.length + 1, m.id).toBe(L.keys.length);
      expect(m.humans, m.id).toBe(L.keys.length);
    }
  });
  it('3v3 seats alternate teams: 2 humans are 1-on-1, 4 are 2 a side, 6 are 3-on-3', () => {
    const L = SEAT_LAYOUTS.threevthree;
    const team = (seat: string) => L.teams[canonicalOf('threevthree', seat)!];
    expect(['h1', 'net1', 'net2', 'net3', 'net4', 'net5'].map((p) => (p === 'h1' ? 0 : team(p)))).toEqual([0, 1, 0, 1, 0, 1]);
  });
  it('each page lays the cast out from its own seat', () => {
    expect(localCanonical('onevone', 'h9')).toEqual([0, 1]);
    expect(localCanonical('onevone', 'foe')).toEqual([1, 0]);
    expect(localCanonical('threevthree', 'net1')).toEqual([3, 4, 5, 0, 1, 2]);
    expect(localCanonical('threevthree', 'net4')).toEqual([2, 0, 1, 3, 4, 5]);
  });
  it('a page finds the human on each of its bodies, and the AI where nobody sits', () => {
    const present = ['h9', 'net1', 'net2'];
    expect(peerForLocal('threevthree', 'h9', 'foe0', present)).toBe('net1');
    expect(peerForLocal('threevthree', 'h9', 'mate0', present)).toBe('net2');
    expect(peerForLocal('threevthree', 'h9', 'foe1', present)).toBeNull();
    // on net1's page its 'foe0' is the host's own body, driven from the host's page
    expect(peerForLocal('threevthree', 'net1', 'foe0', present)).toBe('h9');
    expect(peerForLocal('onevone', 'foe', 'foe', ['h9'])).toBe('h9');
    expect(peerForLocal('onevone', 'h9', 'foe', [])).toBeNull();
  });
});
