// MUSIC-SUITE P6 phone-replay (2026-09-26) — THE PHONE SEES THE ROOM: the host's opt-in back channel (roomState.ts).
// P5 left the phone blind: the link had no host → phone message beyond the lobby, so the live bank, a running transport and
// ARM REC looked the same on the phone. These pin the message's rules and the wire, end to end through the REAL
// HostSession and ControllerClient (only the WebRTC link and the signaling HTTP are faked — node has neither):
//   * the shape: bounded, sanitised, unknown fields dropped (parseRoomState);
//   * OPT-IN: a config without `roomState: true` never puts a 'state' on the wire, whatever the host asks;
//   * a phone gets the state when its link comes up (after the lobby and its slot), then each CHANGE only;
//   * the phone hands the host's state to the page, bounded again on arrival; junk is dropped, never fatal.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkMessage, ModeControllerConfig, RoomState } from './types';

// ── the fakes: one PeerLink per phone, recording what went out on the reliable channel ────────────────────────────────
const fx = vi.hoisted(() => ({
  links: [] as { opts: { onMessage: (m: unknown) => void; onState: (s: string) => void }; safe: unknown[]; fast: unknown[] }[],
  signal: null as null | ((m: { from: string; data: unknown }) => void),
}));
vi.mock('./transport/webrtc', () => ({
  PeerLink: class {
    safe: unknown[] = [];
    fast: unknown[] = [];
    opts: { onMessage: (m: unknown) => void; onState: (s: string) => void };
    constructor(opts: { onMessage: (m: unknown) => void; onState: (s: string) => void }) { this.opts = opts; fx.links.push(this); }
    async createOffer() { return { type: 'offer', sdp: '' }; }
    async acceptOffer() { return { type: 'answer', sdp: '' }; }
    async acceptAnswer() { /* */ }
    async addCandidate() { /* */ }
    sendSafe(m: unknown) { this.safe.push(m); }
    sendFast(m: unknown) { this.fast.push(m); }
    sendFrame() { return 'dropped'; }
    close() { /* */ }
  },
}));
vi.mock('./transport/signaling', () => ({
  createRoom: async () => 'ROOM42',
  lookupRoom: async (code: string) => ({ code, modeId: 'music_flip', peers: [] }),
  postSignal: async () => undefined,
  pollSignals: (_code: string, _self: string, on: (m: { from: string; data: unknown }) => void) => { fx.signal = on; return () => undefined; },
}));

import { HostSession } from './host';
import { ControllerClient } from './client';
import { MODE_CONTROLLERS } from './schemas/registry';
import { ROOM_STATE_MAX_CHIPS, ROOM_STATE_MAX_LIT, ROOM_STATE_MAX_TEXT, isLit, parseRoomState, roomStateOptIn, sameRoomState } from './roomState';

const tick = () => new Promise((r) => setTimeout(r, 0));
const STATE: RoomState = { lit: ['bank_B', 'play'], chips: [{ text: 'BANK B · Pocket Bass', tone: '#e8d9c2' }, { text: '▶ PLAYING', tone: '#4ade80', on: true }] };
const types = (msgs: unknown[]): string[] => msgs.map((m) => (m as LinkMessage).type);

beforeEach(() => { fx.links.length = 0; fx.signal = null; });
afterEach(() => { vi.useRealTimers(); });

