/**
 * THE COAST ZONE: what the page shows over the scene, fed by CoastZoneMode (the Venice hub's hubUi pattern): the spot the
 * player stands in (the boat back to Venice), or none. An external store React reads with useSyncExternalStore; the mode
 * writes it only when something changes.
 */
import type { ZoneSpot } from './zoneLayout';

export interface ZoneUiState { spot: ZoneSpot | null }

class ZoneUi {
  private state: ZoneUiState = { spot: null };
  private readonly listeners = new Set<() => void>();
  getSnapshot = (): ZoneUiState => this.state;
  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  setSpot(spot: ZoneSpot | null): void {
    if ((spot?.id ?? null) === (this.state.spot?.id ?? null)) return;
    this.state = { spot };
    this.listeners.forEach((fn) => fn());
  }
  reset(): void { this.setSpot(null); }
}

export const zoneUi = new ZoneUi();
