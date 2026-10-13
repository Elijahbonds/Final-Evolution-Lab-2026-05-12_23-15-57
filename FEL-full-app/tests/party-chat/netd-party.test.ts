// PARTY-CHAT (2026-10-13): the netd party's rules, without a socket. Every safety rule the owner set is server-side, so
// it is tested here, on the state machine netd runs (server/netd/src/party.ts) — not on a client that could be modified.
import { describe, it, expect } from 'vitest';
import {
  createParty, connect, disconnect, remove, handle, sweep, isPartyCollectable, stateFor, inviteOnly,
  type Party, type Claims, type Effects,
} from '../../server/netd/src/party';
import {
  PARTY_MAX, PARTY_CODE_ALPHABET, PARTY_CODE_LEN, RESUME_GRACE_MS, KNOCK_TTL_MS, START_COUNTDOWN_MS, RATE, CHAT_MAX_LEN,
  QUICK_CHAT, EMOTES, ONLINE_MODES, parsePartyCode, maskProfanity, isProfane, cleanChatText, cleanPartyName,
} from '../../server/netd/src/partyRules';
import { signTicket, verifyTicket, sealSlip, openSlip, pubFor, TICKET_TTL_MS } from '../../server/netd/src/ticket';
import { MAX_PLAYERS } from '../../server/netd/src/room';
import { CODE_ALPHABET, ROOM_CODE_LEN } from '@/lib/controller-link/codes';

const T0 = 1_000_000;
let n = 0;
const rand = () => `r${(++n).toString(36)}`;
const adult = (name: string): Claims => ({ uid: `uid-${name}`, pub: `pub-${name}`, name, adult: true });
const teen = (name: string): Claims => ({ uid: `uid-${name}`, pub: `pub-${name}`, name, adult: false });

function join(p: Party, c: Claims | null, now = T0, guestName?: string) {
  const r = connect(p, { claims: c, guestName }, now, rand);
  if (!r.ok) throw new Error(`join refused: ${r.reason}`);
  return r.member;
}
/** Every frame of type `t` that reached `peer`. */
const got = (fx: Effects, peer: string, t: string) => fx.out.filter((o) => o.to.includes(peer) && o.msg.t === t).map((o) => o.msg);
const sentAnywhere = (fx: Effects, t: string) => fx.out.filter((o) => o.msg.t === t && o.to.length > 0);

describe('pins', () => {
  it('the party cap is netd MAX_PLAYERS (6)', () => {
    expect(PARTY_MAX).toBe(MAX_PLAYERS);
    expect(PARTY_MAX).toBe(6);
  });
  it('the code alphabet is the controller-link alphabet', () => {
    expect(PARTY_CODE_ALPHABET).toBe(CODE_ALPHABET);
    expect(PARTY_CODE_LEN).toBe(ROOM_CODE_LEN);
  });
  it('a typed or pasted code', () => {
    expect(parsePartyCode('abc-234')).toBe('ABC234');
    expect(parsePartyCode('https://x.app/party/QWE789')).toBe('QWE789');
    expect(parsePartyCode('ABC23')).toBeNull();
    expect(parsePartyCode('ABC10O')).toBeNull();   // 0, 1, O are never in a code
  });
});

