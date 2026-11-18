/**
 * VENICE V1: what the hub page shows over the scene, fed by VeniceHubMode (the story's storyUi pattern,
 * adventure/story/uiBridge.ts): the walk-up spot the player stands in, or none. An external store React reads with
 * useSyncExternalStore; the mode writes it only when the spot changes.
 */
import type { Spot } from './layout';
import { feel } from '@/lib/feel-panel/feel';

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

/**
 * Improvement pass phase 9 (finding your way): where the player is, for the page's mini-map. A separate store so the card does not
 * re-render ten times a second; the mode writes it on the walk-up's clock (every 0.1 s), and only when the player has moved.
 */
/** venue.veniceWayfinding (phase 9): the page's first-visit hint, mini-map and card keys (app/play/venice/wayfinding.tsx). 0 = V1. */
export const VENICE_WAYFINDING = 1;
/** Whether the page shows the hint, the mini-map and the card keys (read once on the client). */
export const wayfindingOn = (): boolean => feel('venue.veniceWayfinding', VENICE_WAYFINDING) >= 0.5;

export interface HubPos { x: number; z: number; yaw: number }
class HubPosStore {
  private state: HubPos | null = null;
  private readonly listeners = new Set<() => void>();
  getSnapshot = (): HubPos | null => this.state;
  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  set(x: number, z: number, yaw: number): void {
    const s = this.state;
    if (s && Math.abs(s.x - x) < 0.25 && Math.abs(s.z - z) < 0.25 && Math.abs(s.yaw - yaw) < 0.05) return;
    this.state = { x, z, yaw };
    this.listeners.forEach((fn) => fn());
  }
  reset(): void { this.state = null; this.listeners.forEach((fn) => fn()); }
}
export const hubPos = new HubPosStore();
