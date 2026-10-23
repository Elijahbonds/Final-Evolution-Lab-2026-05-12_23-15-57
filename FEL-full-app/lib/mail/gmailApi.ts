// lib/mail/gmailApi.ts — send through the owner's Google Workspace mailbox with the Gmail API, no package.
//
// WHY THIS PATH (and not SMTP). The owner's decision names the Workspace mailbox, "app password / service account in the
// ops session". `nodemailer`, `googleapis` and `google-auth-library` are not dependencies, and adding one needs the
// owner. SMTP without a package means hand-writing a TLS SMTP client; the Gmail API is two HTTPS calls that `fetch` and
// `node:crypto` already do:
//   1. a service-account JWT (RS256), signed here, exchanged at oauth2.googleapis.com/token for an access token —
//      the service account acts AS the mailbox (`sub` = MAIL_FROM) through Workspace domain-wide delegation, with the
//      one scope https://www.googleapis.com/auth/gmail.send;
//   2. POST gmail/v1/users/me/messages/send with the RFC 5322 message, base64url.
// The ops-session setup: create the service account, grant it domain-wide delegation for that scope in the Workspace
// admin console, and put its client_email and private key in GOOGLE_MAIL_SA_EMAIL / GOOGLE_MAIL_SA_PRIVATE_KEY.
//
// NOT VERIFIED against a real mailbox from this lane (no credentials here, by design). The signing is verified with a
// generated key pair and the HTTP shapes against a fake fetch (lib/mail/mail.test.ts). The first real send is the
// owner's, behind EMAIL_ENABLED.
//
// Server only: node:crypto. Nothing here logs an address, a subject, a body or a token.

import { createSign } from 'node:crypto';
import type { MailConfig } from './config';
import { buildMime, type MailEnvelope } from './message';
import type { MailTransport } from './transport';

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** The signed assertion Google exchanges for an access token. One hour at most, as Google requires. */
export function serviceAccountJwt(p: { clientEmail: string; privateKey: string; subject: string; scope: string; nowSec: number }): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: p.clientEmail, sub: p.subject, scope: p.scope, aud: GOOGLE_TOKEN_URL, iat: p.nowSec, exp: p.nowSec + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(p.privateKey).toString('base64url')}`;
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface GmailApiDeps {
  fetch?: Fetch;
  nowMs?: () => number;
}

export class MailSendError extends Error {
  constructor(public readonly stage: 'token' | 'send', public readonly status: number) {
    super(`gmail ${stage} failed (${status})`);
    this.name = 'MailSendError';
  }
}

/** A transport bound to one config. It caches its access token until a minute before it expires. */
export function gmailApiTransport(cfg: MailConfig, deps: GmailApiDeps = {}): MailTransport {
  const doFetch: Fetch = deps.fetch ?? ((url, init) => fetch(url, init) as unknown as ReturnType<Fetch>);
  const now = deps.nowMs ?? (() => Date.now());
  let cached: { token: string; expiresAtMs: number } | null = null;

  async function accessToken(): Promise<string> {
    if (cached && cached.expiresAtMs - 60_000 > now()) return cached.token;
    const assertion = serviceAccountJwt({
      clientEmail: cfg.serviceAccountEmail!, privateKey: cfg.serviceAccountKey!, subject: cfg.from!,
      scope: GMAIL_SEND_SCOPE, nowSec: Math.floor(now() / 1000),
    });
    const res = await doFetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!res.ok || !j.access_token) throw new MailSendError('token', res.status);
    cached = { token: j.access_token, expiresAtMs: now() + (j.expires_in ?? 3600) * 1000 };
    return cached.token;
  }

  return {
    name: 'gmail_api',
    async send(m: MailEnvelope) {
      const token = await accessToken();
      const res = await doFetch(GMAIL_SEND_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ raw: b64url(buildMime(m, new Date(now()))) }),
      });
      if (!res.ok) {
        if (res.status === 401) cached = null;
        throw new MailSendError('send', res.status);
      }
    },
  };
}
