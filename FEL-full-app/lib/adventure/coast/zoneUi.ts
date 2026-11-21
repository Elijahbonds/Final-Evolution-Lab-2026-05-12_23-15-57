/**
 * THE COAST ZONE: what the page shows over the scene, fed by CoastZoneMode (the Venice hub's hubUi pattern): the spot the
 * player stands in (the boat back to Venice, a sports spot, one of the townsfolk), the creature log and its last new entry,
 * the side quests and the last one finished. An external store React reads with useSyncExternalStore; the mode writes it only
 * when something changes. The page asks the mode to take a quest through `takeQuest` (the mode installs the handler).
 */
import type { ZoneSpot } from './zoneLayout';
import type { LogEntry } from './creatureLog';
import type { QuestEntry } from './zoneQuests';

export interface Sighting { id: string; name: string; level: 1 | 2; at: number }
export interface QuestNote { id: string; title: string; at: number }
export interface ZoneUiState {
  spot: ZoneSpot | null;
  log: readonly LogEntry[];
  sighting: Sighting | null;
  quests: readonly QuestEntry[];
  questNote: QuestNote | null;
}

const EMPTY: ZoneUiState = { spot: null, log: [], sighting: null, quests: [], questNote: null };

class ZoneUi {
  private state: ZoneUiState = EMPTY;
  private readonly listeners = new Set<() => void>();
  private taker: ((id: string) => void) | null = null;
  getSnapshot = (): ZoneUiState => this.state;
  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private set(next: ZoneUiState): void { this.state = next; this.listeners.forEach((fn) => fn()); }
  setSpot(spot: ZoneSpot | null): void {
    if ((spot?.id ?? null) === (this.state.spot?.id ?? null)) return;
    this.set({ ...this.state, spot });
  }
  setLog(log: readonly LogEntry[], sighting: Sighting | null = this.state.sighting): void { this.set({ ...this.state, log, sighting }); }
  setQuests(quests: readonly QuestEntry[], questNote: QuestNote | null = this.state.questNote): void { this.set({ ...this.state, quests, questNote }); }
  /** The mode's handler for "take this quest" (null when no zone is running). */
  onTakeQuest(fn: ((id: string) => void) | null): void { this.taker = fn; }
  takeQuest = (id: string): void => { this.taker?.(id); };
  reset(): void { this.taker = null; this.set(EMPTY); }
}

export const zoneUi = new ZoneUi();
