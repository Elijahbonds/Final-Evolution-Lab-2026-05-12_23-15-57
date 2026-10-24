/**
 * lib/feel-panel/sessionGate.ts — WHERE FEEL OVERRIDES MAY APPLY (feel-panel lane, owner 2026-10-20: "Overrides are IGNORED in any ranked,
 * staked, arena, async-challenge or friend-link session, and in anything that pays. Fairness is non-negotiable.").
 *
 * An ALLOW-list, not a deny-list: overrides apply only on a /play/<mode> page that is an explicit PLAYTEST run (`?playtest=1`) and
 * carries none of the session kinds below. The playtest run is the one the server already records UNPAID with no GameSession row
 * (lib/sessions/runEligibility.ts PLAYTEST; GameShell sends `playtest: true` from this same `?playtest=1`): no XP, shards, Lab
 * Credits, coins, PRQ, streak, season XP or mastery, no leaderboard row, nothing the Arena's rival draw reads. So a run with the
 * owner's overrides pays nothing and posts nothing others see. The challenge-link mint, which takes any score from the client,
 * is closed separately for a page that used overrides (feel.ts feelOverridesUsed, read by GameShell.shareChallenge).
 *
 * The session kinds, as the code has them (any of these keys present — even empty — blocks; stricter than the score paths,
 * which need a value, so it fails closed):
 *   arena      a Triumph Arena duel: the score settles a stake            (GameShell → /api/arena/submit-score; DunkField.STAKED_PARAMS)
 *   mp         an async friend challenge                                  (GameShell → /api/v1/mp/join; onevoneRules.HEAD_TO_HEAD_PARAMS)
 *   c          a friend's challenge link (/c/<code> → /play/<mode>?c=)    (GameShell → /api/challenge/<code>/attempt; lib/social/challenge-routes)
 *   signature  the weekly Signature ladder — the repo's ranked surface    (GameShell → /api/signature, posted even on an unpaid run)
 *   story      a Story node: completing it pays its reward                (GameShell → /api/story/complete)
 *   carnival   the Court Carnival relay                                    (GameShell → recordCarnivalResult)
 *   net        online play against another person                          (lib/net/attach.ts netplayRoom)
 *   party      a party-room start (?net=…&peer=…&party=1)                 (components/party/social/party-start.tsx)
 *   ranked     reserved: playFrame's `felRanked` stamp names a ranked session that nothing starts yet; a future ranked URL is blocked
 *   agent      a probe or agent run: rigs measure the shipped defaults    (GameShell agentRun; runEligibility AGENT)
 * and the couch party room's own page (/play/party), where other people play on the same screen.
 *
 * Pure: strings in, a reason out.
 */

export type FeelBlock =
  | 'UNKNOWN'        // nothing has told the gate where we are (the default: closed)
  | 'NOT_A_GAME'     // not a /play/<mode> page
  | 'PARTY_ROOM'     // /play/party: other people on the same screen
  | 'NOT_PLAYTEST'   // a normal run: it PAYS and records a GameSession
  | 'ARENA' | 'ASYNC_CHALLENGE' | 'CHALLENGE_LINK' | 'LADDER' | 'STORY' | 'CARNIVAL' | 'NETPLAY' | 'PARTY' | 'RANKED' | 'AGENT';

/** The query keys that block overrides, each with its reason. Checked in this order. */
export const FEEL_BLOCK_PARAMS: ReadonlyArray<readonly [key: string, block: FeelBlock]> = [
  ['arena', 'ARENA'],
  ['mp', 'ASYNC_CHALLENGE'],
  ['c', 'CHALLENGE_LINK'],
  ['signature', 'LADDER'],
  ['story', 'STORY'],
  ['carnival', 'CARNIVAL'],
  ['net', 'NETPLAY'],
  ['party', 'PARTY'],
  ['ranked', 'RANKED'],
  ['agent', 'AGENT'],
];

/** What the panel says when overrides are held back. */
export const FEEL_BLOCK_COPY: Readonly<Record<FeelBlock, string>> = {
  UNKNOWN: 'Not in a game.',
  NOT_A_GAME: 'Not in a game.',
  PARTY_ROOM: 'Party room: other people are playing.',
  NOT_PLAYTEST: 'This run pays and records a score. Overrides apply only in a playtest run.',
  ARENA: 'Arena duel: a staked score.',
  ASYNC_CHALLENGE: 'Friend challenge: a score someone else plays against.',
  CHALLENGE_LINK: 'Challenge link: a score someone else plays against.',
  LADDER: 'Signature ladder: a ranked score.',
  STORY: 'Story node: it pays a reward.',
  CARNIVAL: 'Carnival relay run.',
  NETPLAY: 'Online match against another person.',
  PARTY: 'Party match: other people are playing.',
  RANKED: 'Ranked session.',
  AGENT: 'Agent or probe run: it measures the defaults.',
};

/**
 * Why overrides may NOT apply on this page, or null when they may. `pathname` like '/play/onevone'; `search` the query string, with
 * or without its '?'.
 */
export function feelSessionBlock(pathname: string, search: string): FeelBlock | null {
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { return 'UNKNOWN'; }
  for (const [key, block] of FEEL_BLOCK_PARAMS) if (q.has(key)) return block;
  const path = (pathname || '').replace(/\/+$/, '');
  if (path === '/play/party' || path.startsWith('/play/party/')) return 'PARTY_ROOM';
  if (!/^\/play\/[^/]+/.test(path)) return 'NOT_A_GAME';
  // exactly GameShell's own test (`searchParams.get('playtest') === '1'`), the one that sends `playtest: true` to the server's start
  if (q.get('playtest') !== '1') return 'NOT_PLAYTEST';
  return null;
}

/** The same page as a playtest run, with every blocking key dropped — the panel's "restart as playtest" link. */
export function playtestHref(pathname: string, search: string): string {
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { q = new URLSearchParams(); }
  for (const [key] of FEEL_BLOCK_PARAMS) q.delete(key);
  q.set('playtest', '1');
  return `${pathname}?${q.toString()}`;
}
