// Test-only (coach-loop P1, 2026-10-20): a mail transport that keeps every envelope in memory, and a config with the
// flag on, so a test can say exactly what would have been sent — and, with the flag off, that nothing was.
import type { MailConfig } from '@/lib/mail/config';
import type { MailEnvelope } from '@/lib/mail/message';
import type { MailTransport } from '@/lib/mail/transport';

export interface MailOutbox extends MailTransport {
  sent: MailEnvelope[];
  /** Make the next send throw (a mailbox that is down). */
  failNext: boolean;
}

export function mailOutbox(): MailOutbox {
  const box: MailOutbox = {
    name: 'outbox',
    sent: [],
    failNext: false,
    async send(m) {
      if (box.failNext) { box.failNext = false; throw new Error('outbox down'); }
      box.sent.push(m);
    },
  };
  return box;
}

export const MAIL_ON: MailConfig = {
  enabled: true, transport: 'gmail_api', from: 'coach@fel.test', fromName: 'Final Evolution Lab',
  serviceAccountEmail: 'sa@fel-test.iam.gserviceaccount.com', serviceAccountKey: 'unused-with-an-outbox',
};
export const MAIL_OFF: MailConfig = { ...MAIL_ON, enabled: false };
