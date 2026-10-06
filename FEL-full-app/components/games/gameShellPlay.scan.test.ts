// GAME SHELL, handleEnd (2026-09-26) — three waiting changes to the shared shell, pinned where they live.
//
//   1. WHAT COUNTS AS PLAYED (movement play P3 step 5, owner call 4). The shell counted only keys, pointers and touches on
//      the window, so a pad, the body or Controller Link — which reach the game through its InputBus — never counted, and a
//      pad-only or phone-only run that scored 0 was NO PLAY. `played` now also reads the harness's run record (sessionStore:
//      input the game received, from every source), counted after a mark the shell takes when its game mounts and before
//      REPLAY — so the run before (runId only grows) is never read as this one. The rules of the mark: sessionStore.test.
//   2. THE MUSIC SESSION REQUEST (lib/session-payout.ts, the SHARED CONTRACT). The room's `stats` and the run's
//      `arenaMatchId` go to /api/sessions under the names the route reads, and the wallet's won earn fires on the server's
//      verdict (`j.won`), never the room's claim. ROOM_STATS_FORWARDED is flipped with it (session-payout.test holds the pair).
//   3. REFUSALS ON THE END CARD. A refused Arena score or Story node is said on the card (end-card-refusal), not swallowed;
//      a refused Arena score is never the duel's verdict.
//   4. AN ANSWER THAT LANDS AFTER REPLAY (review of 009ddd1b N10 + this commit). The card and its REPLAY show before
//      /api/sessions answers, and Brain Brawl's REPLAY in place is instant, so run 1's answers can land during run 2. The
//      run is read when it ends, and every answer that writes to the card checks it is still that run's card.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string): string => stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const shell = read('components/games/game-shell.tsx');
// END SCREEN (2026-10-06): the results card the shell mounts, and its outcome panels
const card = read('components/games/end-screen/end-screen.tsx');
const cards = read('components/games/end-screen/outcome-cards.tsx');
const between = (src: string, from: string, to: string): string => {
  const a = src.indexOf(from);
  expect(a, from).toBeGreaterThan(-1);
  const b = src.indexOf(to, a + from.length);
  expect(b, to).toBeGreaterThan(a);
  return src.slice(a, b);
};
const sessionBody = (): string => between(shell, "fetch('/api/sessions'", '.then((r) =>');

describe('what counts as played: input the game received, from any source (P3 step 5)', () => {
  it('handleEnd sends the shell\'s own count OR the game\'s record since the mark — read once, at the end', () => {
    expect(sessionBody()).toContain('played: inputCount.current >= 3 || countedSince(sessionStore.record(), runMark.current) >= 3,');
    expect(shell).toMatch(/import \{ sessionStore, markRun, countedSince \} from '@\/lib\/babylon\/core\/sessionStore';/);
  });

  it('the mark is taken when the game mounts (the run before is the old record) and before REPLAY restarts in place', () => {
    // the effect that zeroes the shell's own count for a new game (keyed on gameKey) marks the record in the same place
    const mount = between(shell, 'useEffect(() => {\n    inputCount.current = 0;', '}, [gameKey, startServerRun]);');
    expect(mount).toContain('runMark.current = markRun(sessionStore.record());');
    // ECONOMY-SESSIONS-HARDEN: the server's run starts in the same place, so every new game is a new run
    expect(mount).toContain('serverRun.current = startServerRun();');
    // REPLAY: marked BEFORE the in-place restart — Brain Brawl's rematch keeps the same harness run, so only what comes
    // after the mark is the rematch's; a remount marks again in the effect above
    const replay = between(shell, 'const replay = () => {', 'setGameKey((k) => k + 1);');
    const marked = replay.indexOf('runMark.current = markRun(sessionStore.record());');
    expect(marked).toBeGreaterThan(-1);
    expect(marked).toBeLessThan(replay.indexOf('inPlace.current?.()'));
    // one mark ref, written in exactly those two places
    expect(shell.match(/runMark\.current = /g)).toHaveLength(2);
  });
});

