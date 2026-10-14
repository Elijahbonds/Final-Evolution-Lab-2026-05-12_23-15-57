// QA-H2 (hoops grade 0d16f5dd): a finish in flight at a reload was lost (a WON 1v1 12–4, 0 finish POSTs after). A finish now
// retries, survives a reload in the outbox, and the card says when it did not get through.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OUTBOX_KEY, OUTBOX_MAX_AGE_MS, FINISH_RETRY_MS, KEEP_STATUS, settled, saveFinish, pendingFinishes, postFinish, sendFinish, flushFinishes, type FinishDeps,
} from './finishOutbox';
import { unpaidTitle, unpaidLine } from './unpaidCopy';

function mem() { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; }
function deps(answers: (number | 'reset')[]) {
  const sent: string[] = [], waits: number[] = [];
  const d: FinishDeps = {
    fetch: async (_u, init) => { sent.push(String(init.body)); const a = answers.shift() ?? 'reset'; if (a === 'reset') throw new Error('reset'); return new Response('{}', { status: a }); },
    sleep: async (ms) => { waits.push(ms); },
  };
  return { d, sent, waits };
}

describe('QA-H2: a finish is never silently lost', () => {
  it('retries a network error and a 5xx, then stops on the first answer', async () => {
    const { d, sent, waits } = deps(['reset', 503, 200]);
    const r = await postFinish('{"runId":"r1"}', d);
    expect(r?.status).toBe(200);
    expect(sent).toHaveLength(3);
    expect(waits).toEqual(FINISH_RETRY_MS.slice(0, 2));
  });
  it('a 4xx is the server deciding: no retry', async () => {
    const { d, sent } = deps([422]);
    expect((await postFinish('{}', d))?.status).toBe(422);
    expect(sent).toHaveLength(1);
  });
  it('never through: null after the first try and every retry', async () => {
    const { d, sent } = deps([]);
    expect(await postFinish('{}', d)).toBeNull();
    expect(sent).toHaveLength(FINISH_RETRY_MS.length + 1);
  });
  it('saved before it is sent; cleared once answered; kept when it never got through', async () => {
    const st = mem();
    await sendFinish(st, 'r1', deps([200]).d, 0, '{"a":1}', 'u1');
    expect(pendingFinishes(st, 1)).toEqual([]);
    await sendFinish(st, 'r2', deps([]).d, 0, '{"a":2}', 'u1');
    expect(pendingFinishes(st, 1).map((p) => p.runId)).toEqual(['r2']);
  });
  it('a reload re-sends what was owed, exactly as it was, once', async () => {
    const st = mem();
    saveFinish(st, 'r9', '{"runId":"r9","score":12}', 0, 'u1');
    const { d, sent } = deps([200]);
    expect(await flushFinishes(st, d, 1000, 'u1')).toBe(1);
    expect(sent).toEqual(['{"runId":"r9","score":12}']);
    expect(await flushFinishes(st, deps([200]).d, 2000, 'u1')).toBe(0);
  });
  it('too old to be paid: dropped, not re-sent', async () => {
    const st = mem();
    saveFinish(st, 'old', '{}', 0, 'u1');
    const { d, sent } = deps([200]);
    expect(await flushFinishes(st, d, OUTBOX_MAX_AGE_MS, 'u1')).toBe(0);
    expect(sent).toEqual([]);
    expect(JSON.parse(st.m.get(OUTBOX_KEY)!)).toEqual([]);
  });
  it('the card says it did not save, in plain words', () => {
    expect(unpaidTitle('NOT_SAVED')).toBe('NOT SAVED YET');
    expect(unpaidLine('NOT_SAVED')).toMatch(/didn't reach the server/);
  });
  it('the shell sends every finish through the outbox, flushes on mount, and says NOT_SAVED when nothing came back', () => {
    const s = readFileSync(join(__dirname, '../../components/games/game-shell.tsx'), 'utf8');
    expect(s).toMatch(/started\.then\(\(runId\) => sendFinish\(finishStore\(\), runId, \{ \.\.\.FINISH_DEPS, fetch: \(_url, init\) => fetch\('\/api\/sessions', init\) \}, Date\.now\(\), JSON\.stringify\(\{/);
    expect(s.match(/fetch\('\/api\/sessions'/g)).toHaveLength(1);
    // the finish is saved under the signed-in user, and the flush runs once /api/profile has said who that is
    expect(s).toMatch(/\}\), finishUser\.current\)\)/);
    expect(s).toMatch(/finishUser\.current = typeof j\?\.profile\?\.userId === 'string' \? j\.profile\.userId : null;\s*void flushFinishes\(finishStore\(\), FINISH_DEPS, Date\.now\(\), finishUser\.current\);/);
    expect(s).not.toMatch(/flushFinishes\(finishStore\(\), FINISH_DEPS, Date\.now\(\)\)/);
    // an answer still in the outbox is NOT_SAVED on the card, not a silent zero
    expect(s).toMatch(/\.then\(\(r\) => \(r && settled\(r\) \? r\.json\(\)/);
    expect(s).toMatch(/!j \? \{ unpaid: 'NOT_SAVED' \}/);
  });
});

// QA FAIL on #265 (qa-paysonce-268-265-264): a 401 and a 404 cleared the entry, so the finish was lost after all; and the outbox
// re-sent whatever it held under whoever was signed in.
describe('QA-H2 fix: kept until the server decides about the run; re-sent only for the user who played it', () => {
  it('the keep list is exactly 401 / 403 / 404 / 408 / 429; 2xx and the run refusals settle', () => {
    expect([...KEEP_STATUS].sort()).toEqual([401, 403, 404, 408, 429]);
    for (const s of [200, 400, 409, 422]) expect(settled(new Response('{}', { status: s }))).toBe(true);
    for (const s of [401, 403, 404, 408, 429, 500, 503]) expect(settled(new Response('{}', { status: s }))).toBe(false);
  });
  it('REPRO 401 (signed out mid-run): the entry is kept, then paid once the user is back', async () => {
    const st = mem();
    const first = deps([401]);
    const r = await sendFinish(st, 'r401', first.d, 0, '{"runId":"r401","score":12}', 'u1');
    expect(r?.status).toBe(401);
    expect(first.sent).toHaveLength(1);   // a 401 waits for the next page: no in-page hammering
    expect(pendingFinishes(st, 1).map((p) => p.runId)).toEqual(['r401']);
    const later = deps([200]);
    expect(await flushFinishes(st, later.d, 1000, 'u1')).toBe(1);
    expect(later.sent).toEqual(['{"runId":"r401","score":12}']);
    expect(pendingFinishes(st, 2000)).toEqual([]);
  });
  it('REPRO 404 (route not up yet): kept through the flush too, sent again later', async () => {
    const st = mem();
    await sendFinish(st, 'r404', deps([404]).d, 0, '{"runId":"r404"}', 'u1');
    expect(pendingFinishes(st, 1).map((p) => p.runId)).toEqual(['r404']);
    expect(await flushFinishes(st, deps([404]).d, 1000, 'u1')).toBe(0);
    expect(pendingFinishes(st, 1001).map((p) => p.runId)).toEqual(['r404']);
    expect(await flushFinishes(st, deps([200]).d, 2000, 'u1')).toBe(1);
    expect(pendingFinishes(st, 2001)).toEqual([]);
  });
  it('408 and 429 are retried in the page; a 403 is kept for later', async () => {
    const a = deps([429, 408, 200]);
    expect((await postFinish('{}', a.d))?.status).toBe(200);
    expect(a.sent).toHaveLength(3);
    const st = mem();
    await sendFinish(st, 'r403', deps([403]).d, 0, '{}', 'u1');
    expect(pendingFinishes(st, 1).map((p) => p.runId)).toEqual(['r403']);
  });
  it('re-sends only the signed-in user\'s entries; nothing when nobody is signed in; an unowned (old) entry is never sent', async () => {
    const st = mem();
    saveFinish(st, 'mine', '{"runId":"mine"}', 0, 'u1');
    saveFinish(st, 'theirs', '{"runId":"theirs"}', 0, 'u2');
    st.setItem(OUTBOX_KEY, JSON.stringify([...JSON.parse(st.getItem(OUTBOX_KEY)!), { runId: 'legacy', body: '{}', at: 0 }]));
    const none = deps([200, 200, 200]);
    expect(await flushFinishes(st, none.d, 1000, null)).toBe(0);
    expect(none.sent).toEqual([]);
    const u1 = deps([200, 200, 200]);
    expect(await flushFinishes(st, u1.d, 1000, 'u1')).toBe(1);
    expect(u1.sent).toEqual(['{"runId":"mine"}']);
    expect(pendingFinishes(st, 1001).map((p) => [p.runId, p.userId])).toEqual([['theirs', 'u2'], ['legacy', null]]);
  });
});
