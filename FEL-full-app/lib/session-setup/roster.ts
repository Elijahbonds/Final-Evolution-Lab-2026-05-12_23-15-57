// Court-session roster (SESSION-SETUP-V1).
//
// One phone, one session, 1 to 8 athletes. Each person types a name or nickname and an age band.
// Under 13 is blocked. Under 18 and unknown age are nickname-only and never written to storage.
// A self-reported 18+ is tagged 18+ only when this account is server-verified (User.dobYear).
// Otherwise that athlete is treated as unknown: measured on screen, gone when the session ends.

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 8;
export const MIN_DUNKS = 1;
export const MAX_DUNKS = 5;
export const DEFAULT_DUNKS = 3;

/** Adults who passed the server gate may be kept on this device. Nothing else is. */
export const ADULT_ROSTER_KEY = 'fel.session-setup.adults';

export type SessionBand = '13-17' | '18+' | 'unknown';
export type ClaimedAge = 'under-13' | SessionBand;

export interface Athlete {
  id: string;
  name: string;
  band: SessionBand;
}

export interface RosterRow {
  name: string;
  claimed: ClaimedAge;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function clampPlayers(n: number): number {
  if (!Number.isFinite(n)) return MIN_PLAYERS;
  return Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.round(n)));
}

export function clampDunks(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_DUNKS;
  return Math.max(MIN_DUNKS, Math.min(MAX_DUNKS, Math.round(n)));
}

/** Under 13 cannot be added. 18+ counts only after the server says this account is a verified adult. */
export function effectiveBand(claimed: ClaimedAge, serverVerified: boolean): SessionBand | 'blocked' {
  if (claimed === 'under-13') return 'blocked';
  if (claimed === '18+') return serverVerified ? '18+' : 'unknown';
  if (claimed === '13-17') return '13-17';
  return 'unknown';
}

export function rosterReady(rows: readonly RosterRow[], dunksEach: number): boolean {
  if (rows.length < MIN_PLAYERS || rows.length > MAX_PLAYERS) return false;
  if (dunksEach < MIN_DUNKS || dunksEach > MAX_DUNKS) return false;
  if (rows.some((r) => r.claimed === 'under-13')) return false;
  return rows.every((r) => r.name.trim().length > 0 && r.name.trim().length <= 40);
}

export function sealRoster(rows: readonly RosterRow[], serverVerified: boolean): { athletes: Athlete[]; blocked: boolean } {
  if (rows.length > MAX_PLAYERS) return { athletes: [], blocked: true };
  const athletes: Athlete[] = [];
  for (let i = 0; i < rows.length; i++) {
    const name = rows[i].name.trim();
    if (!name || name.length > 40) continue;
    const band = effectiveBand(rows[i].claimed, serverVerified);
    if (band === 'blocked') return { athletes: [], blocked: true };
    athletes.push({ id: `p${i}`, name, band });
  }
  if (athletes.length < MIN_PLAYERS && rows.length > 0 && rows.every((r) => !r.name.trim())) {
    return { athletes: [], blocked: false };
  }
  return { athletes, blocked: false };
}

/** Names that are allowed onto the device. Kids, unknown age, and unverified "18+" are absent. */
export function persistableAthletes(athletes: readonly Athlete[], serverVerified: boolean): Athlete[] {
  if (!serverVerified) return [];
  return athletes.filter((a) => a.band === '18+' && a.name.trim().length > 0).map((a) => ({
    id: a.id,
    name: a.name.trim(),
    band: '18+' as const,
  }));
}

/**
 * Write verified adults only. A kid or unknown nickname never reaches setItem.
 * A session with no verified adult writes nothing, so a kid session cannot wipe or replace the adult list.
 */
export function writeAdults(store: KeyValueStore, athletes: readonly Athlete[], serverVerified: boolean): void {
  const keep = persistableAthletes(athletes, serverVerified);
  if (keep.length === 0) return;
  const payload = JSON.stringify(keep);
  for (const a of athletes) {
    if (a.band !== '18+' && a.name && payload.includes(a.name)) {
      throw new Error('refusing to store a minor or unknown nickname');
    }
  }
  store.setItem(ADULT_ROSTER_KEY, payload);
}

export function readAdults(store: KeyValueStore): Athlete[] {
  const raw = store.getItem(ADULT_ROSTER_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: Athlete[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue;
      const rec = row as { id?: unknown; name?: unknown; band?: unknown };
      if (rec.band !== '18+' || typeof rec.name !== 'string' || typeof rec.id !== 'string') continue;
      const name = rec.name.trim();
      if (!name) continue;
      out.push({ id: rec.id, name, band: '18+' });
    }
    return out;
  } catch {
    return [];
  }
}
