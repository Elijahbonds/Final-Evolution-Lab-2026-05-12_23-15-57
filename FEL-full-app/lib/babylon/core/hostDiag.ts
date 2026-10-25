// game_diag from the modes that do not run through the Babylon harness (PERF-LOAD PRF-07, 2026-10-25).
//
// LAUNCH-CHECKLIST H2: ModeHarness, FrameGuard, CameraDirector, playerIdentity and clipRegistry send `game_diag`, so only a
// mode mounted by runMode() could say it failed to load or how long it took. Groove Academy (/play/music), The Read
// (/play/acting), Hang Time (/play/irl) and Story (/story) are React hosts with their own code and sent nothing: a phone
// whose Academy chunk never arrived, or whose story map never loaded, was invisible.
//
// Two kinds, the harness's own and in its own words, so one query reads every mode:
//   ttfp  once per mount: ms from the host's mount to its first usable screen (`ready=`), and ms since the document began
//         (`page=`). `start` and `first` are '-' (there is no READY card and no START here). The device class only, as
//         perfStats sends it (no user agent, no id); the analytics route stores ttfp with no user or guest id
//         (lib/analyticsAnon.ts).
//   load  a host that could not load: the mode's code chunk failed, or its data read failed. The reason, cut to 160.
// The rate limit is diag.ts's (one per kind per 10 s per page).
import { createElement, useEffect, type ComponentType } from 'react';
import { reportDiag, setDiagMode } from './diag';
import { osClass } from './osClass';   // not perfStats: it imports the tier code, which pulls Babylon into a React host's chunk

export interface HostDiagClock { now(): number; pageNow(): number }

const browserClock: HostDiagClock = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  pageNow: () => (typeof performance !== 'undefined' ? performance.now() : 0),
};

/** Pure: the device class a non-Babylon host can read (no engine: gl and backing are '-'). */
export function hostDevice(): string {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return 'os=other gl=- tier=- dpr=1 px=- gpu=-';
  const dpr = Math.round((window.devicePixelRatio || 1) * 10) / 10;
  return `os=${osClass(navigator.userAgent, navigator.maxTouchPoints ?? 0)} gl=- tier=- dpr=${dpr} px=${window.innerWidth}x${window.innerHeight} gpu=-`;
}

/** Pure: the ttfp detail line, in perfStats.ttfpDetail's shape. */
export function hostTtfpDetail(readyMs: number, pageMs: number, device: string): string {
  return `ready=${Math.round(readyMs)} start=- first=- page=${Math.round(pageMs)} host=react ${device}`;
}

export interface HostDiag {
  /** The host's first usable screen is up. Sends ttfp once; later calls do nothing. */
  ready(): void;
  /** The host could not load. Sends `load` (rate-limited by diag.ts). */
  fail(why: unknown): void;
}

/** One mount's reporter. `modeId` is the shelf's mode id (music, acting, irl, story). */
export function hostDiag(modeId: string, clock: HostDiagClock = browserClock, device: () => string = hostDevice): HostDiag {
  const t0 = clock.now();
  let readySent = false;
  return {
    ready() {
      if (readySent) return;
      readySent = true;
      setDiagMode(modeId);
      reportDiag('ttfp', hostTtfpDetail(clock.now() - t0, clock.pageNow(), device()));
    },
    fail(why) {
      setDiagMode(modeId);
      const msg = why instanceof Error ? why.message : String(why);
      reportDiag('load', `${modeId} load failed: ${msg.slice(0, 160)}`);
    },
  };
}

/**
 * For next/dynamic: `dynamic(() => withHostDiag('music', import('…')), { ssr: false })`. The clock starts when the import
 * starts (the host's first render); a failed chunk is reported and rethrown (next/dynamic shows its error as before); the
 * loaded component reports ttfp from its first commit.
 */
export function withHostDiag<P extends object>(
  modeId: string, mod: Promise<{ default: ComponentType<P> }>, diag: HostDiag = hostDiag(modeId),
): Promise<{ default: ComponentType<P> }> {
  return mod.then(
    ({ default: Inner }) => {
      function HostDiagReady(props: P) {
        useEffect(() => { diag.ready(); }, []);
        return createElement(Inner, props);
      }
      HostDiagReady.displayName = `HostDiag(${modeId})`;
      return { default: HostDiagReady };
    },
    (e: unknown) => { diag.fail(e); throw e; },
  );
}