describe('joining, presence and the host', () => {
  it('the first in is host; the server assigns peer ids', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA'));
    const b = join(p, adult('BO'));
    expect(p.host).toBe(a.peer);
    expect(a.peer).not.toBe(b.peer);
    const view = stateFor(p, b.peer) as { members: { name: string; host: boolean }[]; host: string };
    expect(view.members.map((m) => m.name)).toEqual(['ANA', 'BO']);
    expect(view.host).toBe(a.peer);
  });

  it('refuses a seventh person', () => {
    const p = createParty('ABC234', T0);
    for (let i = 0; i < PARTY_MAX; i++) join(p, adult(`P${i}`));
    expect(connect(p, { claims: adult('LATE') }, T0, rand)).toEqual({ ok: false, reason: 'full' });
  });

  it('the host leaving hands the crown to the longest-present member; the party lives on', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA')); const b = join(p, adult('BO')); join(p, adult('CY'));
    handle(p, a.peer, { t: 'p_leave' }, T0 + 10, rand);
    expect(p.host).toBe(b.peer);
    expect(p.members.size).toBe(2);
  });

  it('a dropped socket keeps its place (and the crown) for the grace period, then goes', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA')); const b = join(p, adult('BO'));
    disconnect(p, a.peer, T0 + 100);
    expect(p.host).toBe(a.peer);
    sweep(p, T0 + 100 + RESUME_GRACE_MS - 1);
    expect(p.members.has(a.peer)).toBe(true);
    sweep(p, T0 + 100 + RESUME_GRACE_MS + 1);
    expect(p.members.has(a.peer)).toBe(false);
    expect(p.host).toBe(b.peer);
  });

  it('a reload takes the same place back with the stored resume secret', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA')); join(p, adult('BO'));
    disconnect(p, a.peer, T0 + 100);
    const r = connect(p, { claims: adult('ANA'), resume: a.resume }, T0 + 2000, rand);
    expect(r.ok && r.resumed && r.member.peer === a.peer).toBe(true);
    expect(p.host).toBe(a.peer);
    expect(p.members.size).toBe(2);
  });

  it('a wrong resume secret is a new member, not the old one', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA'));
    const r = connect(p, { claims: adult('EVE'), resume: 'not-it' }, T0, rand);
    expect(r.ok && r.member.peer !== a.peer).toBe(true);
  });

  it('only the host kicks, and a kicked account cannot come back', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA')); const b = join(p, adult('BO')); const c = join(p, adult('CY'));
    const notHost = handle(p, b.peer, { t: 'p_kick', peer: c.peer }, T0, rand);
    expect(got(notHost, b.peer, 'p_error')[0]).toMatchObject({ code: 'host_only' });
    expect(p.members.has(c.peer)).toBe(true);
    const fx = handle(p, a.peer, { t: 'p_kick', peer: c.peer }, T0, rand);
    expect(got(fx, c.peer, 'p_kicked')).toHaveLength(1);
    expect(fx.close).toContain(c.peer);
    expect(p.members.has(c.peer)).toBe(false);
    expect(connect(p, { claims: adult('CY') }, T0 + 1, rand)).toEqual({ ok: false, reason: 'banned' });
  });

  it('the host can hand the crown over', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA')); const b = join(p, adult('BO'));
    handle(p, a.peer, { t: 'p_host', peer: b.peer }, T0, rand);
    expect(p.host).toBe(b.peer);
    expect(got(handle(p, a.peer, { t: 'p_host', peer: a.peer }, T0, rand), a.peer, 'p_error')[0]).toMatchObject({ code: 'host_only' });
  });

  it('an empty party is collected after the grace period', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA'));
    remove(p, a.peer, T0 + 1);
    expect(isPartyCollectable(p, T0 + 1 + RESUME_GRACE_MS - 1)).toBe(false);
    expect(isPartyCollectable(p, T0 + 2 + RESUME_GRACE_MS)).toBe(true);
  });

  it('presence: an activity line, cleaned and capped', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA'));
    handle(p, a.peer, { t: 'p_status', activity: '  Playing\n Downtown ' + 'x'.repeat(80) }, T0, rand);
    expect(p.members.get(a.peer)!.activity).toMatch(/^Playing Downtown x+$/);
    expect(p.members.get(a.peer)!.activity!.length).toBeLessThanOrEqual(40);
  });
});

