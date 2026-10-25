// lib/consent/acceptedEmail.ts — SAFETY lane (SAF-01, 2026-10-25): the email a guardian gets once they said yes,
// carrying the WITHDRAW link (lib/consent/withdraw.ts).
//
// DRAFT, OFF. The words below are product lines for the owner's review, not consent text; the consent wording itself is
// the owner's (OWN-03). Sending needs BOTH switches: EMAIL_ENABLED (every FEL email, lib/mail) and
// GUARDIAN_ACCEPTED_EMAIL_ENABLED (this one, OFF unless exactly "true"), so turning email on for coach invites does not
// start sending this before the owner has read it.
//
// WHERE IT GOES. A coach- or camp-requested consent: the guardian address the facilitator typed (the row's
// guardianEmail). A player-requested consent: the email of the ADULT ACCOUNT that said yes (acceptedById) — never the
// address the minor typed, which nobody has confirmed is a guardian's. The caller passes the address; nothing here
// looks one up. Nothing identifying is logged (lib/mail's rule). Best effort: a failed send never fails the accept.
import { mailLinkOrigin, mailReady, sendMail, type MailMessage } from '@/lib/mail';
import { withdrawHref } from './withdraw';

export function acceptedEmailEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GUARDIAN_ACCEPTED_EMAIL_ENABLED === 'true';
}

/** DRAFT copy (owner review). No birth year, no other person's details: the athlete's first name and the link. */
export function guardianAcceptedEmail(menteeFirstName: string, withdrawUrl: string): Pick<MailMessage, 'subject' | 'text'> {
  const name = menteeFirstName.trim().split(/\s+/)[0] || 'your athlete';
  return {
    subject: `You confirmed ${name} on FEL`,
    text: [
      `Thanks — you confirmed that ${name} can use the parts of FEL that need a parent or guardian's OK.`,
      '',
      'Changed your mind? Withdraw it here at any time. It takes effect straight away:',
      withdrawUrl,
      '',
      'This link is yours. Anyone who has it can withdraw your OK, so keep it to yourself.',
    ].join('\n'),
  };
}

/** Send it, if both switches are on and there is a link to give. Never throws. */
export async function sendAcceptedEmail(to: string | null | undefined, consentId: string, menteeName: string | null | undefined): Promise<'sent' | 'off' | 'failed'> {
  try {
    if (!acceptedEmailEnabled() || !to || !mailReady()) return 'off';
    const origin = mailLinkOrigin();
    const href = withdrawHref(consentId);
    if (!origin || !href) return 'off';
    const r = await sendMail({ to, ...guardianAcceptedEmail(menteeName ?? '', `${origin}${href}`) });
    return r.status === 'sent' ? 'sent' : r.status === 'failed' ? 'failed' : 'off';
  } catch {
    return 'failed';
  }
}
