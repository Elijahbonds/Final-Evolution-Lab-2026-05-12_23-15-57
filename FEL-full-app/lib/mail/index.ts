// lib/mail — the mailer every FEL email goes through (coach-loop P1, 2026-10-20). Invites, drift alerts and guardian
// progress reports call sendMail and nothing else.
//
// THE CONTRACT:
//   · OFF unless EMAIL_ENABLED=true and the mailbox is configured (lib/mail/config.ts). Off answers
//     { status: 'disabled' } and calls no transport, no network.
//   · ONE ADDRESS, ONE MESSAGE. The caller passes the address it is allowed to use (one a coach typed, the coach's own,
//     or the guardian's on an accepted consent). This module never looks an address up and never returns one.
//   · BEST EFFORT. A send that fails answers { status: 'failed' }; it never throws into the request that asked.
//   · NOTHING IDENTIFYING IN LOGS: no address, subject, body or token — the reason and the transport name only.
//
// Tests pass their own transport (tests/helpers/mailOutbox.ts) and config; production builds one from the env.

import { mailConfig, missingMailSettings, type MailConfig } from './config';
import { normalizeEmail } from './address';
import { MailHeaderError, type MailMessage } from './message';
import { gmailApiTransport } from './gmailApi';
import { logTransport, type MailTransport } from './transport';

export type { MailMessage } from './message';
export type { MailTransport } from './transport';
export { mailConfig, mailLinkOrigin } from './config';
export { normalizeEmail, isEmail } from './address';

export type SendResult =
  | { status: 'sent' }
  | { status: 'disabled'; reason: 'flag_off' | 'not_configured' }
  | { status: 'invalid' }
  | { status: 'failed' };

export interface SendOptions {
  config?: MailConfig;
  /** Overrides the transport the config would build (tests; a future second transport). */
  transport?: MailTransport;
}

let envTransport: { key: string; t: MailTransport } | null = null;

function transportFor(cfg: MailConfig): MailTransport {
  if (cfg.transport === 'log') return logTransport;
  const key = `${cfg.serviceAccountEmail}|${cfg.from}`;
  if (envTransport?.key !== key) envTransport = { key, t: gmailApiTransport(cfg) };
  return envTransport.t;
}

/** Is email on, and configured, right now? A UI reads this to say "emailed" or "copy the link" honestly. */
export function mailReady(cfg: MailConfig = mailConfig()): boolean {
  return missingMailSettings(cfg).length === 0;
}

export async function sendMail(msg: MailMessage, opts: SendOptions = {}): Promise<SendResult> {
  const cfg = opts.config ?? mailConfig();
  if (!cfg.enabled) return { status: 'disabled', reason: 'flag_off' };
  const to = normalizeEmail(msg.to);
  if (!to) return { status: 'invalid' };
  if (!opts.transport && missingMailSettings(cfg).length) {
    console.warn(`[mail] not sent: missing ${missingMailSettings(cfg).join(', ')}`);
    return { status: 'disabled', reason: 'not_configured' };
  }
  const transport = opts.transport ?? transportFor(cfg);
  try {
    await transport.send({ ...msg, to, from: cfg.from ?? '', fromName: cfg.fromName });
    return { status: 'sent' };
  } catch (e) {
    if (e instanceof MailHeaderError) return { status: 'invalid' };
    console.error(`[mail] ${transport.name} send failed: ${e instanceof Error ? e.name : 'error'}`);
    return { status: 'failed' };
  }
}