describe('parseRoomState: bounded, sanitised, never fatal', () => {
  it('keeps a well-formed state exactly', () => {
    expect(parseRoomState(STATE)).toEqual(STATE);
  });
  it('not a state at all → null (no lit array and no chips array, or not an object)', () => {
    for (const x of [null, undefined, 0, 'state', [], {}, { lit: 'bank_B' }, { chips: {} }]) expect(parseRoomState(x), JSON.stringify(x)).toBeNull();
  });
  it('caps: at most MAX_LIT actions (deduplicated), MAX_CHIPS chips, text cut with an ellipsis', () => {
    const s = parseRoomState({
      lit: [...Array.from({ length: 40 }, (_, i) => `a_${i}`), 'a_0'],
      chips: Array.from({ length: 9 }, (_, i) => ({ text: `${'X'.repeat(60)}${i}` })),
    })!;
    expect(s.lit).toHaveLength(ROOM_STATE_MAX_LIT);
    expect(new Set(s.lit).size).toBe(s.lit.length);
    expect(s.chips).toHaveLength(ROOM_STATE_MAX_CHIPS);
    for (const c of s.chips) { expect(c.text.length).toBe(ROOM_STATE_MAX_TEXT); expect(c.text.endsWith('…')).toBe(true); }
  });
  it('a tone must be a plain #rrggbb (it goes into a style attribute) — anything else is dropped, the chip kept', () => {
    const s = parseRoomState({ lit: [], chips: [
      { text: 'a', tone: '#4ade80' }, { text: 'b', tone: 'url(https://x/y)' }, { text: 'c', tone: 'red;background:url(x)' }, { text: 'd', tone: 7 },
    ] })!;
    expect(s.chips).toEqual([{ text: 'a', tone: '#4ade80' }, { text: 'b' }, { text: 'c' }, { text: 'd' }]);
    // #rrggbb only (the page appends a 2-digit alpha: '#fff' + '66' would be no colour at all)
    expect(parseRoomState({ lit: [], chips: [{ text: 'e', tone: '#A1b2C3' }, { text: 'f', tone: '#fff' }, { text: 'g', tone: '#12345678' }] })!.chips)
      .toEqual([{ text: 'e', tone: '#A1b2C3' }, { text: 'f' }, { text: 'g' }]);
  });
  it('junk inside is skipped: non-string / odd actions, empty or non-string chip text, `on` only when exactly true', () => {
    const s = parseRoomState({ lit: ['ok', 3, '', 'has space', '<b>', 'charge:down'], chips: [null, 'x', { text: '   ' }, { text: 7 }, { text: ' two   words ', on: 'yes' }, { text: 'on', on: true }], extra: 1 })!;
    expect(s).toEqual({ lit: ['ok', 'charge:down'], chips: [{ text: 'two words' }, { text: 'on', on: true }] });
  });
  it('sameRoomState / isLit / roomStateOptIn', () => {
    expect(sameRoomState(STATE, JSON.parse(JSON.stringify(STATE)))).toBe(true);
    expect(sameRoomState(STATE, { ...STATE, lit: ['bank_A', 'play'] })).toBe(false);
    expect(sameRoomState(STATE, { ...STATE, chips: [STATE.chips[0], { ...STATE.chips[1], on: false }] })).toBe(false);
    expect(sameRoomState(null, null)).toBe(true);
    expect(sameRoomState(null, STATE)).toBe(false);
    expect(isLit(STATE, 'bank_B')).toBe(true);
    expect(isLit(STATE, 'rec')).toBe(false);
    expect(isLit(null, 'bank_B')).toBe(false);
    expect(roomStateOptIn({ roomState: true })).toBe(true);
    for (const v of [undefined, false, 'true', 1]) expect(roomStateOptIn({ roomState: v }), String(v)).toBe(false);
  });
});

describe('the registry: only the Academy\'s two phone pages opt in', () => {
  it('music_flip and music_perform set roomState: true; no other controller does', () => {
    const on = Object.entries(MODE_CONTROLLERS).filter(([, c]) => roomStateOptIn(c)).map(([id]) => id).sort();
    expect(on).toEqual(['music_flip', 'music_perform'].filter((id) => id in MODE_CONTROLLERS).sort());
    expect(on).toContain('music_flip');
  });
});

/** A host for `config` with one phone joined and its link up. Returns the host and that phone's link. */
async function hostWithPhone(config: ModeControllerConfig, before?: (h: HostSession) => void) {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });   // the 1 s ping: never fires in the test
  const host = new HostSession({ config, onInput: () => undefined });
  expect(await host.start()).toBe('ROOM42');
  before?.(host);
  fx.signal!({ from: 'phone-1', data: { hello: { name: 'P' } } });
  await tick(); await tick();
  const link = fx.links[fx.links.length - 1];
  link.opts.onState('connected');
  return { host, link };
}

