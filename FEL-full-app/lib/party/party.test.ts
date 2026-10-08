// MULTIPLAYER lane (2026-10-06): the party room's pure rules — the join code, the name, the seats, the per-seat input
// routing, the turns board, the per-phone view and the commands a phone may send.
import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, ROOM_CODE_LEN, makeRoomCode } from '@/lib/controller-link/codes';
import { joinCodeHint, parseJoinCode } from './joinCode';
import { cleanPlayerName, PLAYER_NAME_MAX } from './playerName';
import { PARTY_MODES, partyHref, partyModeById, partyModeFor, playersBadge } from './catalog';
import { captainKey, everyoneReady, padName, PARTY_CAPACITY, seatOfPhone, seatTable, type PhoneIn } from './seats';
import { routeSeatInput } from './route';
import { currentTurn, recordTurnScore, skipTurn, startTurns, turnBannerLine, turnStandings, turnsDone } from './turns';
import { parsePartyCmd, parsePartyView, partyCmdAllowed, PARTY_CMDS, samePartyView } from './protocol';
import { partyViewFor, roomCanStart } from './view';
import { ANSWER_BUTTONS, partyControllerConfig } from './controls';
import { MODES } from '@/lib/babylon/modes/registry';
import { MODE_INFO } from '@/lib/game-data';
import type { FelInput } from '@/lib/babylon/core/InputBus';

const phone = (peerId: string, slot: number, over: Partial<PhoneIn> = {}): PhoneIn => ({ peerId, name: peerId.toUpperCase(), slot, ready: false, connected: true, ...over });
const btn = (b: 'A' | 'B' | 'X' | 'Y' | 'START', pressed = true): FelInput => ({ t: 'button', btn: b, pressed });
const dpad = (dir: 'up' | 'down' | 'left' | 'right', pressed = true): FelInput => ({ t: 'dpad', dir, pressed });

describe('join code: what a friend types', () => {
  it('a real room code round-trips, whatever the case, spaces or dashes', () => {
    for (let i = 0; i < 50; i++) {
      const c = makeRoomCode();
      expect(parseJoinCode(c)).toEqual({ ok: true, code: c });
      expect(parseJoinCode(` ${c.slice(0, 3).toLowerCase()}-${c.slice(3)} `)).toEqual({ ok: true, code: c });
    }
  });
  it('a pasted invite link is read for its code', () => {
    expect(parseJoinCode('https://fel.example/controller/ABC234?game=brainbrawl')).toEqual({ ok: true, code: 'ABC234' });
    expect(parseJoinCode('https://fel.example/join?code=abc234')).toEqual({ ok: true, code: 'ABC234' });
  });
  it('length and alphabet are enforced on the phone, before any network', () => {
    expect(parseJoinCode('')).toEqual({ ok: false, problem: 'empty' });
    expect(parseJoinCode(undefined)).toEqual({ ok: false, problem: 'empty' });
    expect(parseJoinCode('ABC23')).toEqual({ ok: false, problem: 'too-short' });
    expect(parseJoinCode('ABC2345')).toEqual({ ok: false, problem: 'too-long' });
    expect(parseJoinCode('ABC2O4')).toEqual({ ok: false, problem: 'bad-char', bad: 'O' });
    expect(parseJoinCode('ABC2#4')).toEqual({ ok: false, problem: 'bad-char', bad: '#' });
  });
  it('the look-alikes the alphabet leaves out get a hint that sends the eye back to the TV', () => {
    for (const ch of ['0', 'O', '1', 'I', 'L']) {
      expect(CODE_ALPHABET.includes(ch)).toBe(false);
      expect(joinCodeHint(parseJoinCode(`ABC2${ch}4`))).toMatch(/never use/);
    }
    expect(ROOM_CODE_LEN).toBe(6);
  });
});

describe('player name: the jersey plate rule', () => {
  it('upper case, letters / digits / space / hyphen, at most twelve', () => {
    expect(cleanPlayerName('Sam')).toBe('SAM');
    expect(cleanPlayerName('  <script>alert(1)</script> ')).toBe('SCRIPTALERT1');
    expect(cleanPlayerName('a very long name indeed')).toBe('A VERY LONG');
    expect(cleanPlayerName('abcdefghijklmnop')).toHaveLength(PLAYER_NAME_MAX);
    expect(cleanPlayerName('mary-jo  k')).toBe('MARY-JO K');
    expect(cleanPlayerName('😀😀')).toBe('');
    expect(cleanPlayerName(42)).toBe('');
    expect(cleanPlayerName(null)).toBe('');
  });
});