describe('teens: invite-only, presets only, never voice — enforced by the server', () => {
  it('no ticket (a guest, an unknown age) is a teen', () => {
    const p = createParty('ABC234', T0);
    const g = join(p, null, T0, 'kid');
    expect((stateFor(p, g.peer) as { me: { text: boolean; voice: boolean } }).me).toMatchObject({ text: false, voice: false });
  });

  it("A TEEN'S FREE TEXT NEVER REACHES THE ROOM", () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA'));
    const t = join(p, teen('TY'));
    handle(p, a.peer, { t: 'p_admit', peer: t.peer }, T0, rand);
    const fx = handle(p, t.peer, { t: 'p_chat', text: 'meet me at the park' }, T0, rand);
    expect(sentAnywhere(fx, 'p_chat')).toEqual([]);
    expect(JSON.stringify(fx.out)).not.toContain('meet me');
    expect(got(fx, t.peer, 'p_error')[0]).toMatchObject({ code: 'text_adults_only' });
  });

  it('a teen may use quick chat and emotes', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA')); const t = join(p, teen('TY'));
    handle(p, a.peer, { t: 'p_admit', peer: t.peer }, T0, rand);
    expect(got(handle(p, t.peer, { t: 'p_quick', id: 'gg' }, T0, rand), a.peer, 'p_quick')).toHaveLength(1);
    expect(got(handle(p, t.peer, { t: 'p_emote', id: 'fire' }, T0, rand), a.peer, 'p_emote')).toHaveLength(1);
    // but only the fixed ids: a made-up "preset" carrying words is refused
    const fx = handle(p, t.peer, { t: 'p_quick', id: 'meet me at the park' }, T0, rand);
    expect(sentAnywhere(fx, 'p_quick')).toEqual([]);
  });

  it('an adult\'s free text does not reach a teen', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA')); const b = join(p, adult('BO')); const t = join(p, teen('TY'));
    handle(p, a.peer, { t: 'p_admit', peer: t.peer }, T0, rand);
    const fx = handle(p, a.peer, { t: 'p_chat', text: 'hello all' }, T0, rand);
    expect(got(fx, b.peer, 'p_chat')).toHaveLength(1);
    expect(got(fx, t.peer, 'p_chat')).toHaveLength(0);
  });

  it('a teen cannot turn voice on, and cannot signal anyone', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA')); const t = join(p, teen('TY'));
    handle(p, a.peer, { t: 'p_admit', peer: t.peer }, T0, rand);
    handle(p, a.peer, { t: 'p_voice', on: true }, T0, rand);
    const v = handle(p, t.peer, { t: 'p_voice', on: true }, T0, rand);
    expect(got(v, t.peer, 'p_error')[0]).toMatchObject({ code: 'voice_adults_only' });
    expect(p.members.get(t.peer)!.voice).toBe(false);
    const s = handle(p, t.peer, { t: 'p_sig', to: a.peer, data: { kind: 'offer', sdp: 'x' } }, T0, rand);
    expect(sentAnywhere(s, 'p_sig')).toEqual([]);
    // and an adult cannot signal a teen either
    const s2 = handle(p, a.peer, { t: 'p_sig', to: t.peer, data: { kind: 'offer', sdp: 'x' } }, T0, rand);
    expect(got(s2, t.peer, 'p_sig')).toEqual([]);
  });

  it('a party with a teen in it is invite-only: newcomers knock and the host lets them in', () => {
    const p = createParty('ABC234', T0);
    const t = join(p, teen('TY'));                       // a teen's own party
    const a = join(p, adult('ANA'));
    expect(inviteOnly(p)).toBe(true);
    expect(stateFor(p, a.peer)).toMatchObject({ t: 'p_wait' });
    // a knocking member hears nothing and can say nothing
    expect(got(handle(p, a.peer, { t: 'p_quick', id: 'hi' }, T0, rand), a.peer, 'p_error')[0]).toMatchObject({ code: 'waiting' });
    expect((stateFor(p, t.peer) as { knocking: unknown[] }).knocking).toHaveLength(1);
    handle(p, t.peer, { t: 'p_admit', peer: a.peer }, T0, rand);
    expect(stateFor(p, a.peer)).toMatchObject({ t: 'p_state' });
  });

  it('a teen knocks at an adult party too; the host can turn them away', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA'));
    const t = join(p, teen('TY'));
    expect(stateFor(p, t.peer)).toMatchObject({ t: 'p_wait' });
    const fx = handle(p, a.peer, { t: 'p_deny', peer: t.peer }, T0, rand);
    expect(got(fx, t.peer, 'p_denied')).toHaveLength(1);
    expect(p.members.has(t.peer)).toBe(false);
  });

  it('a knock expires', () => {
    const p = createParty('ABC234', T0);
    join(p, adult('ANA')); const t = join(p, teen('TY'));
    const fx = sweep(p, T0 + KNOCK_TTL_MS + 1);
    expect(fx.close).toContain(t.peer);
  });

  it('two adults with no teen: no knocking', () => {
    const p = createParty('ABC234', T0);
    join(p, adult('ANA')); const b = join(p, adult('BO'));
    expect(stateFor(p, b.peer)).toMatchObject({ t: 'p_state' });
  });

  it("nobody is told anyone else's age or account id", () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA')); const t = join(p, teen('TY'));
    handle(p, a.peer, { t: 'p_admit', peer: t.peer }, T0, rand);
    const s = JSON.stringify(stateFor(p, a.peer));
    expect(s).not.toContain('uid-');
    expect(s).not.toMatch(/"adult"/);
  });
});

