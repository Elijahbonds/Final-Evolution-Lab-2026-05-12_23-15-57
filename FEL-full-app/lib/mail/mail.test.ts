// lib/mail — the flag, the address check, the message, the Gmail API transport's signing and HTTP shapes, and the logs.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mailConfig, mailLinkOrigin, missingMailSettings } from './config';
import { normalizeEmail } from './address';
import { buildMime, encodeHeaderWord } from './message';
import { GMAIL_SEND_SCOPE, GMAIL_SEND_URL, GOOGLE_TOKEN_URL, gmailApiTransport, serviceAccountJwt } from './gmailApi';
import { mailReady, sendMail } from './index';
import { MAIL_OFF, MAIL_ON, mailOutbox } from '@/tests/helpers/mailOutbox';

afterEach(() => vi.restoreAllMocks());

describe('config', () => {
  it('is off unless EMAIL_ENABLED is exactly "true"', () => {
    for (const v of [undefined, '', '1', 'TRUE', 'yes', 'false']) expect(mailConfig({ EMAIL_ENABLED: v } as NodeJS.ProcessEnv).enabled).toBe(false);
    expect(mailConfig({ EMAIL_ENABLED: 'true' } as NodeJS.ProcessEnv).enabled).toBe(true);
  });
  it('names what is missing, and reads a one-line PEM', () => {
    const cfg = mailConfig({ EMAIL_ENABLED: 'true', MAIL_FROM: 'coach@fel.test', GOOGLE_MAIL_SA_PRIVATE_KEY: 'a\\nb' } as NodeJS.ProcessEnv);
    expect(missingMailSettings(cfg)).toEqual(['GOOGLE_MAIL_SA_EMAIL']);
    expect(cfg.serviceAccountKey).toBe('a\nb');
    expect(missingMailSettings(mailConfig({ EMAIL_ENABLED: 'true', MAIL_TRANSPORT: 'log' } as NodeJS.ProcessEnv))).toEqual([]);
  });
  it('links come from NEXTAUTH_URL, never a request', () => {
    expect(mailLinkOrigin({ NEXTAUTH_URL: 'https://fel.example/ ' } as NodeJS.ProcessEnv)).toBe('https://fel.example');
    expect(mailLinkOrigin({} as NodeJS.ProcessEnv)).toBeNull();
  });
  it('every setting the mailer reads has a line in .env.example', () => {
    const example = readFileSync('.env.example', 'utf8');
    const src = readFileSync('lib/mail/config.ts', 'utf8');
    const names = [...new Set([...src.matchAll(/env\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]))];
    expect(names.length).toBeGreaterThan(5);
    for (const n of names) expect(example, n).toMatch(new RegExp(`^#?\\s*${n}=`, 'm'));
  });
});

describe('normalizeEmail', () => {
  it('takes one plain address, trimmed and lower-cased', () => {
    expect(normalizeEmail('  Sam.Lee+fel@Example.COM ')).toBe('sam.lee+fel@example.com');
  });
  it('refuses lists, display names, header tricks and junk', () => {
    for (const bad of ['', 'sam', 'sam@', '@x.com', 'a@b', 'a b@x.com', 'a@x.com, b@x.com', 'Sam <a@x.com>', 'a@x.com\r\nBcc: z@y.com', 'a..b@x.com', 'a@@x.com', 'a@-x.com', 42, null])
      expect(normalizeEmail(bad), String(bad)).toBeNull();
  });
});

