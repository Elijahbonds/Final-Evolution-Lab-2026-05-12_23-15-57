const STREET = /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place|ter|terrace)\b/i;

/** Refuse a street address. A mailing address is allowed only when it does not look like a home street and is not on the block list. */
export function addressRejected(value: string, blockedTerms: readonly string[] = []): string | null {
  const text = value.trim();
  if (!text) return 'empty';
  if (STREET.test(text)) return 'street_address';
  const lower = text.toLowerCase();
  for (const term of blockedTerms) {
    const t = term.trim().toLowerCase();
    if (t && lower.includes(t)) return 'blocked_term';
  }
  return null;
}

export function blockedAddressTerms(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.COACH_STORE_BLOCKED_ADDRESS_TERMS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}
