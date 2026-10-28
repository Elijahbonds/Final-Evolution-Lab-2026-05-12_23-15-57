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
import { SCAN_BODY_MOBILE_URL, SCAN_BODY_URL, scanUrlForTier, urlForHeroBody, type HeroBodyKind } from '@/lib/babylon/core/heroBody';
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

// The read itself runs in a throwaway worker when the browser has one: the bytes land in the same HTTP cache, and the page's
// main thread — busy evaluating Babylon at exactly this moment — never touches them. Measured on the rig (4× CPU): read on the
// main thread, a WARM visit's 3.3 MB came out of the disk cache in 0.6–1.1 s, because each chunk waited for a turn between
// Babylon's modules; the spawn's own load then waited on it.
const WORKER_SRC = 'onmessage=function(e){fetch(e.data).then(function(r){if(!r.ok)throw 0;return r.arrayBuffer()}).then(function(){postMessage(1)},function(){postMessage(0)})}';

// A warm visit has the file in the HTTP cache already, and fetching it again only costs time (the spawn waits on this). The
// device remembers which file it fetched (localStorage, a per-device convenience: blocked or empty storage just means the
// file is fetched as on a first visit). A remembered file is not fetched again; if the browser evicted it since, the spawn
// fetches it itself, as it always did. Not an only-if-cached probe: a miss logs a network error on every first visit.
// Firebase revalidates a stale file with a 304, so remembering it for a week costs at most a header round trip.
const REMEMBER_KEY = 'fel-demo-body';
const REMEMBER_MS = 7 * 24 * 3600_000;
function remembered(url: string, now = Date.now()): boolean {
  try {
    const v = JSON.parse(localStorage.getItem(REMEMBER_KEY) ?? 'null') as { url?: string; at?: number } | null;
    return !!v && v.url === url && typeof v.at === 'number' && now - v.at < REMEMBER_MS;
  } catch { return false; }
}
function remember(url: string): void {
  try { localStorage.setItem(REMEMBER_KEY, JSON.stringify({ url, at: Date.now() })); } catch { /* storage blocked: fetched again next time */ }
}
const userMark = (k: string) => { try { performance.mark(`fel-warm:${k}`); } catch { /* no User Timing */ } };
function fetchOffThread(url: string): Promise<boolean> | null {
  try {
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    const src = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    const w = new Worker(src);
    URL.revokeObjectURL(src);
    return new Promise<boolean>((done) => {
      const end = (e?: MessageEvent) => { userMark(e?.data === 1 ? 'fetched' : 'failed'); w.terminate(); done(e?.data === 1); };
      w.onmessage = end; w.onerror = () => end();
      w.postMessage(new URL(url, location.href).href);
    });
  } catch { return null; }   // a policy that forbids blob workers: read it here instead
}

/** Fetch the body this device's stage will spawn into the HTTP cache (once a page); resolves when it is in, or failed. */
export function warmDemoBody(): Promise<void> {
  if (warming) return warming.done;
  const w: { url: string | null; done: Promise<void> } = { url: null, done: Promise.resolve() };
  w.done = (async () => {
    userMark('start');
    const answer = await readHeroBodyEarly();
    userMark('answer');
    const url = demoBodyUrl(answer?.body, deviceTierDecision().tier);
    w.url = url;
    if (remembered(url)) { userMark('cached'); return; }
    const off = fetchOffThread(url);
    if (off) { if (await off) remember(url); return; }
    const r = await fetch(url);
    await r.arrayBuffer();   // read to the end, so the whole file is in the cache; the bytes themselves are dropped
    if (r.ok) remember(url);
  })().catch(() => undefined);
  warming = w;
  return w.done;
}

/** The body file a tier-picked URL stands for (the scan's phone file → the scan): what CharacterLibrary.load is asked for,
 *  since it applies the scene's tier itself. */
export function unscaledBodyUrl(url: string): string { return url === SCAN_BODY_MOBILE_URL ? SCAN_BODY_URL : url; }

/** The file the warm-up fetched (null until the server's answer is in, or with no warm-up). For the rig and the tests. */
export function warmedBodyUrl(): string | null { return warming?.url ?? null; }

/** For tests: forget the page's warm-up. */
export function resetDemoWarm(): void { warming = null; }
