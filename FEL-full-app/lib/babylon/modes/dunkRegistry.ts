// The registry's dunk entry on its own (FIRST-DUNK-BUDGET, 2026-10-17).
//
// registry.ts statically imports all 29 modes, so the dunk host that mounted MODES.dunk from it put every game's code in the /try
// chunk (its static graph: 1,026 files, against the dunk's own 505). The dunk's hosts (/try, /play/dunk, the party room, all
// through components/games/dunk-babylon.tsx) mount MODES.dunk from here instead: the same key and the same definition object as
// registry.ts's entry (dunkRegistry.test holds them identical), with only the dunk's import graph behind it. registry.ts keeps
// its own `dunk: DunkMode` line — the table every other check reads.
import type { ModeDefinition } from '../core/ModeHarness';
import { DunkMode } from './DunkMode';

export const MODES: Readonly<{ dunk: ModeDefinition }> = { dunk: DunkMode };
