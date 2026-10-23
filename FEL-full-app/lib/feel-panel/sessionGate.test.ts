// feel-panel lane (owner 2026-10-20): "Overrides are IGNORED in any ranked, staked, arena, async-challenge or friend-link session, and
// in anything that pays." The gate is an allow-list (an unpaid playtest run on a /play/<mode> page); these tests hold it to the session
// kinds the code really has — their own URL builders and key lists — and to the server's own decision that a playtest run pays nothing.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FEEL_BLOCK_PARAMS, FEEL_BLOCK_COPY, feelSessionBlock, playtestHref, type FeelBlock } from './sessionGate';
import { STAKED_PARAMS } from '@/lib/babylon/core/DunkField';
import { STAKED_RUN_PARAMS } from '@/lib/babylon/core/Difficulty';
import { HEAD_TO_HEAD_PARAMS } from '@/lib/babylon/modes/onevoneRules';
import { challengePlayHref } from '@/lib/social/challenge-routes';
import { netplayRoom } from '@/lib/net/attach';
import { decideRunEligibility } from '@/lib/sessions/runEligibility';

const split = (href: string): [string, string] => { const i = href.indexOf('?'); return i < 0 ? [href, ''] : [href.slice(0, i), href.slice(i)]; };
const gate = (href: string) => feelSessionBlock(...split(href));