describe('chat', () => {
  it('adult text is masked server-side, capped, and stamped with the real sender', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA')); const b = join(p, adult('BO'));
    const fx = handle(p, a.peer, { t: 'p_chat', text: 'what the fuck', from: b.peer, name: 'BO' }, T0, rand);
    const line = got(fx, b.peer, 'p_chat')[0];
    expect(line).toMatchObject({ from: a.peer, name: 'ANA', text: 'what the ****' });
    const tooLong = handle(p, a.peer, { t: 'p_chat', text: 'x'.repeat(CHAT_MAX_LEN + 1) }, T0, rand);
    expect(sentAnywhere(tooLong, 'p_chat')).toEqual([]);
  });

  it('rate limit: a burst is allowed, then slow down, then it refills', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA')); const b = join(p, adult('BO'));
    let delivered = 0;
    for (let i = 0; i < RATE.chat.burst + 3; i++) delivered += got(handle(p, a.peer, { t: 'p_chat', text: `m${i}` }, T0, rand), b.peer, 'p_chat').length;
    expect(delivered).toBe(RATE.chat.burst);
    expect(got(handle(p, a.peer, { t: 'p_chat', text: 'later' }, T0 + RATE.chat.perMs, rand), b.peer, 'p_chat')).toHaveLength(1);
  });

  it('a block stops their lines reaching you, both ways, and ends voice between you', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA')); const b = join(p, adult('BO')); const c = join(p, adult('CY'));
    const fx0 = handle(p, a.peer, { t: 'p_block', pub: b.pub }, T0, rand);
    expect(got(fx0, b.peer, 'p_sig')[0]).toMatchObject({ data: { kind: 'bye' } });
    const fx = handle(p, b.peer, { t: 'p_quick', id: 'gg' }, T0, rand);
    expect(got(fx, a.peer, 'p_quick')).toHaveLength(0);
    expect(got(fx, c.peer, 'p_quick')).toHaveLength(1);
    expect(got(handle(p, a.peer, { t: 'p_chat', text: 'hi' }, T0, rand), b.peer, 'p_chat')).toHaveLength(0);
    handle(p, a.peer, { t: 'p_voice', on: true }, T0, rand); handle(p, b.peer, { t: 'p_voice', on: true }, T0, rand);
    expect(sentAnywhere(handle(p, b.peer, { t: 'p_sig', to: a.peer, data: { kind: 'offer' } }, T0, rand), 'p_sig')).toEqual([]);
  });

  it('a report hands the reporter a sealed slip naming the account — and nothing readable', () => {
    const secret = 's3cret';
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA')); const b = join(p, adult('BO'));
    const fx = handle(p, a.peer, { t: 'p_report', peer: b.peer, reason: 'harassment' }, T0, rand, { seal: (s) => sealSlip(s, secret) });
    const slip = got(fx, a.peer, 'p_report_slip')[0].slip as string;
    expect(slip).not.toContain('uid-BO');
    expect(openSlip(slip, secret)).toMatchObject({ reporterUid: 'uid-ANA', reportedUid: 'uid-BO', reason: 'harassment', code: 'ABC234' });
    expect(openSlip(slip, 'other')).toBeNull();
    // no secret configured: a safe no-op slip
    expect(got(handle(p, a.peer, { t: 'p_report', peer: b.peer, reason: 'x' }, T0, rand), a.peer, 'p_report_slip')[0]).toMatchObject({ slip: null });
  });

  it('messages are relayed, never kept: a late joiner gets no history', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA'));
    handle(p, a.peer, { t: 'p_chat', text: 'secret plans' }, T0, rand);
    const r = connect(p, { claims: adult('BO') }, T0 + 1, rand);
    expect(JSON.stringify(r)).not.toContain('secret plans');
    expect(JSON.stringify([...p.members.values()].map((m) => ({ ...m, blocks: [...m.blocks] })))).not.toContain('secret plans');
  });
});

