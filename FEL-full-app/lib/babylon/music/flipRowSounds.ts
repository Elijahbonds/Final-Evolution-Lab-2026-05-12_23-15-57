// flipRowSounds — WHICH SOUND A FLIP ROW PLAYS (MUSIC-SUITE P3 FIX PASS, "Keep my work", 2026-09-25).
//
// What was wrong (the P3 review, measured against the code): the engine's sounds were only ever ADDED. AudioEngine
// .loadBuffer sets samples[id] and nothing deleted one, while the room's project-opened effect loaded only the NEW
// project's Flip rows. So:
//   * project A had pad 1 sent from '808 kick' (flip_0 = A's chop); the player opened project B, whose flip_0 chop points
//     at a mic take whose bytes were never stored — B's "FLIP 1" row kept playing A's 808 kick while the room said
//     "FLIP 1: the sound isn't on this device any more", and PUBLISH rendered that kick into B's mixdown while the record
//     said the row had no chop;
//   * even when B's chop DID load, A's played on B's row until the fetch and decode finished;
//   * an undo's reload had no generation guard, so a reload still in flight could land on the next project's row.
// Now: opening a project drops every flip_* sound first (a row is silent until its own chop is in), a chop that can't be
// loaded is UNLOADED (a row that "plays nothing" is silent), an undo unloads the rows it removed, and every load checks
// `alive()` (the room passes its project generation) before it touches the engine.
//
// Engine-facing but not React: the tests run it on the real AudioEngine over fakeWebAudio.ts.
import type { ProjectFlipRow } from './StudioProject';
import { isFlipRowId } from './MusicTiers';
import { changedFlipRows, removedFlipRows } from './studioEdit';

/** The part of AudioEngine this touches. */
export interface FlipSampleSink {
  loadBuffer(id: string, name: string, buffer: AudioBuffer, category: 'melody'): void;
  unloadSample(id: string): void;
  dropSamples(match: (id: string) => boolean): string[];
}

/** Load each row's chop under its row id; a row whose chop can't be had is unloaded. Returns the labels that failed. */
export async function loadFlipRowSounds(
  eng: FlipSampleSink, rows: readonly ProjectFlipRow[], chop: (row: ProjectFlipRow) => Promise<AudioBuffer>, alive: () => boolean = () => true,
): Promise<string[]> {
  const gone: string[] = [];
  for (const row of rows) {
    try {
      const buffer = await chop(row);
      if (!alive()) return gone;
      eng.loadBuffer(row.sampleId, row.label, buffer, 'melody');
    } catch {
      if (!alive()) return gone;
      eng.unloadSample(row.sampleId);
      gone.push(row.label);
    }
  }
  return gone;
}

/** Another project opened: every Flip sound goes, then that project's rows load. Returns the labels that failed. */
export function openFlipRowSounds(
  eng: FlipSampleSink, rows: readonly ProjectFlipRow[], chop: (row: ProjectFlipRow) => Promise<AudioBuffer>, alive: () => boolean = () => true,
): Promise<string[]> {
  eng.dropSamples(isFlipRowId);
  return loadFlipRowSounds(eng, rows, chop, alive);
}

/** An undo / redo moved the Flip rows: rows it removed go silent, rows with another chop load it. */
export function reloadFlipRowSounds(
  eng: FlipSampleSink, before: readonly ProjectFlipRow[], after: readonly ProjectFlipRow[],
  chop: (row: ProjectFlipRow) => Promise<AudioBuffer>, alive: () => boolean = () => true,
): Promise<string[]> {
  for (const id of removedFlipRows(before, after)) eng.unloadSample(id);
  return loadFlipRowSounds(eng, changedFlipRows(before, after), chop, alive);
}