describe('catalog: only games that really seat more than one person', () => {
  it('every party game is a registered Babylon mode and a known MODE_INFO key', () => {
    for (const m of PARTY_MODES) {
      expect(MODES[m.id], m.id).toBeTruthy();
      expect((MODE_INFO as Record<string, unknown>)[m.infoKey], m.infoKey).toBeTruthy();
      expect(m.maxPlayers).toBeGreaterThan(1);
      expect(m.maxPlayers).toBeLessThanOrEqual(PARTY_CAPACITY);
    }
  });
  it('the AI-rival modes whose phone layout says 2+ are NOT offered as multiplayer', () => {
    for (const id of ['karate', 'karate_vs', 'carnival', 'onevone', 'threevthree']) expect(partyModeById(id), id).toBeNull();
  });
  it('lookups, badges and links', () => {
    expect(partyModeFor('brainBrawl')?.id).toBe('brainbrawl');
    expect(partyModeFor('brainbrawl')?.id).toBe('brainbrawl');
    expect(partyModeFor('dance')).toBeNull();
    expect(playersBadge({ minPlayers: 1, maxPlayers: 4 })).toBe('1–4 PLAYERS');
    expect(playersBadge({ minPlayers: 2, maxPlayers: 2 })).toBe('2 PLAYERS');
    expect(partyHref('threePoint')).toBe('/play/party?mode=threepoint');
    expect(partyHref('nope')).toBe('/play/party');
  });
});

describe('seats: pads first, then phones, the rest wait', () => {
  it('a pad is P1 ahead of a phone that joined earlier — the number the game treats them as', () => {
    const t = seatTable([{ slot: 0, name: 'Xbox Controller' }], [phone('a', 0)]);
    expect(t.seats.map((s) => [s.label, s.kind])).toEqual([['P1', 'pad'], ['P2', 'phone']]);
    expect(seatOfPhone(t, 'a')).toBe(1);
  });
  it('phones order by join slot (stable across a reconnect), past capacity they wait', () => {
    const t = seatTable([], [phone('c', 2), phone('a', 0), phone('b', 1), phone('d', 3)], 3);
    expect(t.seats.map((s) => s.key)).toEqual(['phone:a', 'phone:b', 'phone:c']);
    expect(t.waiting.map((s) => [s.key, s.index, s.label])).toEqual([['phone:d', null, 'NEXT']]);
    expect(seatOfPhone(t, 'd')).toBeNull();
  });
  it('capacity is clamped to the room', () => {
    const many = Array.from({ length: 6 }, (_, i) => phone(`p${i}`, i));
    expect(seatTable([], many, 99).seats).toHaveLength(PARTY_CAPACITY);
    expect(seatTable([], many, -1).seats).toHaveLength(0);
  });
  it('ready: pads by pressing, phones by saying so; a phone that dropped does not hold the room hostage', () => {
    expect(everyoneReady(seatTable([{ slot: 0, name: 'x' }], []))).toBe(true);
    expect(everyoneReady(seatTable([], [phone('a', 0)]))).toBe(false);
    expect(everyoneReady(seatTable([], [phone('a', 0, { ready: true }), phone('b', 1, { connected: false })]))).toBe(true);
    expect(everyoneReady(seatTable([], []))).toBe(false);
  });
  it('the captain is the first seated connected phone', () => {
    expect(captainKey(seatTable([{ slot: 0, name: 'x' }], [phone('b', 1), phone('a', 0)]))).toBe('phone:a');
    expect(captainKey(seatTable([], [phone('a', 0, { connected: false }), phone('b', 1)]))).toBe('phone:b');
    expect(captainKey(seatTable([{ slot: 0, name: 'x' }], []))).toBeNull();
  });
  it('a pad card says what it is, briefly', () => {
    expect(padName('Xbox Wireless Controller')).toBe('XBOX PAD');
    expect(padName('')).toBe('GAME PAD');
    expect(padName('Wireless Controller')).toBe('GAME PAD');   // measured on the TV: it read "CONTROLLER P"
    expect(padName('PlayStation 5 DualSense').length).toBeLessThanOrEqual(12);
  });
});

