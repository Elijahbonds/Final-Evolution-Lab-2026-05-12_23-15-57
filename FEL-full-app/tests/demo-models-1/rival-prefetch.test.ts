// DEMO-MODELS-1 item 3: why a guest Flight Night run downloads no rival file, and the fix (DUNK_RIVAL_PREFETCH_ENABLED, off by default).
// Root cause (dunkRivalPrefetch.ts has it in full): the contest set that brings his body only starts on an allow-listed quiet
// phase; your dunk 1 asks for it in `resolve`, so it queues, and nothing between your dunks is quiet, so his file is first asked
// for in rivalRound, after both of your round-1 dunks and dunk 2's judging.
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QUIET_DUNK_PHASES, createContestDefer, isQuietDunkPhase } from '@/lib/babylon/modes/dunkContestDefer';
import { prefetchRivalBody, prefetchedRivalBodies, resetRivalPrefetch } from '@/lib/babylon/modes/dunkRivalPrefetch';
import { DUNK_RIVALS } from '@/lib/babylon/core/DunkRivals';
import { rosterBodyUrl } from '@/lib/babylon/core/athleteRoster';

const dunk = readFileSync('lib/babylon/modes/DunkMode.ts', 'utf8');
afterEach(() => { resetRivalPrefetch(); vi.unstubAllGlobals(); });

describe('the root cause, on the real queue and the real allow-list', () => {
  it('dunk 1 lands in `resolve`: the set queues, and no phase of your dunk 2 lets it start', () => {
    const q = createContestDefer();
    expect(q.ask(isQuietDunkPhase('resolve'))).toBe(false);   // finishAttempt → startContestSet, your dunk 1 just landed
    expect(q.queued).toBe(true);
    // the phases a player's own dunk walks through (DunkMode setPhase), dunk 2 and its judging included
    for (const p of ['judging', 'approach', 'charge', 'cinematic', 'resolve', 'judging']) expect(q.tick(isQuietDunkPhase(p)), p).toBe(false);
    expect(q.queued).toBe(true);   // still waiting: no request for his file yet
    expect([...QUIET_DUNK_PHASES]).toEqual(['rivalTurn', 'fieldCut', 'contestOver']);
  });
  it('DunkMode: his turn (the first quiet beat) comes only after DUNKS_PER_ROUND = 2 of your dunks, and the preload knob is off', () => {
    expect(dunk).toMatch(/const DUNKS_PER_ROUND = 2;/);
    expect(dunk).toMatch(/if \(dunkInRound < dunksThisRound\(\)\) \{\s*resetForNextAttempt\(ctx\);\s*return;\s*\}\s*dunkInRound = 0;\s*await rivalRound\(ctx\);/);
    expect(dunk).toMatch(/if \(turn === 'player'\) startContestSet\(ctx\);/);
    expect(readFileSync('lib/babylon/modes/dunkContestDefer.ts', 'utf8')).toMatch(/export const DUNK_PRELOAD_SET_ON = 0;/);
  });
  it('every rival body Flight Night can pick is on the roster and its file is in public/ (the files were never the problem)', () => {
    for (const r of DUNK_RIVALS) {
      const url = rosterBodyUrl(r.body);
      expect(url, r.id).toBeTruthy();
      expect(existsSync(`public${url}`), `${r.id} → ${url}`).toBe(true);
    }
  });
});

describe('the fix: prefetchRivalBody', () => {
  const ok = () => vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  it('setting off: fetches nothing', () => {
    const f = ok();
    expect(prefetchRivalBody('/models/rivals/jinx.glb', false, f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(prefetchedRivalBodies()).toEqual([]);
  });
  it('setting on: fetches the file once (read to the end, low priority), and never twice for the same URL', async () => {
    const f = ok();
    expect(await prefetchRivalBody('/models/rivals/jinx.glb', true, f)).toBe(true);
    expect(prefetchRivalBody('/models/rivals/jinx.glb', true, f)).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith('/models/rivals/jinx.glb', expect.objectContaining({ priority: 'low', credentials: 'same-origin' }));
  });
  it('never throws: no URL, no fetch, a failed fetch, a fetch that throws', async () => {
    expect(prefetchRivalBody(null, true, ok())).toBeNull();
    vi.stubGlobal('fetch', undefined);
    expect(prefetchRivalBody('/a.glb', true)).toBeNull();   // no fetch at all (an old runtime)
    vi.unstubAllGlobals();
    expect(await prefetchRivalBody('/b.glb', true, vi.fn(async () => { throw new Error('offline'); }))).toBe(false);
    expect(await prefetchRivalBody('/c.glb', true, () => { throw new Error('sync'); })).toBe(false);
    expect(await prefetchRivalBody('/d.glb', true, vi.fn(async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) })))).toBe(false);
  });
  it('uses the global fetch by default', async () => {
    const f = ok(); vi.stubGlobal('fetch', f);
    expect(await prefetchRivalBody('/models/rivals/grit.glb', true)).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('DunkMode calls it where the set queues, behind the setting', () => {
  const body = dunk.slice(dunk.indexOf('function startContestSet(ctx: ModeContext): void {'), dunk.indexOf('contestSetStarted = true;', dunk.indexOf('function startContestSet(')));
  it('in startContestSet, before the queue, on the same not-quiet test, for tonight\'s foe, with the setting from the server', () => {
    expect(body).toMatch(/if \(!contestHisTurn && !dunkQuiet\(\)\) void prefetchRivalBody\(rosterBodyUrl\(foe\.body\), demoModelFlags\(\)\.rivalPrefetch\);/);
    expect(body.indexOf('prefetchRivalBody(')).toBeLessThan(body.indexOf('contestDefer.ask('));
  });
  it('the queue, the quiet beat and the spawn itself are unchanged (only the file is fetched early)', () => {
    expect(body).toMatch(/if \(!contestHisTurn && !contestDefer\.ask\(dunkQuiet\(\)\)\) \{ console\.info\('\[DUNK-BUDGET\] not a quiet beat — the contest set waits for one'\); return; \}/);
    expect(dunk.match(/prefetchRivalBody\(/g)).toHaveLength(1);
  });
});
