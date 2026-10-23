// lib/mail/address.ts — is this one email address, as a person typed it? (coach-loop P1)
//
// Deliberately narrow: one address, no display name, no list, no comments, nothing a header could be built out of.
// It is a typo check, not deliverability: the mailbox's own bounce is the real answer.

const MAX_LEN = 254;
const LOCAL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/;
const DOMAIN = /^(?=.{1,253}$)([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

/** The address, trimmed and lower-cased, or null when it is not one plain address. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v || v.length > MAX_LEN || /[\s<>(),;:"[\]\\]/.test(v)) return null;
  const at = v.lastIndexOf('@');
  if (at <= 0 || at !== v.indexOf('@')) return null;
  const local = v.slice(0, at), domain = v.slice(at + 1);
  if (!LOCAL.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  if (!DOMAIN.test(domain)) return null;
  return v.toLowerCase();
}

export const isEmail = (raw: unknown): boolean => normalizeEmail(raw) !== null;
