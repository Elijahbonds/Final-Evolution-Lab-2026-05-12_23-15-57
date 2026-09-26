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
    const mount = between(shell, 'useEffect(() => {\n    inputCount.current = 0;', '}, [gameKey]);');
    expect(mount).toContain('runMark.current = markRun(sessionStore.record());');
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

  it('the won earn fires on the server\'s verdict, not the room\'s claim', () => {
    const grants = between(shell, "event_type: 'mode_session_completed'", "event_type: 'mode_session_won'");
    expect(grants).toContain('if (j?.won) {');
    expect(grants).not.toContain('res?.won');
    // the route answers with its own verdict under that name
    expect(read('app/api/sessions/route.ts')).toMatch(/return NextResponse\.json\(\{\s*ok: true,\s*sessionId:[^\n]*\n[^\n]*\n\s*won,/);
  });
});

describe('refusals on the end card (the arena integrity pass, re-applied)', () => {
  it('a refused Arena submit (422 / 409) becomes arenaResult.refused, and is never the duel\'s verdict', () => {
    const submit = between(shell, "fetch('/api/arena/submit-score'", 'if (ar?.ok)');
    expect(submit).toContain('const refused = arenaRefusal(r2.status, await r2.json().catch(() => null));');
    expect(submit).toContain("if (refused && mine()) setArenaResult({ settled: false, status: 'REFUSED', myScore: arenaScore, refused });");
    expect(shell).toContain('const arenaVerdict: ProofVerdict | null = arenaMatchId && arenaResult && !arenaResult.refused');
    expect(shell).toMatch(/\{arenaResult\.refused \? \(\s*<ArenaRefusedLine refusal=\{arenaResult\.refused\} \/>\s*\) : !arenaResult\.settled \? \(/);
  });

  it('a refused Arena score claims no win: no trophy, no win headline, no proof line, nothing to share (review)', () => {
    // the mode's own W/L is against its in-game rival; with the Arena's verdict refused there is none to show
    expect(shell).toContain('const arenaRefused = Boolean(arenaMatchId && arenaResult?.refused);');
    expect(shell).toContain('const proofLine = result && !arenaRefused ? proofLineFor(mode, {');
    expect(shell).toContain("const cardWon = arenaRefused ? false : arenaVerdict ? arenaVerdict === 'WON' : Boolean(result?.won);");
    expect(shell).toMatch(/const cardHeadline = !result \? '' : arenaRefused \? 'SCORE NOT ACCEPTED' : /);
    // the trophy and the headline read only cardWon / cardHeadline, SHARE PROOF only shows with a proof line, and the
    // challenge mint is gone for the run
    expect(shell).toContain("<Trophy className={`mx-auto h-12 w-12 ${cardWon ? 'text-[#FFD700]' : 'text-white/30'}`} />");
    expect(shell).toMatch(/<h2 className="fel-heading mt-3 text-4xl font-bold text-white">\s*\{cardHeadline\}\s*<\/h2>/);
    expect(shell).toMatch(/\{proofLine && \(\s*<button\s*onClick=\{shareProof\}/);
    expect(shell).toMatch(/\{!arenaRefused && <button\s*onClick=\{\(\) => void shareChallenge\(\)\}/);
    expect(shell.match(/shareChallenge\(/g)).toHaveLength(2);   // those two buttons are the only mints
  });

  it('a refused Story node (422 verdict / 409) is said where STORY NODE COMPLETE would be, and REPLAY clears it', () => {
    const story = between(shell, "fetch('/api/story/complete'", 'if (sr?.ok && !sr?.alreadyCompleted)');
    expect(story).toContain('const refused = storyRefusal(r2.status, await r2.json().catch(() => null));');
    expect(story).toContain('if (refused && mine()) setStoryRefused(refused);');
    expect(shell).toContain('{storyRefused && <StoryRefusedPanel refusal={storyRefused} />}');
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
    expect(h).not.toMatch(/if \(!mine\(\)\) return;\s*const grants/);
    expect(between(h, 'if (j?.ok) {', "fetch('/api/story/complete'")).toContain('const grants = [reportEarnGrant({');
  });
});
