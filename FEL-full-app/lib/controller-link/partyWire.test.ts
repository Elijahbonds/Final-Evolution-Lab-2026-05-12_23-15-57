// MULTIPLAYER lane (2026-10-06) — the party room's seams in Controller Link, end to end through the REAL HostSession and
// ControllerClient (only WebRTC and the signaling HTTP are faked, as in roomState.test.ts):
//   * ONE ROOM ACROSS GAMES: setConfig re-sends the lobby (with the new layout) to every connected phone;
//   * the lobby a phone is sent carries no peer ids (another phone's id is the handle that takes its seat back);
//   * a name is cleaned by the host whatever the phone sends (the hello signal and the hello message);
//   * a phone's party command reaches the room's handler and nothing else does; sendTo / setReady / drop;
//   * the phone hands a bounded PartyView to the page, and sends its commands on the reliable channel.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkMessage, LobbyPeer, ModeControllerConfig } from './types';

const fx = vi.hoisted(() => ({
  links: [] as { opts: { onMessage: (m: unknown) => void; onState: (s: string) => void }; safe: unknown[]; fast: unknown[]; closed: boolean; refuse: boolean }[],
  signal: null as null | ((m: { from: string; data: unknown }) => void),
}));
vi.mock('./transport/webrtc', () => ({
  PeerLink: class {
    safe: unknown[] = [];
    fast: unknown[] = [];
    closed = false;
    /** the reliable channel not open yet: sendSafe drops and says so (PeerLink.sendSafe → false) */
    refuse = false;
    opts: { onMessage: (m: unknown) => void; onState: (s: string) => void };
    constructor(opts: { onMessage: (m: unknown) => void; onState: (s: string) => void }) { this.opts = opts; fx.links.push(this); }
    async createOffer() { return { type: 'offer', sdp: '' }; }
    async acceptOffer() { return { type: 'answer', sdp: '' }; }
    async acceptAnswer() { /* */ }
    async addCandidate() { /* */ }
    sendSafe(m: unknown) { if (this.refuse) return false; this.safe.push(m); return true; }
    sendFast(m: unknown) { this.fast.push(m); }
    sendFrame() { return 'dropped'; }
    close() { this.closed = true; }
  },
}));
vi.mock('./transport/signaling', () => ({
  createRoom: async () => 'PARTY2',
  lookupRoom: async (code: string) => ({ code, modeId: 'brainbrawl', players: 0 }),
  postSignal: async () => undefined,
  pollSignals: (_code: string, _self: string, on: (m: { from: string; data: unknown }) => void) => { fx.signal = on; return () => undefined; },
}));

import { HostSession, hostPlayerName } from './host';
import { ControllerClient } from './client';
import { partyControllerConfig } from '@/lib/party/controls';
import { partyModeById } from '@/lib/party/catalog';
import type { PartyView } from '@/lib/party/protocol';

const tick = () => new Promise((r) => setTimeout(r, 0));
const types = (msgs: unknown[]): string[] => msgs.map((m) => (m as LinkMessage).type);
const BRAIN = partyControllerConfig(partyModeById('brainbrawl')!);
const DOWNTOWN = partyControllerConfig(partyModeById('threepoint')!);

beforeEach(() => { fx.links.length = 0; fx.signal = null; vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }); });

async function hostWith(phones: { id: string; name: unknown }[], extra: Partial<ConstructorParameters<typeof HostSession>[0]> = {}) {
  let lobby: LobbyPeer[] = [];
  const cmds: [string, string][] = [];
  const host = new HostSession({ config: BRAIN, onInput: () => undefined, onLobby: (p) => { lobby = p; }, onPartyCmd: (c, id) => cmds.push([c, id]), ...extra });
  expect(await host.start()).toBe('PARTY2');
  const links: Record<string, (typeof fx.links)[number]> = {};
  for (const p of phones) {
    fx.signal!({ from: p.id, data: { hello: { name: p.name } } });
    await tick(); await tick();
    links[p.id] = fx.links[fx.links.length - 1];
    links[p.id].opts.onState('connected');
  }
  return { host, links, lobby: () => lobby, cmds };
}