describe('buildMime', () => {
  const env = { to: 'sam@x.test', from: 'coach@fel.test', fromName: 'Final Evolution Lab', subject: 'Zoë invited you', text: 'Hi Zoë\nLine two' };
  it('encodes a UTF-8 subject and carries the body as base64 with CRLF endings', () => {
    const raw = buildMime(env, new Date('2026-10-20T12:00:00Z'));
    expect(raw).toContain(`Subject: ${encodeHeaderWord('Zoë invited you')}`);
    expect(raw).toContain('From: "Final Evolution Lab" <coach@fel.test>');
    expect(raw).toContain('To: <sam@x.test>');
    const body = raw.split('\r\n\r\n')[1];
    expect(Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8')).toBe('Hi Zoë\r\nLine two');
    expect(raw.replace(/\r\n/g, '')).not.toMatch(/\n/);
  });
  it('refuses a line break in any header (no injected Bcc)', () => {
    expect(() => buildMime({ ...env, subject: 'hi\r\nBcc: z@y.test' })).toThrow(/Subject/);
    expect(() => buildMime({ ...env, to: 'a@x.test\nBcc: z@y.test' })).toThrow(/To/);
  });
});

describe('the Gmail API transport', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const cfg = { ...MAIL_ON, serviceAccountKey: privateKey };

  it('signs an RS256 assertion that verifies, acting as the mailbox with the send scope only', () => {
    const jwt = serviceAccountJwt({ clientEmail: 'sa@x.iam', privateKey, subject: 'coach@fel.test', scope: GMAIL_SEND_SCOPE, nowSec: 1_000 });
    const [h, c, s] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toEqual({ iss: 'sa@x.iam', sub: 'coach@fel.test', scope: GMAIL_SEND_SCOPE, aud: GOOGLE_TOKEN_URL, iat: 1_000, exp: 4_600 });
    const v = createVerify('RSA-SHA256'); v.update(`${h}.${c}`);
    expect(v.verify(publicKey, Buffer.from(s, 'base64url'))).toBe(true);
  });

  it('exchanges the assertion once, then sends the message base64url; the token is reused until it nears expiry', async () => {
    const calls: { url: string; init: { headers: Record<string, string>; body: string } }[] = [];
    let t = 1_000_000;
    const fetch = vi.fn(async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
      calls.push({ url, init });
      return url === GOOGLE_TOKEN_URL
        ? { ok: true, status: 200, json: async () => ({ access_token: `tok-${calls.length}`, expires_in: 3600 }) }
        : { ok: true, status: 200, json: async () => ({ id: 'm1' }) };
    });
    const tr = gmailApiTransport(cfg, { fetch, nowMs: () => t });
    const m = { to: 'sam@x.test', from: 'coach@fel.test', fromName: 'FEL', subject: 'Hi', text: 'Body' };
    await tr.send(m); await tr.send(m);
    expect(calls.map((c) => c.url)).toEqual([GOOGLE_TOKEN_URL, GMAIL_SEND_URL, GMAIL_SEND_URL]);
    expect(new URLSearchParams(calls[0].init.body).get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(calls[1].init.headers.authorization).toBe('Bearer tok-1');
    const raw = Buffer.from(JSON.parse(calls[1].init.body).raw, 'base64url').toString();
    expect(raw).toContain('To: <sam@x.test>');
    t += 3600_000;
    await tr.send(m);
    expect(calls.filter((c) => c.url === GOOGLE_TOKEN_URL).length).toBe(2);
  });

  it('a refused token or send throws with the stage and status only', async () => {
    const fetch = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: 'unauthorized_client' }) }));
    await expect(gmailApiTransport(cfg, { fetch }).send({ to: 'a@x.test', from: 'c@fel.test', fromName: 'F', subject: 's', text: 't' })).rejects.toThrow('gmail token failed (403)');
  });
});

describe('sendMail', () => {
  const msg = { to: 'Sam@X.test', subject: 'Your coach invited you', text: 'Code ABCD-EFGH' };

  it('with the flag off: disabled, and no transport is called', async () => {
    const box = mailOutbox();
    expect(await sendMail(msg, { config: MAIL_OFF, transport: box })).toEqual({ status: 'disabled', reason: 'flag_off' });
    expect(box.sent).toEqual([]);
  });
  it('with the flag on: one message to the normalised address, from the mailbox', async () => {
    const box = mailOutbox();
    expect(await sendMail(msg, { config: MAIL_ON, transport: box })).toEqual({ status: 'sent' });
    expect(box.sent).toEqual([{ ...msg, to: 'sam@x.test', from: 'coach@fel.test', fromName: 'Final Evolution Lab' }]);
  });
  it('a bad address is invalid, a header trick is invalid, a mailbox outage is failed — none of them throw', async () => {
    const box = mailOutbox();
    expect(await sendMail({ ...msg, to: 'not an address' }, { config: MAIL_ON, transport: box })).toEqual({ status: 'invalid' });
    box.failNext = true;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await sendMail(msg, { config: MAIL_ON, transport: box })).toEqual({ status: 'failed' });
    expect(JSON.stringify(err.mock.calls)).not.toMatch(/sam@|Your coach|ABCD/i);
  });
  it('flag on but the mailbox not configured: disabled, and the log names the missing settings, not the message', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await sendMail(msg, { config: { ...MAIL_ON, serviceAccountKey: null } })).toEqual({ status: 'disabled', reason: 'not_configured' });
    expect(String(warn.mock.calls[0][0])).toContain('GOOGLE_MAIL_SA_PRIVATE_KEY');
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/sam@|Your coach/i);
    expect(mailReady(MAIL_OFF)).toBe(false);
  });
});