describe('the music session request: the fields the server reads (session-payout SHARED CONTRACT)', () => {
  it('the body carries the room\'s stats and the staked duel, under the names app/api/sessions reads', () => {
    const body = sessionBody();
    expect(body).toContain('stats: res?.stats,');
    expect(body).toContain('...(arenaMatchId ? { arenaMatchId } : {}),');
    expect(shell).toContain("const arenaMatchId = searchParams.get('arena');");
    const route = read('app/api/sessions/route.ts');
    expect(route).toContain('const stats = roomStats(body);');                  // roomStats reads body.stats (or metadata)
    expect(route).toContain('verifiedMusicDuel(userId, body?.arenaMatchId)');
  });

  it('the won earn is paid on the server\'s verdict, not the room\'s claim — by the run itself now (ECONOMY-SESSIONS-HARDEN)', () => {
    // the shell reports no session earn any more: the run's transaction pays the completed coins and, on the server's
    // `won`, the won shards, keyed by the run (a retried session used to pay both again under the new session's id)
    expect(shell).not.toMatch(/mode_session_completed|mode_session_won|reportEarnGrant/);
    const route = read('app/api/sessions/route.ts');
    const tx = route.slice(route.indexOf('prisma.$transaction'));
    expect(tx).toMatch(/if \(won\) \{\s*const w = await sessionWalletGrant\(tx, \{ playerId: userId, reasonCode: REASON\.MODE_SESSION_WON/);
    // the server's verdict (sessionWon); a floor-only mode (Prove It, owner decision 2026-09-28) never wins
    expect(route).toContain('const won = floorOnly ? false : sessionWon(rulesMode, claimedWon, stats, duration, { score });');
    // the route answers with its own verdict under that name
    expect(tx).toMatch(/const payload: Record<string, unknown> = \{\s*ok: true,\s*paid: true,\s*replayed: false,\s*runId: run\.id,\s*sessionId:[^\n]*\n\s*won,/);
  });
});

describe('refusals on the end card (the arena integrity pass, re-applied)', () => {
  it('a refused Arena submit (422 / 409) becomes arenaResult.refused, and is never the duel\'s verdict', () => {
    const submit = between(shell, "fetch('/api/arena/submit-score'", 'if (ar?.ok)');
    expect(submit).toContain('const refused = arenaRefusal(r2.status, await r2.json().catch(() => null));');
    expect(submit).toContain("if (refused && mine()) setArenaResult({ settled: false, status: 'REFUSED', myScore: arenaScore, refused });");
    expect(shell).toContain('const arenaVerdict: ProofVerdict | null = arenaMatchId && arenaResult && !arenaResult.refused');
    // END SCREEN (2026-10-06): the panel moved into components/games/end-screen (outcome-cards.tsx); the shell hands it the
    // result as it holds it, and the panel still says the refusal before any verdict
    expect(shell).toContain('arenaResult={arenaResult}');
    expect(cards).toMatch(/\{r\.refused \? \(\s*<ArenaRefusedLine refusal=\{r\.refused\} \/>\s*\) : !r\.settled \? \(/);
  });

  it('a refused Arena score claims no win: no trophy, no win headline, no proof line, nothing to share (review)', () => {
    // the mode's own W/L is against its in-game rival; with the Arena's verdict refused there is none to show
    expect(shell).toContain('const arenaRefused = Boolean(arenaMatchId && arenaResult?.refused);');
    expect(shell).toContain('const proofLine = result && !arenaRefused ? proofLineFor(mode, {');
    expect(shell).toContain("const cardWon = arenaRefused ? false : arenaVerdict ? arenaVerdict === 'WON' : Boolean(result?.won);");
    expect(shell).toMatch(/const cardHeadline = !result \? '' : arenaRefused \? 'SCORE NOT ACCEPTED' : /);
    // the trophy and the headline read only cardWon / cardHeadline, SHARE PROOF only shows with a proof line, and the
    // challenge mint is gone for the run. END SCREEN (2026-10-06): the card is components/games/end-screen; the shell passes
    // exactly these values, and the card renders them under the same rules (end-screen.test.tsx renders the refused case:
    // dim trophy, no challenge, no proof)
    expect(shell).toContain('headline={cardHeadline}');
    expect(shell).toContain('won={cardWon}');
    expect(shell).toContain('proofLine={proofLine}');
    expect(shell).toContain('arenaRefused={arenaRefused}');
    expect(card).toContain("data-end-trophy={won ? 'gold' : 'dim'}");
    expect(card).toMatch(/\{headline\}\s*<\/motion\.h2>/);
    expect(card).toMatch(/\{proofLine && \(\s*<button[^>]*onClick=\{guard\(share\.onProof\)\}/);
    expect(card).toMatch(/\{!arenaRefused && \(\s*<button[^>]*onClick=\{guard\(share\.onChallenge\)\}/);
    expect(card.match(/share\.on(Proof|Challenge)\b/g)).toHaveLength(2);   // those two buttons are the only mints
    expect(shell).toContain('share={{ state: shareState, url: shareUrl, onChallenge: () => void shareChallenge(), onProof: shareProof }}');
    expect(shell.match(/shareChallenge\(/g)).toHaveLength(2);   // shareProof's mint and the card's challenge button
  });

  it('a refused Story node (422 verdict / 409) is said where STORY NODE COMPLETE would be, and REPLAY clears it', () => {
    const story = between(shell, "fetch('/api/story/complete'", 'if (sr?.ok && !sr?.alreadyCompleted)');
    expect(story).toContain('const refused = storyRefusal(r2.status, await r2.json().catch(() => null));');
    expect(story).toContain('if (refused && mine()) setStoryRefused(refused);');
    expect(shell).toContain('storyRefused={storyRefused}');
    expect(card).toMatch(/\{storyRefused && <Beat show=\{shown\('storyRefused'\)\}[^>]*><StoryRefusedPanel refusal=\{storyRefused\} \/><\/Beat>\}/);
    expect(between(shell, 'const replay = () => {', 'setGameKey((k) => k + 1);')).toContain('setStoryRefused(null);');
  });

  it('GameResult names the mode detail the dunk host forwards (the card the Arena checks rides in it)', () => {
    const iface = between(shell, 'export interface GameResult', 'export interface GameProps');
    expect(iface).toMatch(/detail\?: unknown;/);
    expect(read('components/games/dunk-babylon.tsx')).toContain('{ detail: r.detail }');
  });
});

describe('an answer that lands after REPLAY writes nothing to the next run\'s card (review: run 1\'s +316 coins on card 2)', () => {
  const handleEnd = (): string => between(shell, 'const handleEnd = useCallback(', '[mode, storyNodeId');

  it('the run is read when it ends — before /api/sessions is asked — never after an answer', () => {
    const h = handleEnd();
    const read = h.indexOf('const run = runSeq.current;');
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThan(h.indexOf("fetch('/api/sessions'"));
    expect(h).toContain('const mine = () => run === runSeq.current;');
    expect(h.match(/runSeq\.current/g)).toHaveLength(2);   // the read, and mine()
    // REPLAY moves the run on and clears everything a run's answers write, the Story reward included
    const replay = between(shell, 'const replay = () => {', 'setGameKey((k) => k + 1);');
    for (const clear of ['setRecap(null);', 'setRecapCoins(null);', 'setStoryReward(null);', 'runSeq.current += 1;', 'setArenaResult(null);', 'setStoryRefused(null);', 'setMpResult(null);']) {
      expect(replay, clear).toContain(clear);
    }
  });

  it('every card write after the session request checks mine() (recap, coins, Story, Arena, friend challenge, carnival)', () => {
    const h = handleEnd();
    const lines = h.slice(h.indexOf("fetch('/api/sessions'")).split('\n');
    const writes: string[] = [];
    lines.forEach((line, i) => {
      if (!/\bset(Recap|RecapCoins|StoryReward|StoryRefused|ArenaResult|MpResult|CarnivalRun)\(/.test(line)) return;
      writes.push(line.trim());
      expect(lines.slice(Math.max(0, i - 6), i + 1).join('\n'), line.trim()).toMatch(/mine\(\)/);
    });
    expect(writes.length).toBeGreaterThanOrEqual(10);
    // the answers still do their work for the run they belong to: the grants, the Story node and the Arena score are asked
    // for whatever the card shows now (only the card is guarded)
    // ECONOMY-SESSIONS-HARDEN: the coins tile is the session answer's own figure (the run paid them), guarded like the rest
    expect(between(h, 'if (j?.ok) {', "fetch('/api/story/complete'")).toMatch(/if \(mine\(\) && j\?\.paid === true\) \{[\s\S]*setRecapCoins\(\{ coins, capped \}\)/);
  });
});

describe('the profile failure state is a stop, not a spinner plus a stop', () => {
  it('when /api/profile is unreachable, the retry panel replaces the loader instead of rendering underneath it', () => {
    const profileBlock = between(shell, '{!profile && unreachable && (', '<AnimatePresence>');
    expect(profileBlock).toContain("Can&apos;t reach the server. Check your connection, then try again.");
    expect(profileBlock).toContain(') : !unreachable ? (');
    expect(profileBlock).toContain('<Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />');
    expect(profileBlock).toContain(') : null}');
  });
});
