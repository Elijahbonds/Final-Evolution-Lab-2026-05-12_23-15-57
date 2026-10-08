// ABACUS-KILL (2026-09-29): each library path that can reach Abacus.AI, with the flag unset and with it on.
// global.fetch is a mock in every test, so nothing here can reach a real endpoint; ABACUS_ENABLED is unset unless a
// test sets it, and it is put back afterwards.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined;
      throw new Error(`the path touched prisma.${String(prop)}`);
    },
  }),
}));

import { sendWelcomeEmail, notifyAdminNewLead, sendReengageEmail, sendReferralRewardEmail } from '@/lib/marketing/email';
import { callLLM, completeText } from '@/lib/cell-engine';
import { callModel } from '@/lib/cell-providers';
import { callCoachLLM, CoachServiceError } from '@/lib/coach-service';
import { AiDisabledError } from '@/lib/abacus/killSwitch';
import type { Provider } from '@/lib/cell-models';

const ENV_KEYS = [
  'ABACUS_ENABLED', 'ABACUSAI_API_KEY', 'NEXTAUTH_URL', 'WEB_APP_ID',
  'NOTIF_ID_WELCOME_EMAIL', 'NOTIF_ID_NEW_LEAD_CAPTURED', 'NOTIF_ID_COME_BACK_PLAY', 'NOTIF_ID_REFERRAL_REWARD',
] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

let fetchSpy: ReturnType<typeof vi.fn>;
const urls = () => fetchSpy.mock.calls.map((c) => String(c[0]));

/** A body every mocked endpoint can answer with: OpenAI-, Anthropic-, Gemini- and notification-shaped at once. */
function okBody(): Response {
  return new Response(
    JSON.stringify({
      success: true,
      choices: [{ message: { content: 'ok' } }],
      content: [{ text: 'ok' }],
      candidates: [{ content: { parts: [{ text: 'ok' }] } }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  // With the switch ON these make every sender and the coach really try to send, so an unset switch is the ONLY
  // thing stopping them in the "off" tests.
  process.env.ABACUSAI_API_KEY = 'test-key-not-real';
  process.env.NEXTAUTH_URL = 'https://fel.example.test';
  process.env.NOTIF_ID_WELCOME_EMAIL = 'n-welcome';
  process.env.NOTIF_ID_NEW_LEAD_CAPTURED = 'n-lead';
  process.env.NOTIF_ID_COME_BACK_PLAY = 'n-reengage';
  process.env.NOTIF_ID_REFERRAL_REWARD = 'n-referral';
  fetchSpy = vi.fn(async () => okBody());
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const SENDERS = [
  ['welcome', () => sendWelcomeEmail('player@example.test', 'Player')],
  ['lead-alert', () => notifyAdminNewLead('lead@example.test', 'landing')],
  ['reengage', () => sendReengageEmail('player@example.test', 'Player', 1200, 30)],
  ['referral', () => sendReferralRewardEmail('player@example.test', 'Player', 25)],
] as const;

const PROVIDERS: Provider[] = ['abacus', 'openai', 'anthropic', 'google'];
const HOST: Record<Provider, string> = {
  abacus: 'apps.abacus.ai',
  openai: 'api.openai.com',
  anthropic: 'api.anthropic.com',
  google: 'generativelanguage.googleapis.com',
};
const callProvider = (provider: Provider) =>
  callModel({ provider, model: 'm', messages: [{ role: 'user', content: 'hi' }], apiKey: provider === 'abacus' ? undefined : 'user-key' });

describe('flag UNSET: zero Abacus requests on every covered path', () => {
  describe.each(SENDERS)('marketing email: %s', (kind, run) => {
    it('returns false, sends nothing, logs one line with no address in it, and never throws', async () => {
      const info = vi.spyOn(console, 'info').mockImplementation(() => {});
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(run()).resolves.toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(info).toHaveBeenCalledTimes(1);
      const line = String(info.mock.calls[0][0]);
      expect(line).toBe(`[marketing/email] skipped: ABACUS_ENABLED off (${kind})`);
      expect(info.mock.calls[0]).toHaveLength(1);
      expect(line).not.toContain('@');
      // the kind ('welcome', …) is meant to be there; the name, the lead source and the subject are not
      expect(line).not.toMatch(/Player|landing|Final Evolution|rewards are waiting|referral reward/i);
      expect(error).not.toHaveBeenCalled();
    });
  });

  it('CELL callLLM throws AiDisabledError before any fetch', async () => {
    await expect(callLLM({ role: 'architect', messages: [{ role: 'user', content: 'hi' }] })).rejects.toBeInstanceOf(AiDisabledError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('CELL completeText throws AiDisabledError before any fetch', async () => {
    await expect(completeText({ role: 'builder', messages: [{ role: 'user', content: 'hi' }] })).rejects.toBeInstanceOf(AiDisabledError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(PROVIDERS)('CELL callModel(%s) throws AiDisabledError and makes no network call at all', async (provider) => {
    await expect(callProvider(provider)).rejects.toBeInstanceOf(AiDisabledError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('coach-service callCoachLLM throws its CoachServiceError(…coming soon, 503) before the fetch', async () => {
    const err = await callCoachLLM('system', [{ role: 'user', content: 'hi' }]).catch((e) => e);
    expect(err).toBeInstanceOf(CoachServiceError);
    expect(err.status).toBe(503);
    expect(err.message).toMatch(/coming soon/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("ABACUS_ENABLED='true': every covered path still reaches its (mocked) endpoint once", () => {
  beforeEach(() => {
    process.env.ABACUS_ENABLED = 'true';
  });

  it.each(SENDERS)('marketing email: %s posts once to the notification endpoint', async (_kind, run) => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await expect(run()).resolves.toBe(true);
    expect(urls()).toEqual(['https://apps.abacus.ai/api/sendNotificationEmail']);
    expect(info).not.toHaveBeenCalled();
  });

  it('callLLM posts once to the Abacus completions endpoint', async () => {
    const res = await callLLM({ role: 'architect', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.ok).toBe(true);
    expect(urls()).toEqual(['https://apps.abacus.ai/v1/chat/completions']);
  });

  it('completeText posts once to the Abacus completions endpoint', async () => {
    expect(await completeText({ role: 'builder', messages: [{ role: 'user', content: 'hi' }] })).toBe('ok');
    expect(urls()).toEqual(['https://apps.abacus.ai/v1/chat/completions']);
  });

  it.each(PROVIDERS)('callModel(%s) posts once to its own provider', async (provider) => {
    expect((await callProvider(provider)).content).toBe('ok');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(new URL(urls()[0]).hostname).toBe(HOST[provider]);
  });

  it('callCoachLLM posts once to the Abacus completions endpoint', async () => {
    expect(await callCoachLLM('system', [{ role: 'user', content: 'hi' }])).toBe('ok');
    expect(urls()).toEqual(['https://apps.abacus.ai/v1/chat/completions']);
  });
});
