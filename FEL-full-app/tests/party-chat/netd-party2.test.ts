// lane/online-play (party2, ADDITIVE): six-seat 3v3 with named seats, a seat order for "winners stay on", and match results.
// The state machine netd runs (server/netd/src/party.ts), no socket.
import { describe, it, expect } from 'vitest';
import { createParty, connect, handle, type Party, type Claims, type Effects } from '../../server/netd/src/party';
import { ONLINE_MODES, PARTY_FEATURES, START_COUNTDOWN_MS, humansFor, onlineMode } from '../../server/netd/src/partyRules';

const T0 = 2_000_000;
let n = 0;
const rand = () => `r${(++n).toString(36)}`;
const adult = (name: string): Claims => ({ uid: `uid-${name}`, pub: `pub-${name}`, name, adult: true });
function join(p: Party, c: Claims) { const r = connect(p, { claims: c }, T0, rand); if (!r.ok) throw new Error(r.reason); return r.member; }
const got = (fx: Effects, peer: string, t: string) => fx.out.filter((o) => o.to.includes(peer) && o.msg.t === t).map((o) => o.msg as Record<string, unknown>);
const six = () => { const p = createParty('ABC234', T0); const ms = ['ANA', 'BO', 'CY', 'DEE', 'ED', 'FAY'].map((x) => join(p, adult(x))); return { p, ms }; };

describe('party2: what the server says it speaks', () => {
  it('party1 and party2', () => { expect(PARTY_FEATURES).toEqual(['party1', 'party2']); });
  it('3v3 seats six on party2 and two on a party1 server; 1v1 two everywhere', () => {
    const t = onlineMode('threevthree')!, o = onlineMode('onevone')!;
    expect(humansFor(t, ['party1', 'party2'])).toBe(6);
    expect(humansFor(t, ['party1'])).toBe(2);
    expect(humansFor(t, [])).toBe(2);
    expect(humansFor(o, [])).toBe(2);
  });
  it('the second seat keeps its old id (an old page and a new one agree on it)', () => {
    for (const m of ONLINE_MODES) if (m.seatIds) expect(m.seatIds[0], m.id).toBe(m.guestPeer);
  });
});

describe('party2: six in a 3v3', () => {
  it('everyone gets a named seat: the host h…, then net1..net5 in join order', () => {
    const { p, ms } = six();
    const fx = handle(p, ms[0].peer, { t: 'p_start', mode: 'threevthree' }, T0, rand);
    const seats = ms.map((m) => got(fx, m.peer, 'p_start')[0].seat);
    expect(String(seats[0])).toMatch(/^h/);
    expect(seats.slice(1)).toEqual(['net1', 'net2', 'net3', 'net4', 'net5']);
  });
  it('1v1 in a party of six: two seats, four stay in the party (unchanged)', () => {
    const { p, ms } = six();
    const fx = handle(p, ms[0].peer, { t: 'p_start', mode: 'onevone' }, T0, rand);
    expect(ms.map((m) => got(fx, m.peer, 'p_start')[0].seat).filter((x) => x !== null)).toHaveLength(2);
  });
});

describe('party2: a seat order (winners stay on)', () => {
  it('the host names who plays: those first, in that order; the rest follow in join order', () => {
    const { p, ms } = six();
    const fx = handle(p, ms[0].peer, { t: 'p_start', mode: 'onevone', order: [ms[3].peer, ms[5].peer] }, T0, rand);
    const seat = (i: number) => got(fx, ms[i].peer, 'p_start')[0].seat;
    expect(String(seat(3))).toMatch(/^h/);   // DEE runs the room
    expect(seat(5)).toBe('foe');             // FAY is the rival
    expect(seat(0)).toBeNull();              // the host sits this one out
  });
  it('an order naming strangers, repeats or junk is ignored where it is wrong', () => {
    const { p, ms } = six();
    const fx = handle(p, ms[0].peer, { t: 'p_start', mode: 'onevone', order: ['nobody', ms[2].peer, ms[2].peer, 7, null] }, T0, rand);
    expect(String(got(fx, ms[2].peer, 'p_start')[0].seat)).toMatch(/^h/);
    expect(got(fx, ms[0].peer, 'p_start')[0].seat).toBe('foe');   // then join order: the host first
  });
  it('MUTATION: without an order the seats are exactly the party1 rule (host first, join order)', () => {
    const { p, ms } = six();
    const fx = handle(p, ms[0].peer, { t: 'p_start', mode: 'onevone' }, T0, rand);
    expect(String(got(fx, ms[0].peer, 'p_start')[0].seat)).toMatch(/^h/);
    expect(got(fx, ms[1].peer, 'p_start')[0].seat).toBe('foe');
  });
});

describe('party2: the match result', () => {
  const started = () => {
    const { p, ms } = six();
    const fx = handle(p, ms[0].peer, { t: 'p_start', mode: 'onevone' }, T0, rand);
    const s = got(fx, ms[0].peer, 'p_start')[0];
    return { p, ms, room: s.room as string, hostSeat: s.seat as string };
  };
  it('a seated page names the winning seats; everyone hears the winners and losers as members', () => {
    const { p, ms, room } = started();
    const fx = handle(p, ms[1].peer, { t: 'p_result', room, winners: ['foe'], score: [11, 7] }, T0 + START_COUNTDOWN_MS + 60_000, rand);
    const r = got(fx, ms[4].peer, 'p_result')[0];
    expect(r.winners).toEqual([ms[1].peer]);
    expect(r.losers).toEqual([ms[0].peer]);
    expect(r.score).toEqual([11, 7]);
  });
  it('once per game; not before it starts; not from a page that sat out; not for another room', () => {
    const { p, ms, room, hostSeat } = started();
    const late = T0 + START_COUNTDOWN_MS + 1000;
    expect(got(handle(p, ms[0].peer, { t: 'p_result', room, winners: [hostSeat] }, T0 + 10, rand), ms[0].peer, 'p_result')).toHaveLength(0);
    expect(got(handle(p, ms[3].peer, { t: 'p_result', room, winners: ['foe'] }, late, rand), ms[3].peer, 'p_result')).toHaveLength(0);
    expect(got(handle(p, ms[0].peer, { t: 'p_result', room: 'pt-other', winners: [hostSeat] }, late, rand), ms[0].peer, 'p_result')).toHaveLength(0);
    expect(got(handle(p, ms[0].peer, { t: 'p_result', room, winners: [hostSeat] }, late, rand), ms[0].peer, 'p_result')).toHaveLength(1);
    expect(got(handle(p, ms[1].peer, { t: 'p_result', room, winners: ['foe'] }, late, rand), ms[1].peer, 'p_result')).toHaveLength(0);
  });
  it('a bad score is dropped, the winners still stand', () => {
    const { p, ms, room } = started();
    const fx = handle(p, ms[1].peer, { t: 'p_result', room, winners: ['foe'], score: ['x', 1] }, T0 + START_COUNTDOWN_MS + 1, rand);
    expect(got(fx, ms[0].peer, 'p_result')[0]).toMatchObject({ winners: [ms[1].peer], score: null });
  });
});
