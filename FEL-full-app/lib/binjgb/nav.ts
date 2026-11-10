// lib/binjgb/nav.ts — BINJGB-SHELF-1 F2 (Cyber build review dcbbec16): the shelf's header policies (enforced CSP,
// camera=() / microphone=(), no-referrer) belong to the DOCUMENT from its first load. An App Router soft navigation would
// carry them out into the rest of the app (no camera on /screen until a reload) or carry the app's rule-0 policy into the
// shelf (no enforced CSP). So crossing the shelf boundary, in either direction, is always a full page load:
//   - every link into or out of the shelf is a plain <a href> (never next/link; tests/binjgb/binjgb-f2-nav.test.ts);
//   - on the shelf, a capture-phase click guard (components/binjgb/shelf-nav-guard.tsx) turns any same-origin anchor that
//     leaves /play/gb-shelf* — the app chrome's next/link tabs included — into location.assign(href).

export const SHELF_PATH = '/play/gb-shelf';

/** Is this pathname on the shelf (the page, a title, or the local frame)? */
export function inShelf(pathname: string): boolean {
  return pathname === SHELF_PATH || pathname.startsWith(`${SHELF_PATH}/`);
}

export interface ClickLike {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

export interface AnchorLike {
  /** The anchor's resolved or raw href attribute. */
  href: string;
  /** The anchor's target attribute ('' when absent). */
  target: string;
  /** Has a download attribute. */
  download: boolean;
}

/**
 * The URL to load in full for this click, or null to leave the click alone. Only a plain primary click on a same-window,
 * same-origin link that crosses the shelf boundary (in or out) is taken; new-tab clicks, downloads, other origins and
 * moves within one side are the browser's / router's as usual.
 */
export function fullLoadTarget(click: ClickLike, anchor: AnchorLike, here: { href: string; origin: string; pathname: string }): string | null {
  if (click.defaultPrevented || click.button !== 0) return null;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return null;
  if (anchor.download) return null;
  if (anchor.target !== '' && anchor.target !== '_self') return null;
  let dest: URL;
  try {
    dest = new URL(anchor.href, here.href);
  } catch {
    return null;
  }
  if (dest.origin !== here.origin) return null;
  if (inShelf(dest.pathname) === inShelf(here.pathname)) return null;
  return dest.href;
}

/** After a history move (back / forward) inside this document: reload when the URL has left the shelf. */
export function reloadAfterHistoryMove(pathname: string): boolean {
  return !inShelf(pathname);
}

/** F2 defence in depth: the pathname this DOCUMENT was first loaded at (Navigation Timing), or null when unknown. */
export function firstLoadPath(
  perf: { getEntriesByType(type: string): PerformanceEntryList } | undefined = typeof performance === 'undefined' ? undefined : performance,
): string | null {
  const e = perf?.getEntriesByType('navigation')[0];
  if (!e || typeof e.name !== 'string' || !e.name) return null;
  try { return new URL(e.name).pathname; } catch { return null; }
}

/**
 * A shelf view in a document first loaded OUTSIDE the shelf got there by soft navigation: reload it once. The first-load
 * path is compared percent-decoded and slash-collapsed (Cyber C1C4 review), so a spelling Next may serve as the shelf
 * (/play/%67b-shelf, //play/gb-shelf) counts as the shelf and can never reload-loop.
 */
export function reloadOnShelfMount(firstPath: string | null): boolean {
  if (firstPath === null) return false;
  let p = firstPath;
  try { p = decodeURIComponent(firstPath); } catch { /* malformed escape: keep the raw spelling */ }
  p = p.replace(/\/{2,}/g, '/');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return !inShelf(p);
}
