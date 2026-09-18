// The Instacart key path, proven without the network. The key here is a FAKE in-process string — never a real key,
// never written to any env file. The route's auth is mocked; the fetch is a recorder.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDP_DEFAULT_HOST, IDP_PRODUCTS_LINK_PATH } from './instacart';
import { mintInstacartList, parseItems, type FetchLike } from './instacartMint';
import type { IdpProductsLinkPayload } from './instacart';

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

const FAKE_KEY = 'fel-test-fake-key-not-real';
const ITEMS = [
  { name: 'rolled oats', qty: 80, unit: 'g', aisleHint: 'cereal' },
  { name: 'lime', qty: 1, unit: 'each' },
  { name: 'soy sauce', qty: 1, unit: 'tbsp', optional: true },
];

function recorder(reply: { ok: boolean; status: number; json: unknown } = { ok: true, status: 200, json: { products_link_url: 'https://example.invalid/list/abc' } }) {
  const calls: Array<{ url: string; init: { method: string; headers: Record<string, string>; body: string } }> = [];
  const fetchImpl: FetchLike = async (url, init) => { calls.push({ url, init }); return { ok: reply.ok, status: reply.status, json: async () => reply.json }; };
  return { calls, fetchImpl };
}

describe('FEL Kitchens — Instacart mint (no network)', () => {
  it('answers 409 locked while the key is absent and never touches fetch', async () => {
    const { calls, fetchImpl } = recorder();
    for (const env of [{}, { INSTACART_IDP_KEY: '' }, { INSTACART_IDP_KEY: '   ' }]) {
      const r = await mintInstacartList({ items: ITEMS, env: env as NodeJS.ProcessEnv, fetchImpl });
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ locked: true });
    }
    expect(calls).toHaveLength(0);
  });

  it('with a fake key, POSTs the IDP products_link payload to the dev host with a Bearer header — and returns the link', async () => {
    const { calls, fetchImpl } = recorder();
    const r = await mintInstacartList({ items: ITEMS, linkbackUrl: 'https://fel.local/kitchens/fuel', env: { INSTACART_IDP_KEY: FAKE_KEY } as NodeJS.ProcessEnv, fetchImpl });
    expect(r).toEqual({ status: 200, body: { url: 'https://example.invalid/list/abc' } });
    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls;
    expect(url).toBe(IDP_DEFAULT_HOST + IDP_PRODUCTS_LINK_PATH);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${FAKE_KEY}` });
    const body = JSON.parse(init.body) as IdpProductsLinkPayload;
    expect(body).toMatchObject({ title: 'FEL Kitchens · today\'s fuel', link_type: 'shopping_list', expires_in: 30 });
    expect(body.instructions?.[0]).toContain('not medical advice');
    expect(body.line_items).toEqual([
      { name: 'rolled oats', quantity: 80, unit: 'gram', display_text: 'rolled oats — 80 g' },
      { name: 'lime', quantity: 1, unit: 'each', display_text: 'lime — 1 each' },
      { name: 'soy sauce', quantity: 1, unit: 'tablespoon', display_text: 'soy sauce — 1 tbsp (optional)' },
    ]);
    expect(body.landing_page_configuration).toEqual({ partner_linkback_url: 'https://fel.local/kitchens/fuel', enable_pantry_items: true });
    expect(init.body).not.toContain(FAKE_KEY); // the key rides the header only
  });

  it('honours INSTACART_IDP_HOST, trims the key, and drops a non-http linkback', async () => {
    const { calls, fetchImpl } = recorder();
    await mintInstacartList({ items: ITEMS, linkbackUrl: 'javascript:alert(1)', env: { INSTACART_IDP_KEY: `  ${FAKE_KEY}  `, INSTACART_IDP_HOST: 'https://connect.instacart.example ' } as NodeJS.ProcessEnv, fetchImpl });
    expect(calls[0].url).toBe('https://connect.instacart.example' + IDP_PRODUCTS_LINK_PATH);
    expect(calls[0].init.headers.Authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect((JSON.parse(calls[0].init.body) as IdpProductsLinkPayload).landing_page_configuration).toEqual({ enable_pantry_items: true });
  });

  it('400 without well-formed items; malformed lines are dropped and the list is capped at 60', async () => {
    const { calls, fetchImpl } = recorder();
    const env = { INSTACART_IDP_KEY: FAKE_KEY } as NodeJS.ProcessEnv;
    expect((await mintInstacartList({ items: [], env, fetchImpl })).status).toBe(400);
    expect((await mintInstacartList({ items: 'nope', env, fetchImpl })).status).toBe(400);
    expect((await mintInstacartList({ items: [{ name: 'x', qty: 'a lot', unit: 'g' }, { name: 'y', qty: 1, unit: 'furlong' }], env, fetchImpl })).status).toBe(400);
    expect(calls).toHaveLength(0);
    const many = Array.from({ length: 80 }, (_, i) => ({ name: `item ${i}`, qty: 1, unit: 'each' }));
    expect(parseItems([...many, null, 5, { name: '  ', qty: 1, unit: 'g' }])).toHaveLength(60);
    expect(parseItems([{ name: ' lime ', qty: 2, unit: 'each', optional: 1 }])).toEqual([{ name: 'lime', qty: 2, unit: 'each', optional: true, aisleHint: undefined, externalSkuHint: null }]);
  });

  it('502 when Instacart answers without a link, errors, or is unreachable', async () => {
    const env = { INSTACART_IDP_KEY: FAKE_KEY } as NodeJS.ProcessEnv;
    expect(await mintInstacartList({ items: ITEMS, env, fetchImpl: recorder({ ok: false, status: 401, json: { error: 'bad key' } }).fetchImpl })).toEqual({ status: 502, body: { error: 'Instacart did not return a link', status: 401 } });
    expect((await mintInstacartList({ items: ITEMS, env, fetchImpl: recorder({ ok: true, status: 200, json: {} }).fetchImpl })).status).toBe(502);
    const down: FetchLike = async () => { throw new Error('ECONNREFUSED'); };
    expect(await mintInstacartList({ items: ITEMS, env, fetchImpl: down })).toEqual({ status: 502, body: { error: 'Instacart unreachable' } });
  });
});

describe('FEL Kitchens — /api/kitchens/instacart-list route (auth mocked, fetch stubbed)', () => {
  const originalFetch = globalThis.fetch;
  let recorded: Array<{ url: string; init: RequestInit | undefined }>;

  beforeEach(async () => {
    recorded = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => { recorded.push({ url, init }); return new Response(JSON.stringify({ products_link_url: 'https://example.invalid/list/xyz' }), { status: 200, headers: { 'Content-Type': 'application/json' } }); });
    const { getServerSession } = await import('next-auth');
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1', email: 'playtest@fel.local' } } as never);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); globalThis.fetch = originalFetch; });

  const post = async (body: unknown) => {
    const { POST } = await import('@/app/api/kitchens/instacart-list/route');
    return POST(new Request('http://fel.local/api/kitchens/instacart-list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  };

  it('GET reports locked without the key and available with a fake one; POST is 409 locked without it', async () => {
    vi.stubEnv('INSTACART_IDP_KEY', '');
    const { GET } = await import('@/app/api/kitchens/instacart-list/route');
    expect(await (await GET()).json()).toEqual({ available: false });
    const r = await post({ items: ITEMS });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ locked: true });
    expect(recorded).toHaveLength(0);
    vi.stubEnv('INSTACART_IDP_KEY', FAKE_KEY);
    expect(await (await GET()).json()).toEqual({ available: true });
  });

  it('401 without a session, and no fetch', async () => {
    vi.stubEnv('INSTACART_IDP_KEY', FAKE_KEY);
    const { getServerSession } = await import('next-auth');
    vi.mocked(getServerSession).mockResolvedValueOnce(null as never);
    expect((await post({ items: ITEMS })).status).toBe(401);
    expect(recorded).toHaveLength(0);
  });

  it('with the fake key, the route sends exactly the mint\'s payload through the real fetch seam and answers with the link', async () => {
    vi.stubEnv('INSTACART_IDP_KEY', FAKE_KEY);
    const r = await post({ items: ITEMS, linkbackUrl: 'https://fel.local/kitchens/fuel' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ url: 'https://example.invalid/list/xyz' });
    expect(recorded).toHaveLength(1);
    expect(recorded[0].url).toBe(IDP_DEFAULT_HOST + IDP_PRODUCTS_LINK_PATH);
    const headers = recorded[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${FAKE_KEY}`);
    const body = JSON.parse(String(recorded[0].init?.body)) as IdpProductsLinkPayload;
    expect(body.link_type).toBe('shopping_list');
    expect(body.line_items.map((l) => l.name)).toEqual(['rolled oats', 'lime', 'soy sauce']);
    expect(body.landing_page_configuration?.partner_linkback_url).toBe('https://fel.local/kitchens/fuel');
  });
});
