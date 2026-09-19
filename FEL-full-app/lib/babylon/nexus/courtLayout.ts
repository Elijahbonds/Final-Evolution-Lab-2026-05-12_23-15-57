// COURT LAYOUT (2026-09-18): the 3v3's court has two layouts — the open half court, and the CHOKEPOINT (core/Chokepoint.ts:
// rails flank the lane, wings close the corners). Picked on the splash like a place: `?choke=1` (or `?court=chokepoint`)
// wins, then the remembered pick, then the open court.

export type CourtLayoutId = 'open' | 'chokepoint';
export const COURT_LAYOUTS: readonly { id: CourtLayoutId; name: string; sub: string; tint: string }[] = [
  { id: 'open', name: 'Open Court', sub: 'THE HALF COURT AS IT IS', tint: '#22d3ee' },
  { id: 'chokepoint', name: 'Chokepoint', sub: 'RAILS FLANK THE LANE · WINGS CLOSE THE CORNERS · RAIL RUNS, A LANE THAT DOUBLES THE DRAFT', tint: '#fbbf24' },
];
export const COURT_LAYOUT_MODES: readonly string[] = ['threevthree'];
export const COURT_KEY_PREFIX = 'fel-court-';

export function readCourtLayout(modeId: string, search?: string): CourtLayoutId {
  if (!COURT_LAYOUT_MODES.includes(modeId)) return 'open';
  try {
    const q = new URLSearchParams(search ?? (typeof window !== 'undefined' ? window.location.search : ''));
    const choke = q.get('choke'), court = q.get('court');
    if (choke === '1' || choke === 'true' || choke === 'on' || court === 'chokepoint') return 'chokepoint';
    if (choke === '0' || court === 'open') return 'open';
    if (typeof window !== 'undefined') { const s = window.localStorage.getItem(COURT_KEY_PREFIX + modeId); if (s === 'chokepoint') return 'chokepoint'; }
  } catch { /* convenience only */ }
  return 'open';
}
export function writeCourtLayout(modeId: string, id: CourtLayoutId): void {
  try { window.localStorage.setItem(COURT_KEY_PREFIX + modeId, id); } catch { /* convenience only */ }
}