describe('route: a phone press, as its seat should be heard', () => {
  const buzz = (seat: number | null, e: FelInput) => routeSeatInput(e, { style: 'buzz', seat, seatsInGame: 2 });
  it('BUZZ seat 0: face buttons pass, its d-pad is dropped (it would answer for P2)', () => {
    expect(buzz(0, btn('A'))).toEqual([btn('A')]);
    expect(buzz(0, btn('Y', false))).toEqual([btn('Y', false)]);
    expect(buzz(0, dpad('up'))).toEqual([]);
  });
  it('BUZZ seat 1: A B X Y become ▲ ▶ ◀ ▼ — the card order (#14\'s 2×2 grid) — press and release both', () => {
    expect(buzz(1, btn('A'))).toEqual([dpad('up')]);
    expect(buzz(1, btn('B'))).toEqual([dpad('right')]);
    expect(buzz(1, btn('X'))).toEqual([dpad('left')]);
    expect(buzz(1, btn('Y', false))).toEqual([dpad('down', false)]);
    expect(buzz(1, dpad('left'))).toEqual([dpad('left')]);
    expect(buzz(1, { t: 'stick', side: 'L', x: 1, y: 0 })).toEqual([]);
  });
  it('START passes from any seated player; nobody past the game\'s seats, and no waiting phone, reaches it', () => {
    expect(buzz(1, btn('START'))).toEqual([btn('START')]);
    expect(buzz(2, btn('A'))).toEqual([]);
    expect(buzz(null, btn('A'))).toEqual([]);
    expect(buzz(-1, btn('A'))).toEqual([]);
  });
  it('TURNS: only the seat whose go it is', () => {
    const r = (seat: number, turnSeat: number) => routeSeatInput(btn('A'), { style: 'turns', seat, seatsInGame: 3, turnSeat });
    expect(r(1, 1)).toEqual([btn('A')]);
    expect(r(0, 1)).toEqual([]);
    expect(r(2, 1)).toEqual([]);
  });
});

describe('turns: one go each, a board at the end', () => {
  const players = [0, 1, 2].map((i) => ({ seat: i, label: `P${i + 1}`, name: `N${i}`, color: '#ffffff' }));
  it('runs the order, banks each score, and finishes', () => {
    let s = startTurns(players);
    expect(currentTurn(s)?.label).toBe('P1');
    expect(turnBannerLine(s)).toBe('P1 · N0 — YOUR GO · 1 OF 3');
    s = recordTurnScore(s, 12.6);
    s = recordTurnScore(s, -5);
    expect(currentTurn(s)?.label).toBe('P3');
    s = recordTurnScore(s, Number.NaN);
    expect(turnsDone(s)).toBe(true);
    expect(s.scores).toEqual([13, 0, 0]);
    expect(recordTurnScore(s, 99)).toBe(s);
    expect(currentTurn(s)).toBeNull();
  });
  it('standings: highest first, ties share a place, a skipped player sits last with no score', () => {
    let s = startTurns(players);
    s = recordTurnScore(s, 10); s = skipTurn(s); s = recordTurnScore(s, 10);
    const st = turnStandings(s);
    expect(st.map((r) => [r.label, r.score, r.place])).toEqual([['P1', 10, 1], ['P3', 10, 1], ['P2', null, 3]]);
  });
  it('a solo run has no banner', () => {
    expect(turnBannerLine(startTurns(players.slice(0, 1)))).toBe('');
  });
});

describe('protocol: commands a phone may send', () => {
  it('parses only the known commands', () => {
    for (const c of PARTY_CMDS) expect(parsePartyCmd(c)).toBe(c);
    for (const x of ['START', 'kick', '', null, 3, {}]) expect(parsePartyCmd(x)).toBeNull();
  });
  it('only the seated captain picks, starts and rematches — and only when it makes sense', () => {
    const cap = { seated: true, captain: true };
    const other = { seated: true, captain: false };
    const waiting = { seated: false, captain: false };
    expect(partyCmdAllowed('start', cap, 'lobby')).toBe(true);
    expect(partyCmdAllowed('start', other, 'lobby')).toBe(false);
    expect(partyCmdAllowed('start', cap, 'playing')).toBe(false);
    expect(partyCmdAllowed('next', other, 'lobby')).toBe(false);
    expect(partyCmdAllowed('rematch', cap, 'results')).toBe(true);
    expect(partyCmdAllowed('rematch', cap, 'lobby')).toBe(false);
    expect(partyCmdAllowed('lobby', other, 'results')).toBe(false);
    expect(partyCmdAllowed('ready', waiting, 'lobby')).toBe(true);
    expect(partyCmdAllowed('ready', other, 'playing')).toBe(false);
    expect(partyCmdAllowed('leave', waiting, 'playing')).toBe(true);
  });
});

