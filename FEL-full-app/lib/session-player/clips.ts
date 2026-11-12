// lib/session-player/clips.ts — PLAT-P01 (2026-10-27): each library exercise → the loop that IS its movement.
//
// The same choice the library's own stage makes (lib/library/demo.ts demoClipFor: the entry's structured tags, never its
// name; a whitelist, so no loop is better than a wrong one). An exercise with no loop gets null, and the player shows the
// still start pose labelled "Demo coming" (components/library/avatar-demo.tsx) — never another movement. demo-loops owns
// the loops; when it adds one, the player picks it up here with no change.
//
// Run on the server: the library is ~2 MB of JSON and never ships to a browser. The page hands the player the map.
//
// Pure.
import { demoClipFor } from '@/lib/library/demo';

export interface DemoTags { family: string; variation: string; equipment: readonly string[] }

export function clipsFor(ids: Iterable<string>, entry: (id: string) => DemoTags | null): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const id of ids) {
    if (id in out) continue;
    const e = entry(id);
    out[id] = e ? demoClipFor(e) : null;
  }
  return out;
}