describe('voice signaling', () => {
  it('relays between two adults with voice on, stamped with the sender', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA')); const b = join(p, adult('BO'));
    handle(p, a.peer, { t: 'p_voice', on: true }, T0, rand);
    expect(sentAnywhere(handle(p, a.peer, { t: 'p_sig', to: b.peer, data: { kind: 'offer' } }, T0, rand), 'p_sig')).toEqual([]);   // b not in voice
    handle(p, b.peer, { t: 'p_voice', on: true }, T0, rand);
    const fx = handle(p, a.peer, { t: 'p_sig', to: b.peer, from: 'forged', data: { kind: 'offer', sdp: 'v=0' } }, T0, rand);
    expect(got(fx, b.peer, 'p_sig')[0]).toMatchObject({ from: a.peer, data: { kind: 'offer', sdp: 'v=0' } });
  });
  it('refuses junk and oversized signals', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA')); const b = join(p, adult('BO'));
    handle(p, a.peer, { t: 'p_voice', on: true }, T0, rand); handle(p, b.peer, { t: 'p_voice', on: true }, T0, rand);
    expect(sentAnywhere(handle(p, a.peer, { t: 'p_sig', to: b.peer, data: { kind: 'evil' } }, T0, rand), 'p_sig')).toEqual([]);
    expect(sentAnywhere(handle(p, a.peer, { t: 'p_sig', to: b.peer, data: { kind: 'offer', sdp: 'x'.repeat(20_000) } }, T0, rand), 'p_sig')).toEqual([]);
  });
  it('turning voice off tells the other voice peers to hang up', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA')); const b = join(p, adult('BO'));
    handle(p, a.peer, { t: 'p_voice', on: true }, T0, rand); handle(p, b.peer, { t: 'p_voice', on: true }, T0, rand);
    const fx = handle(p, a.peer, { t: 'p_voice', on: false }, T0, rand);
    expect(got(fx, b.peer, 'p_sig')[0]).toMatchObject({ from: a.peer, data: { kind: 'bye' } });
  });
});