describe('view: the room as ONE phone sees it — and no ids', () => {
  const mode = partyModeById('brainbrawl')!;
  const table = seatTable([{ slot: 0, name: 'Xbox' }], [phone('peer-aaaa', 0, { ready: true }), phone('peer-bbbb', 1)]);
  it('names "you", the captain, and whether the room can start', () => {
    const a = partyViewFor('peer-aaaa', { phase: 'lobby', mode, table, turns: null, note: 'hi' });
    expect(a.seat).toBe('P2');
    expect(a.seats.filter((s) => s.you).map((s) => s.label)).toEqual(['P2']);
    expect(a.captain).toBe(true);
    expect(a.waiting).toBe(0);   // the ROOM seats four; the game's two-seat limit is applied when it starts
    const b = partyViewFor('peer-bbbb', { phase: 'lobby', mode, table, turns: null, note: '' });
    expect(b.captain).toBe(false);
    expect(b.canStart).toBe(false);   // peer-bbbb has not readied
  });
  it('never carries a peer id, an account id or an email', () => {
    const json = JSON.stringify(partyViewFor('peer-aaaa', { phase: 'lobby', mode, table, turns: null, note: '' }));
    expect(json).not.toMatch(/peer-|phone:|pad:|@/);
  });
  it('TURNS: yourGo is true for the phone whose go it is, only while playing', () => {
    const tm = partyModeById('threepoint')!;
    const t2 = seatTable([], [phone('x', 0), phone('y', 1)]);
    const turns = recordTurnScore(startTurns(t2.seats.map((s) => ({ seat: s.index!, label: s.label, name: s.name, color: s.color }))), 5);
    expect(partyViewFor('y', { phase: 'playing', mode: tm, table: t2, turns, note: '' }).yourGo).toBe(true);
    expect(partyViewFor('x', { phase: 'playing', mode: tm, table: t2, turns, note: '' }).yourGo).toBe(false);
    expect(partyViewFor('y', { phase: 'results', mode: tm, table: t2, turns, note: '' }).yourGo).toBe(false);
  });
  it('roomCanStart needs the minimum seated and every seated phone ready', () => {
    expect(roomCanStart({ mode, table: seatTable([], []) })).toBe(false);
    expect(roomCanStart({ mode, table: seatTable([], [phone('a', 0, { ready: true })]) })).toBe(true);
    expect(roomCanStart({ mode, table: seatTable([], [phone('a', 0, { ready: true }), phone('b', 1)]) })).toBe(false);
  });
  it('parsePartyView: a view survives the trip; junk is bounded or refused', () => {
    const v = partyViewFor('peer-aaaa', { phase: 'lobby', mode, table, turns: null, note: 'Ready!' });
    expect(parsePartyView(JSON.parse(JSON.stringify(v)))).toEqual(v);
    expect(samePartyView(v, parsePartyView(v))).toBe(true);
    for (const x of [null, 'v', {}, { phase: 'lobby' }, { phase: 'nope', mode: {}, seats: [] }]) expect(parsePartyView(x)).toBeNull();
    const evil = parsePartyView({ phase: 'lobby', mode: { id: 'x', title: 'T'.repeat(500), players: '', style: 'turns' }, seats: [
      { label: 'P1', name: 'n', color: 'red;background:url(x)' }, ...Array.from({ length: 9 }, () => ({ label: 'P', name: 'n', color: '#ffffff' })),
    ], waiting: 1e9, captain: 'yes', note: 3 })!;
    expect(evil.mode.title).toHaveLength(40);
    expect(evil.seats).toHaveLength(4);
    expect(evil.seats[0].color).toBe('#6b7280');
    expect(evil.waiting).toBe(16);
    expect(evil.captain).toBe(false);
    expect(evil.note).toBe('');
  });
});

describe('controls: the phone layout the room sends', () => {
  it('BUZZ games: four answer buttons in the card\'s order, the room\'s capacity', () => {
    const c = partyControllerConfig(partyModeById('who_scene_it')!);
    expect(c.maxPlayers).toBe(PARTY_CAPACITY);
    expect(c.schemas).toHaveLength(1);
    const s = c.schemas[0];
    expect(s.kind === 'button' && s.buttons.map((b) => `${b.action}:${b.label}`)).toEqual(['A:A', 'B:B', 'X:C', 'Y:D']);
    expect(ANSWER_BUTTONS.map((b) => b.action)).toEqual(['A', 'B', 'X', 'Y']);
  });
  it('TURNS games: the game\'s own registry layout', () => {
    const c = partyControllerConfig(partyModeById('threepoint')!);
    expect(c.modeId).toBe('threepoint');
    expect(c.maxPlayers).toBe(PARTY_CAPACITY);
    expect(c.schemas.length).toBeGreaterThan(0);
  });
});