describe('the feel gate: where an override may apply', () => {
  it('ONLY an explicit playtest run on a /play/<mode> page', () => {
    expect(gate('/play/threevthree?playtest=1')).toBeNull();
    expect(gate('/play/onevone?playtest=1&handle=2')).toBeNull();
    expect(gate('/play/onevone')).toBe('NOT_PLAYTEST');          // a normal run PAYS (lib/sessions/runEligibility: payoutEligible)
    expect(gate('/play/onevone?playtest=0')).toBe('NOT_PLAYTEST');
    expect(gate('/play/onevone?playtest=true')).toBe('NOT_PLAYTEST');   // GameShell sends `playtest: true` only for exactly '1'
    expect(gate('/play/onevone?playtest=')).toBe('NOT_PLAYTEST');
    expect(gate('/play?playtest=1')).toBe('NOT_A_GAME');
    expect(gate('/arena?playtest=1')).toBe('NOT_A_GAME');
    expect(gate('')).toBe('NOT_A_GAME');
  });

  // Each session kind, built the way the app builds it, with ?playtest=1 added on top — the block must win over the playtest.
  const kinds: Array<[name: string, href: string, block: FeelBlock]> = [
    ['Arena duel (staked)', '/play/onevone?arena=match_123&playtest=1', 'ARENA'],
    ['async friend challenge', '/play/threevthree?mp=AB12CD&playtest=1', 'ASYNC_CHALLENGE'],
    ['friend challenge link (/c/<code>)', `${challengePlayHref('hoops1v1', 'k9x2') ?? '/play/onevone?c=k9x2'}&playtest=1`, 'CHALLENGE_LINK'],
    ['Signature ladder (ranked)', '/play/threepoint?signature=1&playtest=1', 'LADDER'],
    ['Story node (pays its reward)', '/play/onevone?story=node_7&playtest=1', 'STORY'],
    ['Carnival relay', '/play/threepoint?carnival=1&playtest=1', 'CARNIVAL'],
    ['online netplay', '/play/onevone?net=room42&playtest=1', 'NETPLAY'],
    ['party-room start (party-start.tsx)', `/play/onevone?${new URLSearchParams({ net: 'r1', peer: 'h1', party: '1' })}&playtest=1`, 'NETPLAY'],
    ['party flag alone', '/play/onevone?party=1&playtest=1', 'PARTY'],
    ['ranked (reserved)', '/play/onevone?ranked=1&playtest=1', 'RANKED'],
    ['agent / probe run', '/play/onevone?agent=1&playtest=1', 'AGENT'],
    ['the couch party room', '/play/party?playtest=1', 'PARTY_ROOM'],
    ['the couch party room, a game inside it', '/play/party/brain-brawl?playtest=1', 'PARTY_ROOM'],
  ];
  it.each(kinds)('%s → blocked (%s)', (_name, href, block) => {
    expect(gate(href)).toBe(block);
  });

  it('a session key blocks even with an EMPTY value (stricter than the score paths, which need one): fails closed', () => {
    for (const [key] of FEEL_BLOCK_PARAMS) expect(gate(`/play/onevone?${key}=&playtest=1`), key).not.toBeNull();
  });

  it('the challenge link really is a /play/<mode>?c= URL (the builder the /c/<code> accept uses)', () => {
    const href = challengePlayHref('hoops1v1', 'k9x2');
    expect(href).toMatch(/^\/play\/[^?]+\?c=k9x2$/);
  });

  it('netplay reads the same key the gate blocks', () => {
    expect(netplayRoom('?net=room42')).toBe('room42');
  });

  it('covers every staked / ranked / head-to-head key list the code already keeps', () => {
    const blocked = new Set(FEEL_BLOCK_PARAMS.map(([k]) => k));
    for (const k of [...STAKED_PARAMS, ...STAKED_RUN_PARAMS, ...HEAD_TO_HEAD_PARAMS]) expect(blocked.has(k), k).toBe(true);
    // the server's head-to-head body key for an Arena run is `arenaMatchId`, sent from ?arena= (GameShell startServerRun)
    expect(blocked.has('arena')).toBe(true);
  });

  it('every query key GameShell reads is either a blocked session kind or the playtest flag — a NEW session kind fails here', () => {
    const shell = readFileSync('components/games/game-shell.tsx', 'utf8');
    const keys = [...shell.matchAll(/searchParams\.get\('([^']+)'\)/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThanOrEqual(8);
    const blocked = new Set(FEEL_BLOCK_PARAMS.map(([k]) => k));
    const unaccounted = keys.filter((k) => !blocked.has(k) && k !== 'playtest');
    expect(unaccounted).toEqual([]);
  });

  it('GameShell turns the SAME ?playtest=1 into the server\'s unpaid start (the pin this gate leans on)', () => {
    const shell = readFileSync('components/games/game-shell.tsx', 'utf8');
    expect(shell).toContain("const playtestRun = searchParams.get('playtest') === '1';");
    expect(shell).toMatch(/\.\.\.\(playtestRun \? \{ playtest: true \} : \{\}\)/);
  });

  it('where the gate allows, the server decides the run does NOT pay (decideRunEligibility, the start route\'s own rule)', () => {
    const allowed = ['/play/onevone?playtest=1', '/play/threevthree?playtest=1&dummy=1', '/play/threepoint?playtest=1'];
    for (const href of allowed) {
      expect(gate(href)).toBeNull();
      // GameShell's start: body { mode, playtest: true }, Referer = the page
      const e = decideRunEligibility({
        url: 'https://fel.example/api/sessions/start', headers: { get: (n: string) => (n === 'referer' ? `https://fel.example${href}` : null) },
        body: { mode: 'hoops1v1', playtest: true }, user: { id: 'u-admin', email: 'owner@example.com', role: 'admin' }, env: {},
      });
      expect(e, href).toEqual({ payoutEligible: false, reason: 'PLAYTEST' });
    }
  });

  it('every block has copy for the panel', () => {
    for (const [, b] of FEEL_BLOCK_PARAMS) expect(FEEL_BLOCK_COPY[b]).toBeTruthy();
  });

  it('"restart as a playtest run" drops every session key and keeps the rest', () => {
    expect(playtestHref('/play/onevone', '?handle=2')).toBe('/play/onevone?handle=2&playtest=1');
    const h = playtestHref('/play/onevone', '?arena=m1&mp=x&c=y&handle=2');
    expect(h).toBe('/play/onevone?handle=2&playtest=1');
    expect(gate(h)).toBeNull();
  });
});
