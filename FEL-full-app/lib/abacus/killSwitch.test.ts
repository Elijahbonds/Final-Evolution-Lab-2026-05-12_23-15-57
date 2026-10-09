// ABACUS-KILL (2026-09-29): the switch, the coming-soon answer, GET /api/ai/status and the browser-side helpers.
// Every test runs with ABACUS_ENABLED unset unless it sets it, and puts it back afterwards.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ session: { user: { id: 'athlete-1' } } as unknown }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => m.session) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

import { abacusEnabled, aiComingSoonResponse, AiDisabledError, AI_COMING_SOON } from '@/lib/abacus/killSwitch';
import {
  AI_COMING_SOON_MESSAGE,
  AI_STATUS_PATH,
  availabilityFrom,
  fetchAiAvailability,
  isComingSoonResponse,
} from '@/lib/abacus/aiStatus';
import { GET as statusGET } from '@/app/api/ai/status/route';

const saved = process.env.ABACUS_ENABLED;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  delete process.env.ABACUS_ENABLED;
  m.session = { user: { id: 'athlete-1' } };
  fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  if (saved === undefined) delete process.env.ABACUS_ENABLED;
  else process.env.ABACUS_ENABLED = saved;
  vi.unstubAllGlobals();
});

describe('abacusEnabled(): on only for the exact string "true"', () => {
  it("'true' is on", () => {
    expect(abacusEnabled({ ABACUS_ENABLED: 'true' })).toBe(true);
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['TRUE', 'TRUE'],
    ['1', '1'],
    ['yes', 'yes'],
    ['on', 'on'],
    ['a leading space', ' true'],
    ['a trailing space', 'true '],
    ['false', 'false'],
  ])('%s is off', (_label, value) => {
    expect(abacusEnabled({ ABACUS_ENABLED: value })).toBe(false);
  });

  it('reads process.env at call time, not at import: a restart with the var set turns it on', () => {
    expect(abacusEnabled()).toBe(false);
    process.env.ABACUS_ENABLED = 'true';
    expect(abacusEnabled()).toBe(true);
    process.env.ABACUS_ENABLED = '1';
    expect(abacusEnabled()).toBe(false);
  });

  it('AiDisabledError is a typed Error the routes can recognise', () => {
    const e = new AiDisabledError('callLLM');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('AiDisabledError');
    expect(e.message).toContain('callLLM');
  });
});

describe('the coming-soon answer', () => {
  it.each(['coach', 'studio'] as const)('aiComingSoonResponse(%s) is a 503 {status, feature, message}', async (feature) => {
    const res = aiComingSoonResponse(feature);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'coming_soon', feature, message: AI_COMING_SOON_MESSAGE[feature] });
  });

  it('the copy is neutral: coming soon, no vendor, no age', () => {
    for (const text of [AI_COMING_SOON.message, ...Object.values(AI_COMING_SOON_MESSAGE)]) {
      expect(text).toMatch(/coming soon\.$/);
      expect(text).not.toMatch(/abacus|\bage\b|\bminor|\bunder\b|\b1[38]\b|parent|guardian/i);
    }
    expect(AI_COMING_SOON.status).toBe('coming_soon');
  });

  it('isComingSoonResponse() spots the 503 and leaves the body readable', async () => {
    const res = aiComingSoonResponse('coach');
    expect(await isComingSoonResponse(res)).toBe(true);
    expect((await res.json()).feature).toBe('coach');
    expect(await isComingSoonResponse(new Response('{"status":"coming_soon"}', { status: 200 }))).toBe(false);
    expect(await isComingSoonResponse(new Response('{"error":"down"}', { status: 503 }))).toBe(false);
    expect(await isComingSoonResponse(new Response('not json', { status: 503 }))).toBe(false);
  });
});

describe('GET /api/ai/status', () => {
  it('flag unset: coming_soon for both, and no request leaves', async () => {
    const res = await statusGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ coach: 'coming_soon', studio: 'coming_soon' });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ABACUS_ENABLED='true': available for both", async () => {
    process.env.ABACUS_ENABLED = 'true';
    expect(await (await statusGET()).json()).toEqual({ coach: 'available', studio: 'available' });
  });

  it('signed out: 401 (the route needs a session; the UI reads that as coming_soon)', async () => {
    m.session = null;
    const res = await statusGET();
    expect(res.status).toBe(401);
  });
});

describe('the browser side asks /api/ai/status and nothing else', () => {
  it('fetchAiAvailability makes exactly one request, to /api/ai/status', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ coach: 'available', studio: 'coming_soon' })));
    expect(await fetchAiAvailability('coach')).toBe('available');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe(AI_STATUS_PATH);
    expect(AI_STATUS_PATH).toBe('/api/ai/status');
  });

  it('fails closed: coming_soon on the flag, a 401, a network error or a malformed answer', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ coach: 'available', studio: 'coming_soon' })));
    expect(await fetchAiAvailability('studio')).toBe('coming_soon');
    fetchSpy.mockResolvedValueOnce(new Response('{"error":"Unauthorized"}', { status: 401 }));
    expect(await fetchAiAvailability('coach')).toBe('coming_soon');
    fetchSpy.mockRejectedValueOnce(new TypeError('network down'));
    expect(await fetchAiAvailability('coach')).toBe('coming_soon');
    fetchSpy.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
    expect(await fetchAiAvailability('coach')).toBe('coming_soon');
    expect(availabilityFrom(null, 'coach')).toBe('coming_soon');
    expect(availabilityFrom({ coach: 'yes' }, 'coach')).toBe('coming_soon');
  });
});