describe('Start together', () => {
  it('only the host starts, only a real online mode, and everyone gets the same room with their own seat', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA')); const b = join(p, adult('BO')); const c = join(p, adult('CY'));
    expect(got(handle(p, b.peer, { t: 'p_start', mode: 'onevone' }, T0, rand), b.peer, 'p_error')[0]).toMatchObject({ code: 'host_only' });
    expect(got(handle(p, a.peer, { t: 'p_start', mode: 'nope' }, T0, rand), a.peer, 'p_error')[0]).toMatchObject({ code: 'bad_mode' });
    const fx = handle(p, a.peer, { t: 'p_start', mode: 'onevone' }, T0, rand);
    const [sa, sb, sc] = [a, b, c].map((m) => got(fx, m.peer, 'p_start')[0] as Record<string, unknown>);
    expect(sa.room).toBe(sb.room); expect(sb.room).toBe(sc.room);
    expect(sa.inMs).toBe(START_COUNTDOWN_MS);
    expect(sb.seat).toBe('foe');                // OneVOneMode reads its remote human as 'foe'
    expect(typeof sa.seat).toBe('string');
    expect(sc.seat).toBeNull();                 // the mode seats two; CY stays in the party
  });
  it('a decliner stays in the party, and their seat passes on', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA')); const b = join(p, adult('BO')); const c = join(p, adult('CY'));
    const start = got(handle(p, a.peer, { t: 'p_start', mode: 'karate' }, T0, rand), b.peer, 'p_start')[0];
    const fx = handle(p, b.peer, { t: 'p_decline', id: start.id }, T0 + 1000, rand);
    expect(got(fx, a.peer, 'p_declined')).toHaveLength(1);
    expect(got(fx, c.peer, 'p_start')[0]).toMatchObject({ seat: 'partner', room: start.room });
    expect(p.members.has(b.peer)).toBe(true);
  });
  it('the host can cancel during the countdown', () => {
    const p = createParty('ABC234', T0);
    const a = join(p, adult('ANA')); const b = join(p, adult('BO'));
    handle(p, a.peer, { t: 'p_start', mode: 'onevone' }, T0, rand);
    expect(got(handle(p, a.peer, { t: 'p_start', mode: 'onevone' }, T0 + 10, rand), a.peer, 'p_error')[0]).toMatchObject({ code: 'starting' });
    expect(got(handle(p, a.peer, { t: 'p_start_cancel' }, T0 + 100, rand), b.peer, 'p_start_cancel')).toHaveLength(1);
    expect(p.start).toBeNull();
  });
  it('every online mode names the peer id its mode reads', () => {
    expect(ONLINE_MODES.map((m) => [m.id, m.guestPeer])).toEqual([['onevone', 'foe'], ['threevthree', 'net1'], ['karate', 'partner']]);
  });
});

describe('the ticket (who is an adult is decided by the app, signed, and verified here)', () => {
  const secret = 'k';
  it('round-trips, and a forged or expired one is teen rules', () => {
    const tok = signTicket({ uid: 'u1', pub: pubFor('u1', secret), name: 'ANA', adult: true, exp: T0 + TICKET_TTL_MS }, secret);
    expect(verifyTicket(tok, secret, T0)).toMatchObject({ uid: 'u1', adult: true });
    expect(verifyTicket(tok, secret, T0 + TICKET_TTL_MS + 1)).toBeNull();
    expect(verifyTicket(tok, 'other', T0)).toBeNull();
    expect(verifyTicket(tok, undefined, T0)).toBeNull();
    const [body, sig] = tok.split('.');
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
    const forged = Buffer.from(JSON.stringify({ ...claims, adult: true, uid: 'u2' })).toString('base64url');
    expect(verifyTicket(`${forged}.${sig}`, secret, T0)).toBeNull();
  });
  it('pub is stable per account and does not contain the id', () => {
    expect(pubFor('user-123', secret)).toBe(pubFor('user-123', secret));
    expect(pubFor('user-123', secret)).not.toContain('user-123');
    expect(pubFor('user-123', secret)).not.toBe(pubFor('user-124', secret));
  });
});

describe('words', () => {
  it('masks strong profanity and slurs, not innocent words', () => {
    expect(maskProfanity('this is shit')).toBe('this is ****');
    expect(maskProfanity('FUUUCK yeah')).toBe('****** yeah');
    expect(maskProfanity('sh1t and @ss')).toBe('**** and ***');
    for (const w of ['assist', 'class', 'cockpit', 'scunthorpe', 'grass', 'hello', 'damn', 'hell', 'niggle']) expect(isProfane(w)).toBe(false);
  });
  it('control characters and bidi overrides are out', () => {
    expect(cleanChatText('a‮b\u0007c')).toBe('a b c');
    expect(cleanChatText('   ')).toBeNull();
  });
  it('names follow the jersey plate rule', () => {
    expect(cleanPartyName('  ana <script>  ')).toBe('ANA SCRIPT');
    expect(cleanPartyName('x'.repeat(30))).toHaveLength(12);
  });
  it('every preset has an id and text; emotes have a label for screen readers', () => {
    expect(new Set(QUICK_CHAT.map((q) => q.id)).size).toBe(QUICK_CHAT.length);
    expect(EMOTES.every((e) => e.label.length > 0)).toBe(true);
  });
});
