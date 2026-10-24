// lib/mail/transport.ts — the one seam every sender goes through. A transport takes a finished envelope and either
// delivers it or throws. lib/mail/index.ts decides whether to call one at all (the flag, the address).
import type { MailEnvelope } from './message';

export interface MailTransport {
  readonly name: string;
  send(m: MailEnvelope): Promise<void>;
}

/** Development: says that a message would have gone, and nothing about it (no address, subject or body). */
export const logTransport: MailTransport = {
  name: 'log',
  async send() {
    console.info('[mail] log transport: one message accepted, not sent (MAIL_TRANSPORT=log)');
  },
};
