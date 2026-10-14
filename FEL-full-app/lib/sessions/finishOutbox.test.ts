// QA-H2 (hoops grade 0d16f5dd): a finish in flight at a reload was lost (a WON 1v1 12–4, 0 finish POSTs after). A finish now
// retries, survives a reload in the outbox, and the card says when it did not get through.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OUTBOX_KEY, OUTBOX_MAX_AGE_MS, FINISH_RETRY_MS, saveFinish, pendingFinishes, postFinish, sendFinish, flushFinishes, type FinishDeps,
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
    await sendFinish(st, 'r1', deps([200]).d, 0, '{"a":1}');
    expect(pendingFinishes(st, 1)).toEqual([]);
    await sendFinish(st, 'r2', deps([]).d, 0, '{"a":2}');
    expect(pendingFinishes(st, 1).map((p) => p.runId)).toEqual(['r2']);
  });
  it('a reload re-sends what was owed, exactly as it was, once', async () => {
    const st = mem();
    saveFinish(st, 'r9', '{"runId":"r9","score":12}', 0);
    const { d, sent } = deps([200]);
    expect(await flushFinishes(st, d, 1000)).toBe(1);
    expect(sent).toEqual(['{"runId":"r9","score":12}']);
    expect(await flushFinishes(st, deps([200]).d, 2000)).toBe(0);
  });
  it('too old to be paid: dropped, not re-sent', async () => {
    const st = mem();
    saveFinish(st, 'old', '{}', 0);
    const { d, sent } = deps([200]);
    expect(await flushFinishes(st, d, OUTBOX_MAX_AGE_MS)).toBe(0);
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
    expect(s).toMatch(/useEffect\(\(\) => \{ void flushFinishes\(finishStore\(\), FINISH_DEPS, Date\.now\(\)\); \}, \[\]\);/);
    expect(s).toMatch(/!j \? \{ unpaid: 'NOT_SAVED' \}/);
  });
});
