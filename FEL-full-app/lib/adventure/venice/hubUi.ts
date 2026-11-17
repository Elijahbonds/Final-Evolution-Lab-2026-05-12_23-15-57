/**
 * VENICE V1: what the hub page shows over the scene, fed by VeniceHubMode (the story's storyUi pattern,
 * adventure/story/uiBridge.ts): the walk-up spot the player stands in, or none. An external store React reads with
 * useSyncExternalStore; the mode writes it only when the spot changes.
 */
import type { Spot } from './layout';

export interface HubUiState { spot: Spot | null }

class HubUi {
  private state: HubUiState = { spot: null };
  private readonly listeners = new Set<() => void>();
  getSnapshot = (): HubUiState => this.state;
  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  setSpot(spot: Spot | null): void {
    if ((spot?.id ?? null) === (this.state.spot?.id ?? null)) return;
    this.state = { spot };
    this.listeners.forEach((fn) => fn());
  }
  reset(): void { this.setSpot(null); }
}

export const hubUi = new HubUi();
