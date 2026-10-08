// MULTIPLAYER (2026-10-06): the REST transport's request shape, against a fake Upstash endpoint (fetch is mocked; no
// network). docs/DEPLOY-CHECKLIST-PARTY.md section 5 named the risk: the old transport put every value in the URL path
// and rewrote the TV's whole mailbox per message, so a busy room could outgrow the endpoint's URL limit (414). The fake
// below answers 414 to any URL over 2 KB, the way a real edge does, so a value back in the URL fails here.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KvSignalStore, restKvTransport } from './kvSignalStore';

const BASE = 'https://fel-test.upstash.io';
const TOKEN = 'tok-123';
const URL_LIMIT = 2048;

interface Call { url: string; method: string; body: unknown; headers: Record<string, string> }

/** A minimal Redis behind the Upstash REST dialect: POST <base> [cmd...] and POST <base>/pipeline [[cmd...]...]. */
function fakeUpstash() {
  const strings = new Map<string, string>();
  const lists = new Map<string, string[]>();
  const ttl = new Map<string, number>();
  const calls: Call[] = [];

  const run = (cmd: unknown[]): { result?: unknown; error?: string } => {
    const [op, key, ...args] = cmd.map(String);
    switch (op.toUpperCase()) {
      case 'GET': return { result: strings.get(key) ?? null };
      case 'SET': {
        strings.set(key, args[0]);
        if (args[1]?.toUpperCase() === 'EX') ttl.set(key, Number(args[2]));
        return { result: 'OK' };
      }
      case 'INCR': {
        const n = Number(strings.get(key) ?? '0') + 1;
        strings.set(key, String(n));
        return { result: n };
      }
      case 'EXPIRE': ttl.set(key, Number(args[0])); return { result: 1 };
      case 'RPUSH': {
        if (strings.has(key)) return { error: 'WRONGTYPE Operation against a key holding the wrong kind of value' };
        const l = lists.get(key) ?? [];
        l.push(...args);
        lists.set(key, l);
        return { result: l.length };
      }
      case 'LTRIM': {
        const l = lists.get(key) ?? [];
        const len = l.length;
        const norm = (i: number) => (i < 0 ? Math.max(0, len + i) : i);
        lists.set(key, l.slice(norm(Number(args[0])), norm(Number(args[1])) + 1));
        return { result: 'OK' };
      }
      case 'LRANGE': {
        const l = lists.get(key) ?? [];
        const len = l.length;
        const norm = (i: number) => (i < 0 ? Math.max(0, len + i) : i);
        return { result: l.slice(norm(Number(args[0])), norm(Number(args[1])) + 1) };
      }
      default: return { error: `ERR unknown command ${op}` };
    }
  };

  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method: init?.method ?? 'GET', body, headers: (init?.headers ?? {}) as Record<string, string> });
    if (url.length > URL_LIMIT) return new Response('URI Too Long', { status: 414 });
    if ((init?.headers as Record<string, string>)?.Authorization !== `Bearer ${TOKEN}`) {
      return new Response('{"error":"unauthorized"}', { status: 401 });
    }
    if (init?.method !== 'POST' || !Array.isArray(body)) return new Response('{"error":"bad"}', { status: 400 });
    if (url === `${BASE}/pipeline`) return Response.json((body as unknown[][]).map(run));
    if (url === BASE) return Response.json(run(body));
    return new Response('{"error":"not found"}', { status: 404 });
  });

  return { strings, lists, ttl, calls, fetchImpl };
}

let kv: ReturnType<typeof fakeUpstash>;

