// inviteEmail — the words of an emailed coach invite (coach-loop P1). Pure: the route sends it through lib/mail.
//
// What it carries: the coach's display name (the person who typed the address), the link, the code and when it
// expires. What it never carries: anyone else's name or address, the coach's roster, or the recipient's own details.
// A plain product email, not a policy statement; the privacy text that covers email is the owner's (see the lane report).

import { formatCode } from './inviteCode';

export interface InviteEmailInput {
  coachName: string;
  /** The name the coach typed beside the address, if any. Used for the greeting only. */
  athleteName: string | null;
  link: string;
  code: string | null;
  /** Where a code is typed, as a full URL (origin + /coach/join). The code line is left out without it. */
  codeUrl: string | null;
  expiresAt: Date;
  /** COACH-DELIVERY COA-04: the coach's brand line ("Dee Lane · Dee Strength", lib/coach/branding.ts brandSignOff), or null.
   *  The email stays plain text (lib/mail: no HTML), so the brand is a sign-off, never a logo or a colour. */
  signOff?: string | null;
}

const firstWord = (s: string | null) => (s ?? '').trim().split(/\s+/)[0] || null;

export function inviteEmail(i: InviteEmailInput): { subject: string; text: string } {
  const coach = i.coachName.trim() || 'Your coach';
  const hi = firstWord(i.athleteName);
  const until = i.expiresAt.toISOString().slice(0, 10);
  const lines = [
    hi ? `Hi ${hi},` : 'Hi,',
    '',
    `${coach} invited you to train with them on Final Evolution Lab.`,
    '',
    `Open this link to join: ${i.link}`,
    ...(i.code && i.codeUrl ? ['', `Or go to ${i.codeUrl} and type the code: ${formatCode(i.code)}`] : []),
    '',
    `The invite works once and closes on ${until}.`,
    '',
    'If you were not expecting this, you can ignore it. Nothing happens unless you open the link and join.',
    ...(i.signOff ? ['', `— ${i.signOff}`] : []),
  ];
  return { subject: `${coach} invited you to train on Final Evolution Lab`, text: lines.join('\n') };
}
