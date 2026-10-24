// lib/mail/config.ts — what the mailer reads from the environment, in one place (coach-loop P1, 2026-10-20).
//
// OWNER DECISION (DOCS AUDIT, 2026-10-20): email goes out from the owner's Google Workspace mailbox. The credentials
// arrive in the owner's ops session and live in the environment only — never in code, never in a commit. Every name
// below has a line in .env.example.
//
// OFF BY DEFAULT. Nothing is sent unless EMAIL_ENABLED is exactly 'true' AND a transport is fully configured. With the
// flag off every caller gets { status: 'disabled' } and carries on: an invite still has its link and code, an alert is
// still on the coach's board.

export type MailTransportName = 'gmail_api' | 'log';

export interface MailConfig {
  /** EMAIL_ENABLED === 'true'. Anything else, including unset, is off. */
  enabled: boolean;
  /** MAIL_TRANSPORT: 'gmail_api' (default) sends through the Workspace mailbox; 'log' writes a one-line note, for dev. */
  transport: MailTransportName;
  /** MAIL_FROM: the Workspace mailbox that sends (the service account acts as this user). */
  from: string | null;
  /** MAIL_FROM_NAME: the display name on the From line. */
  fromName: string;
  /** GOOGLE_MAIL_SA_EMAIL: the service account's client_email (domain-wide delegation, scope gmail.send). */
  serviceAccountEmail: string | null;
  /** GOOGLE_MAIL_SA_PRIVATE_KEY: its PEM private key; `\n` escapes are accepted, as env files store it on one line. */
  serviceAccountKey: string | null;
}

const clean = (v: string | undefined): string | null => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

export function mailConfig(env: NodeJS.ProcessEnv = process.env): MailConfig {
  return {
    enabled: env.EMAIL_ENABLED === 'true',
    transport: env.MAIL_TRANSPORT === 'log' ? 'log' : 'gmail_api',
    from: clean(env.MAIL_FROM),
    fromName: clean(env.MAIL_FROM_NAME) ?? 'Final Evolution Lab',
    serviceAccountEmail: clean(env.GOOGLE_MAIL_SA_EMAIL),
    serviceAccountKey: clean(env.GOOGLE_MAIL_SA_PRIVATE_KEY)?.replace(/\\n/g, '\n') ?? null,
  };
}

/** What is missing before this config can send, by env name. Empty = ready. */
export function missingMailSettings(cfg: MailConfig): string[] {
  const missing: string[] = [];
  if (!cfg.enabled) missing.push('EMAIL_ENABLED');
  if (cfg.transport === 'gmail_api') {
    if (!cfg.from) missing.push('MAIL_FROM');
    if (!cfg.serviceAccountEmail) missing.push('GOOGLE_MAIL_SA_EMAIL');
    if (!cfg.serviceAccountKey) missing.push('GOOGLE_MAIL_SA_PRIVATE_KEY');
  }
  return missing;
}

/**
 * The origin links in an email point at: NEXTAUTH_URL, the server's own configured site URL — never a request's
 * Host or Origin header, which a caller controls (the rule lib/stripe/site-origin.ts holds for Stripe). null = unset.
 */
export function mailLinkOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = (env.NEXTAUTH_URL ?? '').trim();
  return raw ? raw.replace(/\/+$/, '') : null;
}