beforeEach(() => {
  kv = fakeUpstash();
  vi.stubGlobal('fetch', kv.fetchImpl);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('restKvTransport request shape', () => {
  it('sends SET as a JSON command array in the body, with the TTL, and nothing but the base URL', async () => {
    const t = restKvTransport(BASE, TOKEN);
    await t.set('felcl:AB12:meta', '{"code":"AB12"}', 7200);
    expect(kv.calls).toHaveLength(1);
    const c = kv.calls[0];
    expect(c.url).toBe(BASE);
    expect(c.method).toBe('POST');
    expect(c.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(c.body).toEqual(['SET', 'felcl:AB12:meta', '{"code":"AB12"}', 'EX', '7200']);
    expect(kv.ttl.get('felcl:AB12:meta')).toBe(7200);
    expect(await t.get('felcl:AB12:meta')).toBe('{"code":"AB12"}');
  });

  it('never puts a value in the URL across a whole join (create, announce, signal, poll)', async () => {
    const store = new KvSignalStore(restKvTransport(BASE, TOKEN));
    const sdp = 'v=0 o=- 4611 2 IN IP4 127.0.0.1 a=candidate:abc';
    await store.createRoom('AB12', 'party', 'tv');
    await store.addPeer('AB12', 'phone-1', 'Elijah');
    await store.push('AB12', { from: 'phone-1', to: 'tv', data: { sdp } });
    await store.poll('AB12', 'tv', 0);
    expect(kv.calls.length).toBeGreaterThan(0);
    for (const c of kv.calls) {
      expect([BASE, `${BASE}/pipeline`]).toContain(c.url);
      expect(c.url).not.toContain('Elijah');
      expect(c.url).not.toContain('felcl');
      expect(Array.isArray(c.body)).toBe(true);
    }
  });

  it('carries a 64 KB value through push and poll (the old URL-path transport got 414 here)', async () => {
    const store = new KvSignalStore(restKvTransport(BASE, TOKEN));
    await store.createRoom('AB12', 'party', 'tv');
    const big = 'x'.repeat(64 * 1024);
    const seq = await store.push('AB12', { from: 'phone-1', to: 'tv', data: { sdp: big } });
    expect(seq).toBe(1);
    const got = await store.poll('AB12', 'tv', 0);
    expect(got).toHaveLength(1);
    expect((got[0].data as { sdp: string }).sdp).toBe(big);
    expect(kv.calls.every((c) => c.url.length <= URL_LIMIT)).toBe(true);
  });

  it('a big set() goes through too (rooms and peers use set)', async () => {
    const t = restKvTransport(BASE, TOKEN);
    const big = 'y'.repeat(64 * 1024);
    await t.set('felcl:AB12:peers', big, 7200);
    expect(await t.get('felcl:AB12:peers')).toBe(big);
  });

  it('keeps the 2-hour TTL on every key a join writes', async () => {
    const store = new KvSignalStore(restKvTransport(BASE, TOKEN));
    await store.createRoom('AB12', 'party', 'tv');
    await store.addPeer('AB12', 'phone-1', 'Sam');
    await store.push('AB12', { from: 'phone-1', to: 'tv', data: 1 });
    for (const key of ['felcl:AB12:meta', 'felcl:AB12:peers', 'felcl:AB12:seq', 'felcl:AB12:mlist:tv']) {
      expect(kv.ttl.get(key), key).toBe(7200);
    }
  });

  it('appends one message per push (RPUSH + LTRIM + EXPIRE in one pipeline), not the whole mailbox', async () => {
    const store = new KvSignalStore(restKvTransport(BASE, TOKEN));
    await store.createRoom('AB12', 'party', 'tv');
    for (let i = 0; i < 5; i++) await store.push('AB12', { from: 'p', to: 'tv', data: { i } });
    const appends = kv.calls.filter((c) => c.url === `${BASE}/pipeline` && (c.body as string[][])[0][0] === 'RPUSH');
    expect(appends).toHaveLength(5);
    const last = appends[4].body as string[][];
    expect(last.map((cmd) => cmd[0])).toEqual(['RPUSH', 'LTRIM', 'EXPIRE']);
    expect(last[0].length).toBe(3); // key + exactly ONE message
    expect(JSON.parse(last[0][2]).data).toEqual({ i: 4 });
    expect(last[1]).toEqual(['LTRIM', 'felcl:AB12:mlist:tv', '-200', '-1']);
  });

  it('caps the mailbox at the newest 200 and polls in sequence order', async () => {
    const store = new KvSignalStore(restKvTransport(BASE, TOKEN));
    await store.createRoom('AB12', 'party', 'tv');
    for (let i = 0; i < 205; i++) await store.push('AB12', { from: 'p', to: 'tv', data: i });
    const got = await store.poll('AB12', 'tv', 0);
    expect(got).toHaveLength(200);
    expect(got[0].seq).toBe(6);
    expect(got[199].seq).toBe(205);
    expect((await store.poll('AB12', 'tv', 204)).map((m) => m.seq)).toEqual([205]);
  });

  it('two phones signalling at once both land (the old get-modify-set could drop one)', async () => {
    const store = new KvSignalStore(restKvTransport(BASE, TOKEN));
    await store.createRoom('AB12', 'party', 'tv');
    await Promise.all([
      store.push('AB12', { from: 'phone-1', to: 'tv', data: 'hello-1' }),
      store.push('AB12', { from: 'phone-2', to: 'tv', data: 'hello-2' }),
    ]);
    const got = await store.poll('AB12', 'tv', 0);
    expect(got.map((m) => m.data).sort()).toEqual(['hello-1', 'hello-2']);
    expect(got[0].seq).toBeLessThan(got[1].seq);
  });

  it('poll sorts by seq and skips an unreadable entry instead of dropping the mailbox', async () => {
    const store = new KvSignalStore(restKvTransport(BASE, TOKEN));
    kv.lists.set('felcl:AB12:mlist:tv', [
      JSON.stringify({ seq: 3, from: 'a', to: 'tv', data: 3 }),
      'not json',
      JSON.stringify({ seq: 2, from: 'b', to: 'tv', data: 2 }),
    ]);
    expect((await store.poll('AB12', 'tv', 0)).map((m) => m.seq)).toEqual([2, 3]);
  });

  it('a failed command names the command and key but never the value', async () => {
    const t = restKvTransport(BASE, 'wrong-token');
    const secret = 'SDP-SECRET-PAYLOAD';
    await expect(t.set('felcl:AB12:meta', secret, 7200)).rejects.toThrow('KV set felcl:AB12:meta failed: 401');
    await t.set('felcl:AB12:meta', secret, 7200).catch((e: Error) => expect(e.message).not.toContain(secret));
  });

  it('a per-command pipeline error throws (Upstash answers 200 with { error })', async () => {
    const t = restKvTransport(BASE, TOKEN);
    kv.strings.set('felcl:AB12:mlist:tv', 'a string, not a list');
    await expect(t.append('felcl:AB12:mlist:tv', 'm', 200, 7200)).rejects.toThrow(/KV rpush felcl:AB12:mlist:tv failed: WRONGTYPE/);
  });

  it('strips a trailing slash from the URL', async () => {
    const t = restKvTransport(`${BASE}/`, TOKEN);
    await t.set('k', 'v', 60);
    await t.incr('n', 60);
    expect(kv.calls.map((c) => c.url)).toEqual([BASE, `${BASE}/pipeline`]);
  });

  it('incr returns the counter and refreshes its TTL in one round trip', async () => {
    const t = restKvTransport(BASE, TOKEN);
    expect(await t.incr('felcl:AB12:seq', 7200)).toBe(1);
    expect(await t.incr('felcl:AB12:seq', 7200)).toBe(2);
    expect(kv.calls).toHaveLength(2);
    expect(kv.calls[0].body).toEqual([['INCR', 'felcl:AB12:seq'], ['EXPIRE', 'felcl:AB12:seq', '7200']]);
  });
});
