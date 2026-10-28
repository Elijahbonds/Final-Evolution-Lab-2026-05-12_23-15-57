// demoWarm — the exercise demo's body, fetched before the stage needs it (DEMO-SPEED, 2026-10-27).
//
// Owner: the demo autoplays, with no extra taps. Measured on the slow-phone rig, its first moving frame waited on two long
// things in a row: Babylon's chunks, then the body's GLB (the scan: 8.2 MB, its phone file 3.3 MB). Nothing about the
// body's FILE needs Babylon — only which body this player wears (the server's hero-body answer) and this device's tier
// (the scan's phone file on a phone). So the file is fetched here, Babylon-free, into the HTTP cache:
//   · by the stage itself the moment it mounts, alongside Babylon's download (exercise-stage.tsx buildStage);
//   · on idle, by a page that WILL show a demo (avatar-demo.tsx warmAvatarDemo, from use-auto-open.ts) — never on a
//     data-saver connection (navigator.connection.saveData): a demo the person has not reached yet is a speculative
//     download, and save-data says no to those. The demo itself still loads when it opens.
// The file it asks for is the one CharacterLibrary will load: heroBody's urlForHeroBody + scanUrlForTier (one rule), with
// the tier from tierRule's deviceTierDecision (the stage stamps the same decision on its scene). The hero-body read is
// handed on to the spawn's identity read (heroBodyRead.ts), so the server is asked once.
//
// assumption: a teen whose look lives on the device (TEEN_DEVICE_LOOK_EVERYWHERE) may wear a different body than the
// server's answer; for them the early fetch is a wasted download and the spawn fetches its own file — never a wrong body.
//
// No Babylon in this file or anything it imports (lib/assess/replay.test.ts walks the drill surfaces' imports).
import { readHeroBodyEarly } from '@/lib/babylon/core/heroBodyRead';
import { scanUrlForTier, urlForHeroBody, type HeroBodyKind } from '@/lib/babylon/core/heroBody';
import { deviceTierDecision } from '@/lib/babylon/scene/tierRule';

/** The body file a stage on this device spawns, for a body kind and a tier (the rule CharacterLibrary loads by). */
export function demoBodyUrl(kind: HeroBodyKind | null | undefined, tier: string): string {
  return scanUrlForTier(urlForHeroBody(kind ?? 'kit-male'), tier);
}

/** The visitor's data-saver setting (Chrome / Android: navigator.connection.saveData). */
export function saveDataOn(): boolean {
  try { return (navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData === true; } catch { return false; }
}

let warming: { url: string | null; done: Promise<void> } | null = null;

/** Fetch the body this device's stage will spawn into the HTTP cache (once a page); resolves when it is in, or failed. */
export function warmDemoBody(): Promise<void> {
  if (warming) return warming.done;
  const w: { url: string | null; done: Promise<void> } = { url: null, done: Promise.resolve() };
  w.done = (async () => {
    const answer = await readHeroBodyEarly();
    const url = demoBodyUrl(answer?.body, deviceTierDecision().tier);
    w.url = url;
    const r = await fetch(url);
    await r.arrayBuffer();   // read to the end, so the whole file is in the cache; the bytes themselves are dropped
  })().catch(() => undefined);
  warming = w;
  return w.done;
}

/** The file the warm-up fetched (null until the server's answer is in, or with no warm-up). For the rig and the tests. */
export function warmedBodyUrl(): string | null { return warming?.url ?? null; }

/** For tests: forget the page's warm-up. */
export function resetDemoWarm(): void { warming = null; }
