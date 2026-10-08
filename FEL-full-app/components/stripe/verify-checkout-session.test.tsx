import { afterEach, describe, expect, it, vi } from 'vitest';
import { postVerifyCheckoutSession } from './verify-checkout-session';

// SEC-F4 NO-WEBHOOK follow-up: the client half of "every success page checks with
// Stripe". What the server answers decides the state — fulfilled grants (once, the
// server dedupes), pending shows the friendly wait, and an error is reported, never
// thrown, because a reload re-verifies and the webhook remains the fallback.

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => fetchMock.mockReset());

function res(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response);
}

describe('postVerifyCheckoutSession', () => {
  it('posts the session id — and ONLY the session id — to the verify route', async () => {
    fetchMock.mockReturnValueOnce(res(200, { status: 'fulfilled', product: 'COIN_PACK' }));
    const r = await postVerifyCheckoutSession('cs_1');
    expect(fetchMock).toHaveBeenCalledWith('/api/stripe/verify-session', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ session_id: 'cs_1' });
    expect(r).toEqual({ state: 'fulfilled', product: 'COIN_PACK' });
  });

  it('an unpaid session is pending, not a grant and not an error', async () => {
    fetchMock.mockReturnValueOnce(res(200, { status: 'pending', product: 'SHARD_PACK' }));
    expect(await postVerifyCheckoutSession('cs_2')).toEqual({ state: 'pending', product: 'SHARD_PACK' });
  });

  it("someone else's session (403) and an unknown one (404) are reported, not grants", async () => {
    fetchMock.mockReturnValueOnce(res(403, { error: 'not_your_session' }));
    expect(await postVerifyCheckoutSession('cs_3')).toEqual({ state: 'error', error: 'not_your_session' });
    fetchMock.mockReturnValueOnce(res(404, { error: 'session_not_found' }));
    expect(await postVerifyCheckoutSession('cs_4')).toEqual({ state: 'error', error: 'session_not_found' });
  });

  it('a network failure is an error state, never a throw', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await postVerifyCheckoutSession('cs_5')).toEqual({ state: 'error', error: 'network' });
  });
});