describe('HostSession: one room across games', () => {
  it('setConfig sends every connected phone the new layout, in a lobby with no peer ids', async () => {
    const { host, links } = await hostWith([{ id: 'peer-one', name: 'Ann' }, { id: 'peer-two', name: 'Bo' }]);
    host.setConfig(DOWNTOWN);
    for (const id of ['peer-one', 'peer-two']) {
      const last = links[id].safe[links[id].safe.length - 1] as { type: string; config: ModeControllerConfig; peers: LobbyPeer[] };
      expect(last.type).toBe('lobby');
      expect(last.config.modeId).toBe('threepoint');
      expect(JSON.stringify(links[id].safe)).not.toMatch(/peer-one|peer-two/);
    }
    expect(host.config.modeId).toBe('threepoint');
    host.dispose();
  });

  it('a phone that connects after the switch is sent the CURRENT layout', async () => {
    const { host } = await hostWith([]);
    host.setConfig(DOWNTOWN);
    fx.signal!({ from: 'late', data: { hello: { name: 'Late' } } });
    await tick(); await tick();
    const link = fx.links[fx.links.length - 1];
    link.opts.onState('connected');
    expect((link.safe[0] as { config: ModeControllerConfig }).config.modeId).toBe('threepoint');
    host.dispose();
  });

  it('the host cleans every name it is told — the signal hello and the channel hello', async () => {
    const { host, links, lobby } = await hostWith([{ id: 'a', name: '<img src=x onerror=alert(1)>' }, { id: 'b', name: 7 }]);
    expect(lobby().map((p) => p.name)).toEqual(['IMG SRCX ONE', 'PLAYER']);
    links.a.opts.onMessage({ type: 'hello', peerId: 'a', name: '  sam  ' });
    expect(lobby().find((p) => p.peerId === 'a')?.name).toBe('SAM');
    expect(hostPlayerName('')).toBe('PLAYER');
    host.dispose();
  });

  it('party commands reach onPartyCmd tagged with the phone; nothing else does', async () => {
    const { host, links, cmds } = await hostWith([{ id: 'a', name: 'A' }]);
    links.a.opts.onMessage({ type: 'party-cmd', cmd: 'ready' });
    links.a.opts.onMessage({ type: 'party-cmd', cmd: 42 });
    links.a.opts.onMessage({ type: 'input', ev: { a: 'A', t: 0 } });
    expect(cmds).toEqual([['ready', 'a'], ['42', 'a']]);   // raw: the room parses (parsePartyCmd refuses '42')
    host.dispose();
  });

  it('sendTo reaches one connected phone only; setReady lights the lobby; drop frees the seat and closes the link', async () => {
    const { host, links, lobby } = await hostWith([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
    const view = { phase: 'lobby' } as unknown as PartyView;
    expect(host.sendTo('a', { type: 'party', party: view })).toBe(true);
    expect(types(links.a.safe)).toContain('party');
    expect(types(links.b.safe)).not.toContain('party');
    expect(host.sendTo('nobody', { type: 'party', party: view })).toBe(false);
    // 'connected' fires when EITHER channel opens: a view sent before the reliable one is up must report that it did not go
    links.a.refuse = true;
    expect(host.sendTo('a', { type: 'party', party: view })).toBe(false);
    links.a.refuse = false;
    links.b.opts.onState('reconnecting');
    expect(host.sendTo('b', { type: 'party', party: view })).toBe(false);

    host.setReady('a', true);
    expect(lobby().find((p) => p.peerId === 'a')?.ready).toBe(true);

    const slotA = lobby().find((p) => p.peerId === 'a')?.slot;
    host.drop('a');
    expect(links.a.closed).toBe(true);
    expect(lobby().map((p) => p.peerId)).toEqual(['b']);
    // the freed seat goes to the next phone in
    fx.signal!({ from: 'c', data: { hello: { name: 'C' } } });
    await tick(); await tick();
    expect(lobby().find((p) => p.peerId === 'c')?.slot).toBe(slotA);
    host.dispose();
  });

  it('onPeerUp fires each time a phone\'s link comes up — including a reconnect — so the room can re-send its view', async () => {
    const ups: string[] = [];
    const { host, links } = await hostWith([{ id: 'a', name: 'A' }], { onPeerUp: (id) => ups.push(id) });
    links.a.opts.onState('connected');          // the second channel opening
    links.a.opts.onState('reconnecting');
    links.a.opts.onState('connected');
    expect(ups).toEqual(['a', 'a', 'a']);
    host.dispose();
  });

  it('the room holds PARTY_CAPACITY phones; the fifth is not offered a link', async () => {
    const { host, lobby } = await hostWith(['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id })));
    expect(lobby()).toHaveLength(4);
    host.dispose();
  });
});

describe('ControllerClient: the phone side of the party', () => {
  async function joined(onParty?: (v: PartyView) => void) {
    const client = new ControllerClient({ code: 'PARTY2', name: 'P', onState: () => undefined, onConfig: () => undefined, ...(onParty ? { onParty } : {}) });
    await client.connect();
    fx.signal!({ from: 'host', data: { offer: { type: 'offer', sdp: '' } } });
    await tick(); await tick();
    return { client, link: fx.links[fx.links.length - 1] };
  }

  it('a party message → onParty, bounded; junk is dropped', async () => {
    const got: PartyView[] = [];
    const { client, link } = await joined((v) => got.push(v));
    link.opts.onMessage({ type: 'party', party: { phase: 'lobby', mode: { id: 'brainbrawl', title: 'Brain Brawl', players: '1–2 PLAYERS', style: 'buzz' }, seats: [], seat: 'P1', captain: true, canStart: false, note: '', waiting: 0, yourGo: false } });
    link.opts.onMessage({ type: 'party', party: 'nope' });
    link.opts.onMessage({ type: 'party' });
    expect(got).toHaveLength(1);
    expect(got[0].seat).toBe('P1');
    client.dispose();
  });

  it('command() goes out on the reliable channel as a party-cmd', async () => {
    const { client, link } = await joined();
    client.command('ready');
    client.command('leave');
    expect(link.safe.filter((m) => (m as LinkMessage).type === 'party-cmd')).toEqual([{ type: 'party-cmd', cmd: 'ready' }, { type: 'party-cmd', cmd: 'leave' }]);
    expect(link.fast).toEqual([]);
    client.dispose();
  });
});
