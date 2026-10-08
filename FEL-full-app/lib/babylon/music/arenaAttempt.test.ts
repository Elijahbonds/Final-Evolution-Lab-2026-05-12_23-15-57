// MUSIC-SUITE P6 FIX PASS (2026-09-26): the room's side of an Arena music attempt (arenaAttempt.ts) — posting START and
// FINISH so a flaky connection never loses a played set, and what the room does with each answer. A stubbed fetch plays
// the network: a request that throws, one that hangs past the timeout, a 502, then the real answer.
import { describe, expect, it } from 'vitest';
import {
  ARENA_FINISH_UNSENT, ARENA_START_UNKNOWN, arenaFinishKey, arenaFinishVerdict, arenaStartVerdict, clearArenaFinish, makeAttemptId,
  postArenaAttempt, readArenaFinish, saveArenaFinish, type ArenaPostResult,
} from './arenaAttempt';
import { cleanAttemptId } from '../../arena-music';

type Step = { status: number; body: unknown } | 'throw' | 'hang';
/** A fetch that answers `steps` in order (and records every request body). */
function stubFetch(steps: Step[]) {
  const sent: unknown[] = [];
  let i = 0;
  const fn = async (_url: string, init: { body: string; signal?: AbortSignal }) => {
    sent.push(JSON.parse(init.body));
    const s = steps[Math.min(i++, steps.length - 1)];
    if (s === 'throw') throw new TypeError('Failed to fetch');
    if (s === 'hang') return new Promise<never>(() => undefined);
    return { status: s.status, json: async () => s.body };
  };
  return { fn, sent };
}
const noSleep = async () => undefined;

describe('postArenaAttempt: retried on no answer or a 5xx, with the SAME body; any other answer is final', () => {
  it('a network error, then a 502, then the answer: three tries, one body', async () => {
    const { fn, sent } = stubFetch(['throw', { status: 502, body: null }, { status: 200, body: { ok: true, phase: 'start' } }]);
    const r = await postArenaAttempt(fn, { matchId: 'm', phase: 'start', attemptId: 'room-abc12345' }, { sleep: noSleep });
    expect(r).toEqual({ status: 200, body: { ok: true, phase: 'start' } });
    expect(sent).toHaveLength(3);
    expect(new Set(sent.map((b) => JSON.stringify(b))).size).toBe(1);
  });

  it('a request that hangs is cut at the timeout and retried (it used to hang the room on "Sending your set…" for good)', async () => {
    const { fn, sent } = stubFetch(['hang', { status: 200, body: { ok: true, score: 1200 } }]);
    const r = await postArenaAttempt(fn, { phase: 'finish', taps: [] }, { sleep: noSleep, timeoutMs: 20 });
    expect(r.status).toBe(200);
    expect(sent).toHaveLength(2);
  });

  it('a 4xx is final (not retried); every try failing answers "no answer" (status null)', async () => {
    const refused = stubFetch([{ status: 409, body: { error: 'ONE_ATTEMPT' } }, { status: 200, body: {} }]);
    expect((await postArenaAttempt(refused.fn, {}, { sleep: noSleep })).status).toBe(409);
    expect(refused.sent).toHaveLength(1);
    const down = stubFetch(['throw']);
    expect(await postArenaAttempt(down.fn, {}, { sleep: noSleep, tries: 3 })).toEqual({ status: null, body: null });
    expect(down.sent).toHaveLength(3);
  });
});

