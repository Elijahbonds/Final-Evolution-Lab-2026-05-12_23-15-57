/**
 * THE COAST ZONE: what the page shows over the scene, fed by CoastZoneMode (the Venice hub's hubUi pattern): the spot the
 * player stands in (the boat back to Venice), the creature log, and the last new log entry (a short "seen" / "met" note).
 * An external store React reads with useSyncExternalStore; the mode writes it only when something changes.
 */
import type { ZoneSpot } from './zoneLayout';
import type { LogEntry } from './creatureLog';

export interface Sighting { id: string; name: string; level: 1 | 2; at: number }
export interface ZoneUiState { spot: ZoneSpot | null; log: readonly LogEntry[]; sighting: Sighting | null }

const EMPTY: ZoneUiState = { spot: null, log: [], sighting: null };

class ZoneUi {
  private state: ZoneUiState = EMPTY;
  private readonly listeners = new Set<() => void>();
  getSnapshot = (): ZoneUiState => this.state;
  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private set(next: ZoneUiState): void { this.state = next; this.listeners.forEach((fn) => fn()); }
  setSpot(spot: ZoneSpot | null): void {
    if ((spot?.id ?? null) === (this.state.spot?.id ?? null)) return;
    this.set({ ...this.state, spot });
  }
  setLog(log: readonly LogEntry[], sighting: Sighting | null = this.state.sighting): void { this.set({ ...this.state, log, sighting }); }
  reset(): void { this.set(EMPTY); }
}

export const zoneUi = new ZoneUi();
