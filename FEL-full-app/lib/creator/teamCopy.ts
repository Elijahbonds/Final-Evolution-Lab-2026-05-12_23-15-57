export const TEAM_LEDE_STORE_OPEN = 'Meet the people behind FEL. Book a session through the coach store, or request a quote.';

export const TEAM_LEDE_STORE_CLOSED = 'Meet the people behind FEL. Request a quote for collaborations and sessions while booking is closed.';

export function teamPageLede(coachStoreOpen: boolean): string {
  return coachStoreOpen ? TEAM_LEDE_STORE_OPEN : TEAM_LEDE_STORE_CLOSED;
}
