// lib/mail/message.ts — one plain-text email as an RFC 5322 message, built by hand (no package).
//
// Two rules matter more than the format:
//   1. NO HEADER INJECTION. A coach types the address; a name can come from a roster. A CR or LF in any header value
//      would let one field write another header (a Bcc to a stranger), so a header value with either is refused.
//   2. UTF-8 SAFE. The subject is RFC 2047 encoded when it is not plain ASCII, and the body travels as base64, so a
//      name like "Zoë" survives every hop.

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain text. No HTML: nothing to sanitise, nothing to track. */
  text: string;
}

export interface MailEnvelope extends MailMessage {
  from: string;
  fromName: string;
}

export class MailHeaderError extends Error {
  constructor(field: string) { super(`mail header ${field} carries a line break`); this.name = 'MailHeaderError'; }
}

const CRLF = '\r\n';

function headerValue(field: string, v: string): string {
  if (/[\r\n]/.test(v)) throw new MailHeaderError(field);
  return v;
}

/** RFC 2047 "B" encoding for a header that is not plain printable ASCII. */
export function encodeHeaderWord(v: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(v)) return v;
  return `=?UTF-8?B?${Buffer.from(v, 'utf8').toString('base64')}?=`;
}

/** A display name in a From line: quoted when plain ASCII, encoded otherwise. */
function displayName(name: string): string {
  const n = name.replace(/["\\]/g, '');
  return encodeHeaderWord(n) === n ? `"${n}"` : encodeHeaderWord(n);
}

function base64Lines(text: string): string {
  const b = Buffer.from(text.replace(/\r?\n/g, CRLF), 'utf8').toString('base64');
  return (b.match(/.{1,76}/g) ?? ['']).join(CRLF);
}

/** The whole message, CRLF line endings, ready for a transport. */
export function buildMime(m: MailEnvelope, now: Date = new Date()): string {
  const headers = [
    `From: ${displayName(headerValue('From', m.fromName))} <${headerValue('From', m.from)}>`,
    `To: <${headerValue('To', m.to)}>`,
    `Subject: ${encodeHeaderWord(headerValue('Subject', m.subject))}`,
    `Date: ${now.toUTCString().replace('GMT', '+0000')}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ];
  return headers.join(CRLF) + CRLF + CRLF + base64Lines(m.text) + CRLF;
}
