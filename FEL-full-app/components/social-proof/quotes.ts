// quotes — ONB-06: coach and parent quotes for the landing page, each with its own written consent. EMPTY until the owner
// adds real ones (OWN-17: collecting the quotes and the permissions). Nothing is invented here, ever.
//
// A quote is shown only when every rule in usableQuotes holds:
//   - who said it is a coach or a parent (the two voices the owner asked for), and an adult;
//   - they agreed in writing to THIS use (the landing page), on a date, and have not withdrawn;
//   - it names no child: a parent's quote says "my son" or "my daughter", never a minor's name (teens: no public anything).
// The landing shows nothing at all when no quote passes; there is no empty frame and no "coming soon".

export type QuoteRole = 'coach' | 'parent';

export interface SocialQuote {
  id: string;
  role: QuoteRole;
  text: string;
  /** How they are credited, as they agreed to be: "Coach Dana R.", "A parent in Austin". */
  credit: string;
  /** Their own confirmation they are 18 or over. */
  adult: boolean;
  consent: {
    /** Where they agreed it may appear. Only 'landing' is read here. */
    use: readonly 'landing'[];
    /** The date they agreed, YYYY-MM-DD. */
    givenOn: string;
    /** Set when they take it back; the quote disappears on the next deploy. */
    withdrawnOn?: string | null;
  };
}

/** The owner's quotes. Empty until OWN-17 collects them with consent. */
export const QUOTES: readonly SocialQuote[] = [];

/** (new) The most quotes the landing shows. */
export const MAX_LANDING_QUOTES = 3;
const TEXT_MAX = 280;

export function usableQuotes(quotes: readonly SocialQuote[] = QUOTES): SocialQuote[] {
  return quotes
    .filter((q) => (q.role === 'coach' || q.role === 'parent')
      && q.adult === true
      && q.consent.use.includes('landing')
      && /^\d{4}-\d{2}-\d{2}$/.test(q.consent.givenOn)
      && !q.consent.withdrawnOn
      && q.text.trim().length > 0 && q.text.length <= TEXT_MAX
      && q.credit.trim().length > 0)
    .slice(0, MAX_LANDING_QUOTES);
}
