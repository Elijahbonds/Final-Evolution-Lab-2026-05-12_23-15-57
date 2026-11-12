// COUCH VIEW — the menus legible from a sofa (A11-05, lane/a11y-design, 2026-10-25).
//
// The gap (docs/LAUNCH-CHECKLIST.md G7): only the in-game HUD was 10-foot scaled (lib/ui/consoleView.ts zooms it with the
// screen's height). The menus kept phone and laptop pixels: on a 1080p TV the shelf's mode descriptions drew at 11.5 px —
// about 1 % of the screen's height — and the venue line at 10.5 px.
//
// THE RULE is console view's, applied to the page column instead of the HUD: the column is zoomed with the screen's
// HEIGHT, linearly from consoleView's HUD_DESIGN_HEIGHT (480: 1× at or below it), capped at its HUD_ZOOM_MAX (2.25 at
// 1080 px), so a page reads on the TV at the size the HUD does. The column's width shrinks by the same factor (inside a
// 5 % title-safe margin), so a zoomed page never scrolls sideways: at 1080p the shelf lays out like a 853 × 480 landscape
// phone — the size it was designed at — and fills the TV.
//
// WHEN: a choice, like reduced motion (`fel-couch`: auto / on / off, Account → Accessibility). AUTO turns it on when the
// menus are being driven by a pad or a TV remote (lib/nav/focus.ts reports it) on a big sideways screen — the couch — and
// never on a phone or a laptop driven by touch, a mouse or Tab. ON forces it on any big sideways screen; OFF never.
// Presentation only: nothing about a game changes.
import { HUD_DESIGN_HEIGHT, HUD_ZOOM_MAX, TV_SAFE, CONSOLE_MIN_ASPECT } from '@/lib/ui/consoleView';

export type CouchPref = 'auto' | 'on' | 'off';
export const COUCH_PREFS: readonly CouchPref[] = ['auto', 'on', 'off'];
export const COUCH_KEY = 'fel-couch';

/** A screen shorter than this is a phone or a small window, never a couch (consoleView's phone ceiling, plus room). */
export const COUCH_MIN_HEIGHT = 600;
/** The page column's width before the zoom (components/shell/tab-page.tsx max-w-[1080px]). */
export const PAGE_COLUMN_PX = 1080;

export const isCouchPref = (v: unknown): v is CouchPref => typeof v === 'string' && (COUCH_PREFS as readonly string[]).includes(v);

/** PURE: is this a big sideways screen (the only kind the couch view applies to)? */
export function bigSideways(width: number, height: number): boolean {
  return Number.isFinite(width) && Number.isFinite(height) && height >= COUCH_MIN_HEIGHT && width / height >= CONSOLE_MIN_ASPECT;
}

/** PURE: on or off, from the choice, whether a pad or remote is driving the menus, and the screen. */
export function couchOn(pref: CouchPref, remoteDriven: boolean, width: number, height: number): boolean {
  if (pref === 'off' || !bigSideways(width, height)) return false;
  return pref === 'on' || remoteDriven;
}

export interface CouchLayout { zoom: number; columnPx: number }

/** PURE: the column's zoom and its width in design px (so zoomed, it fits inside the title-safe frame). */
export function couchLayout(width: number, height: number): CouchLayout {
  const zoom = Math.round(Math.min(HUD_ZOOM_MAX, Math.max(1, height / HUD_DESIGN_HEIGHT)) * 100) / 100;
  const usable = width * (1 - 2 * TV_SAFE.x);
  return { zoom, columnPx: Math.floor(Math.min(PAGE_COLUMN_PX, usable / zoom)) };
}

/** The stage's custom properties (app/globals.css reads them under html[data-fel-couch]). */
export function couchVars(l: CouchLayout): Record<string, string> {
  return { '--fel-couch-zoom': String(l.zoom), '--fel-couch-col': `${l.columnPx}px` };
}

// ── the runtime ─────────────────────────────────────────────────────────────────────────────────────────────────────

let sessionOnly: CouchPref | null = null;
let remoteDriven = false;
const listeners = new Set<() => void>();
const emit = () => { for (const fn of [...listeners]) { try { fn(); } catch { /* one bad listener never blocks the rest */ } } };

export function readCouchPref(): CouchPref {
  if (sessionOnly) return sessionOnly;
  try { const v = window.localStorage?.getItem(COUCH_KEY); if (isCouchPref(v)) return v; } catch { /* storage blocked */ }
  return 'auto';
}

export function writeCouchPref(p: CouchPref): void {
  try { window.localStorage.setItem(COUCH_KEY, p); sessionOnly = null; } catch { sessionOnly = p; }
  apply();
  emit();
}

/** The menus were just driven by a pad or a remote (lib/nav/focus.ts). Sticks for the page's life. */
export function noteRemoteDriven(): void {
  if (remoteDriven) return;
  remoteDriven = true;
  apply();
  emit();
}

export function onCouchChange(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** Put the decision on <html>: data-fel-couch and the zoom variables, or neither. */
export function apply(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): boolean {
  if (!doc || typeof window === 'undefined') return false;
  const root = doc.documentElement;
  const on = couchOn(readCouchPref(), remoteDriven, window.innerWidth, window.innerHeight);
  if (on) {
    root.setAttribute('data-fel-couch', '');
    for (const [k, v] of Object.entries(couchVars(couchLayout(window.innerWidth, window.innerHeight)))) root.style.setProperty(k, v);
  } else {
    root.removeAttribute('data-fel-couch');
    root.style.removeProperty('--fel-couch-zoom');
    root.style.removeProperty('--fel-couch-col');
  }
  return on;
}

/** For the rig and tests: forget the pad. */
export function resetCouchForTest(): void { remoteDriven = false; sessionOnly = null; }