describe('HostSession.sendState: the wire', () => {
  it('an opted-in config: a phone whose link comes up gets the lobby, its slot, THEN the room as it is', async () => {
    const { host, link } = await hostWithPhone(MODE_CONTROLLERS.music_flip, (h) => { expect(h.sendState(STATE)).toBe(true); });
    expect(types(link.safe)).toEqual(['lobby', 'assign', 'state']);
    expect((link.safe[2] as { state: RoomState }).state).toEqual(STATE);
    host.dispose();
  });

  it('…then each CHANGE once (an unchanged state is not re-sent), and a reconnect re-sends the latest', async () => {
    const { host, link } = await hostWithPhone(MODE_CONTROLLERS.music_flip);
    expect(types(link.safe)).toEqual(['lobby', 'assign']);   // nothing to say yet
    expect(host.sendState(STATE)).toBe(true);
    expect(host.sendState(JSON.parse(JSON.stringify(STATE)))).toBe(false);   // the same room: nothing sent
    const rec: RoomState = { lit: ['bank_B', 'play', 'rec'], chips: [...STATE.chips, { text: '● RECORDING', tone: '#ff5c5c', on: true }] };
    expect(host.sendState(rec)).toBe(true);
    expect(types(link.safe)).toEqual(['lobby', 'assign', 'state', 'state']);
    expect(link.safe.map((m) => (m as { state?: RoomState }).state?.lit ?? null)).toEqual([null, null, STATE.lit, rec.lit]);
    link.opts.onState('reconnecting');
    link.opts.onState('connected');
    expect(types(link.safe).slice(-3)).toEqual(['lobby', 'assign', 'state']);
    expect((link.safe[link.safe.length - 1] as { state: RoomState }).state).toEqual(rec);
    expect(link.fast).toEqual([]);   // the unreliable input channel carries none of it
    host.dispose();
  });

  it('a config WITHOUT the opt-in: refused, and not one "state" ever reaches the wire (every other mode)', async () => {
    for (const id of ['dance', 'dunk', 'threepoint']) {
      const { host, link } = await hostWithPhone(MODE_CONTROLLERS[id], (h) => { expect(h.sendState(STATE)).toBe(false); });
      expect(host.sendState(STATE), id).toBe(false);
      link.opts.onState('connected');
      expect(types(link.safe), id).not.toContain('state');
      expect(types(link.safe), id).toEqual(['lobby', 'assign', 'lobby', 'assign']);
      host.dispose();
    }
  });

  it('what goes out is bounded (a bad tone never reaches the phone), and nothing is sent after dispose', async () => {
    const { host, link } = await hostWithPhone(MODE_CONTROLLERS.music_flip);
    host.sendState({ lit: ['bank_A'], chips: [{ text: 'BANK A', tone: 'url(evil)' }] });
    expect((link.safe[link.safe.length - 1] as { state: RoomState }).state).toEqual({ lit: ['bank_A'], chips: [{ text: 'BANK A' }] });
    host.dispose();
    expect(host.sendState(STATE)).toBe(false);
  });
});

describe('ControllerClient: the phone hands the host\'s state to the page', () => {
  async function joined(onRoomState?: (s: RoomState) => void) {
    const client = new ControllerClient({ code: 'ROOM42', name: 'P', onState: () => undefined, onConfig: () => undefined, ...(onRoomState ? { onRoomState } : {}) });
    await client.connect();
    fx.signal!({ from: 'host', data: { offer: { type: 'offer', sdp: '' } } });
    await tick(); await tick();
    return { client, link: fx.links[fx.links.length - 1] };
  }

  it('a state message → onRoomState, bounded on arrival; junk and other messages are not a state', async () => {
    const got: RoomState[] = [];
    const { client, link } = await joined((s) => got.push(s));
    link.opts.onMessage({ type: 'state', state: STATE });
    link.opts.onMessage({ type: 'state', state: { lit: ['x'], chips: [{ text: 'T', tone: 'expression(x)' }] } });
    link.opts.onMessage({ type: 'state', state: 'nope' });
    link.opts.onMessage({ type: 'state' });
    link.opts.onMessage({ type: 'lobby', peers: [], config: MODE_CONTROLLERS.music_flip });
    expect(got).toEqual([STATE, { lit: ['x'], chips: [{ text: 'T' }] }]);
    client.dispose();
  });

  it('a page that asked for no state (onRoomState absent) takes one without a fuss', async () => {
    const { client, link } = await joined();
    expect(() => link.opts.onMessage({ type: 'state', state: STATE })).not.toThrow();
    client.dispose();
  });
});