describe('arenaStartVerdict — never "nothing was used" on an outcome the room cannot know', () => {
  const v = (r: ArenaPostResult) => arenaStartVerdict(r);
  it('200 plays; ONE_ATTEMPT is a USED attempt carrying what it scores (the room submits it now — #29)', () => {
    expect(v({ status: 200, body: { ok: true } })).toEqual({ kind: 'play' });
    expect(v({ status: 409, body: { error: 'ONE_ATTEMPT', finished: false, score: 0 } })).toEqual({ kind: 'used', finished: false, score: 0 });
    expect(v({ status: 409, body: { error: 'ONE_ATTEMPT', finished: true, score: 41_250 } })).toEqual({ kind: 'used', finished: true, score: 41_250 });
    expect(v({ status: 409, body: { error: 'ONE_ATTEMPT' } })).toEqual({ kind: 'used', finished: false, score: 0 });
  });
  it('no answer / a 5xx after every retry: RETRY with the unknown-outcome words (START again picks the same attempt up)', () => {
    for (const r of [{ status: null, body: null }, { status: 503, body: null }]) {
      expect(v(r)).toEqual({ kind: 'retry', line: ARENA_START_UNKNOWN });
    }
    expect(ARENA_START_UNKNOWN).not.toMatch(/nothing was used/);
    expect(ARENA_START_UNKNOWN).toMatch(/same attempt is picked up/);
  });
  it('waiting for an opponent is a retry; every other refusal is final, in the Arena\'s words', () => {
    expect(v({ status: 409, body: { error: 'WAITING_OPPONENT', detail: 'Waiting…' } })).toEqual({ kind: 'retry', line: 'Waiting…' });
    for (const error of ['TOO_LATE', 'EXPIRED', 'ALREADY_SCORED', 'NOT_SUBMITTABLE', 'PRE_HOUSE_BEAT']) {
      expect(v({ status: 409, body: { error, detail: `because ${error}` } })).toEqual({ kind: 'refused', line: `because ${error}` });
    }
    expect(v({ status: 403, body: null })).toEqual({ kind: 'refused', line: 'The Arena said no (403).' });
  });
});

describe('arenaFinishVerdict — onEnd only once the Arena has the set', () => {
  it('200 (or a replay of the same list) is sent, with the server\'s score; ALREADY_FINISHED is sent with the score on file', () => {
    expect(arenaFinishVerdict({ status: 200, body: { ok: true, score: 3300 } })).toEqual({ kind: 'sent', score: 3300 });
    expect(arenaFinishVerdict({ status: 200, body: { ok: true, replayed: true, score: 3300 } })).toEqual({ kind: 'sent', score: 3300 });
    expect(arenaFinishVerdict({ status: 409, body: { error: 'ALREADY_FINISHED', score: 2900 } })).toEqual({ kind: 'sent', score: 2900 });
  });
  it('no answer / 5xx: UNSENT and retryable (kept on the device); a refusal a retry cannot change: unsent and final', () => {
    expect(arenaFinishVerdict({ status: null, body: null })).toEqual({ kind: 'unsent', line: ARENA_FINISH_UNSENT, final: false });
    expect(arenaFinishVerdict({ status: 500, body: null })).toMatchObject({ kind: 'unsent', final: false });
    expect(arenaFinishVerdict({ status: 409, body: { error: 'EXPIRED', detail: 'This duel has expired.' } })).toEqual({ kind: 'unsent', line: 'Your set was refused by the Arena: This duel has expired..', final: true });
  });
});

describe('the set kept on the device until sent; the attempt id', () => {
  const mem = () => { const m = new Map<string, string>(); return { m, store: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } } }; };
  it('kept by match, read back only as a list of { lane, tMs }, cleared once sent; a broken store never throws', () => {
    const { m, store } = mem();
    const taps = [{ lane: 'kick' as const, tMs: 0.5 }, { lane: 'snare' as const, tMs: 480 }];
    expect(saveArenaFinish(store, 'm1', taps)).toBe(true);
    expect(m.has(arenaFinishKey('m1'))).toBe(true);
    expect(readArenaFinish(store, 'm1')).toEqual(taps);
    expect(readArenaFinish(store, 'm2')).toBeNull();
    m.set(arenaFinishKey('m3'), '{"not":"a list"}');
    expect(readArenaFinish(store, 'm3')).toBeNull();
    clearArenaFinish(store, 'm1');
    expect(readArenaFinish(store, 'm1')).toBeNull();
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    expect([saveArenaFinish(broken, 'm', taps), readArenaFinish(broken, 'm'), saveArenaFinish(null, 'm', taps)]).toEqual([false, null, false]);
    expect(() => clearArenaFinish(broken, 'm')).not.toThrow();
  });
  it('makeAttemptId is one the route will store, and a new one each page', () => {
    let x = 1;
    const a = makeAttemptId(() => ((x = (x * 16807) % 2147483647) / 2147483647), 1_790_000_000_000);
    expect(cleanAttemptId(a)).toBe(a);
    expect(makeAttemptId()).not.toBe(makeAttemptId());
  });
});
