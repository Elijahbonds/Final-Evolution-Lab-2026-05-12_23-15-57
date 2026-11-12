// MENU FOCUS — the d-pad, the stick, A and B, and a TV remote's arrows, across the menus (A11-02, lane/a11y-design,
// 2026-10-25).
//
// The gap (docs/LAUNCH-CHECKLIST.md E4 / G5): a controller worked inside every game and on the end card, and nowhere
// else. `getGamepads` was read in no shell file and not on /play, so a player on a couch with a pad had to put it down and
// touch the phone (or find a mouse) to reach a mode; a TV browser's remote sends arrow keys, which only scrolled.
//
// ONE MANAGER for every menu page. It reuses the end card's geometry and pad reading (components/games/end-screen/nav.ts:
// `spatialNext`, `padFrame`, `padIntents`), so "down" means the same thing on the shelf as it does on the end card:
//   - the d-pad, the left stick or a remote's arrows move focus to the nearest control in that direction;
//   - A activates the focused control (a click, as a tap would); B goes back (closes an open dialog first);
//   - a keyboard's Tab and Enter are left alone, and the arrows only move focus once focus is ON a control (from the body
//     they scroll the page as they always did), except on a remote-driven screen, where the first arrow picks a control.
// It PAUSES whenever something else owns input: a running mode (the routes chromeHiddenFor hides the shell on), the learn
// feed and the end card (each has its own pad and arrow handling), anything marked `data-own-input`, a text field or a
// widget whose arrows mean something (a slider, a tab list, a listbox), and while the page is hidden.
//
// The geometry and the decisions are pure (tested in focus.test.ts); `startMenuFocus` is the thin browser half.
import { padFrame, padIntents, spatialNext, type Dir, type Intent, type PadFrame, type Rect } from '@/components/games/end-screen/nav';
import { chromeHiddenFor } from '@/components/shell/tab-bar';

export type { Dir, Intent, Rect };

/** What can take focus in a menu: links, buttons, fields, and anything given a tab stop. */
export const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([type="hidden"]):not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', 'summary', '[role="button"]', '[role="link"]', '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Something on the page that handles the pad and the arrows itself: the manager stands aside while it is mounted. */
export const OWNS_INPUT = '[data-own-input], [data-learn-root], [data-end-screen]';

/** Widgets whose arrow keys already mean something (WAI-ARIA authoring practices): never steal them. */
const ARROW_WIDGETS = '[role="slider"], [role="tablist"], [role="listbox"], [role="menu"], [role="menubar"], [role="radiogroup"], [role="grid"], [role="tree"], [role="spinbutton"], [role="combobox"]';

/** Remote "back" keys (no Escape: a page's dialogs and sheets already own it). LG webOS 461 and Tizen 10009 by code. */
const BACK_KEYS = new Set(['GoBack', 'BrowserBack', 'XF86Back']);
const BACK_CODES = new Set([461, 10009]);

export interface KeyLike { key: string; keyCode?: number; isTrusted?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; defaultPrevented?: boolean }

/** PURE: what a key press means to the menus, or null (leave it to the page). Untrusted keys (GameShell's pad bridge
 *  synthesises them) are never handled twice. */
export function menuKeyIntent(e: KeyLike): Intent | null {
  if (e.isTrusted === false || e.defaultPrevented) return null;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  switch (e.key) {
    case 'ArrowUp': return 'up';
    case 'ArrowDown': return 'down';
    case 'ArrowLeft': return 'left';
    case 'ArrowRight': return 'right';
    default: return BACK_KEYS.has(e.key) || BACK_CODES.has(e.keyCode ?? -1) ? 'back' : null;
  }
}

/** PURE: is this element a field or a widget whose arrow keys belong to it? */
export function ownsArrows(el: { tagName?: string; isContentEditable?: boolean; type?: string; closest?: (s: string) => unknown } | null | undefined): boolean {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
  if (tag === 'INPUT') return !['button', 'submit', 'reset', 'checkbox', 'radio', 'image'].includes(String(el.type ?? 'text').toLowerCase());
  return !!el.closest?.(ARROW_WIDGETS);
}

export interface PauseState {
  pathname: string;
  /** An element matching OWNS_INPUT is mounted. */
  ownedInput: boolean;
  hidden: boolean;
  /** pauseMenuFocus() calls not yet released. */
  holds: number;
}

/** PURE: should the manager stand aside? */
export function menuFocusPaused(s: PauseState): boolean {
  return chromeHiddenFor(s.pathname) || s.ownedInput || s.hidden || s.holds > 0;
}

/**
 * PURE: where focus goes. `from` -1 (nothing focused yet): the first control in reading order inside the page's <main>
 * when there is one (the shelf, not the status rail), else the first control. Otherwise the end card's spatialNext.
 */
export function menuFocusTarget(rects: readonly Rect[], from: number, dir: Dir, firstInMain = 0): number {
  if (!rects.length) return -1;
  if (from < 0) return Math.max(0, Math.min(rects.length - 1, firstInMain));
  return spatialNext(rects, from, dir);
}

// ── the browser half ─────────────────────────────────────────────────────────────────────────────────────────────────

let holds = 0;
/** A sheet, a picker or anything else that takes the pad for a while: hold the menus off; call the returned release. */
export function pauseMenuFocus(): () => void {
  holds++;
  let done = false;
  return () => { if (!done) { done = true; holds = Math.max(0, holds - 1); } };
}

function visibleControl(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest('[inert], [aria-hidden="true"]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none';
}

/** The controls a pad can reach right now: inside an open modal dialog when there is one, else the whole page. */
export function menuControls(doc: Document = document): HTMLElement[] {
  const modal = doc.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]');
  const scope: ParentNode = modal ?? doc;
  return Array.from(scope.querySelectorAll(FOCUSABLE)).filter(visibleControl);
}

export interface MenuFocusOptions {
  /** Called on every pad press the menus act on (the couch view listens: a pad in hand means a big screen). */
  onPad?: () => void;
  /** Called on the first remote/arrow move from the body (the page had no focus yet). */
  onRemote?: () => void;
}

/** Start the manager. Returns the stop. Safe to call on the server (does nothing). */
export function startMenuFocus(opts: MenuFocusOptions = {}): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const paused = () => menuFocusPaused({
    pathname: window.location.pathname,
    ownedInput: !!document.querySelector(OWNS_INPUT),
    hidden: document.visibilityState === 'hidden',
    holds,
  });

  const move = (dir: Dir, fromBody: boolean): boolean => {
    const els = menuControls();
    if (!els.length) return false;
    const active = document.activeElement as HTMLElement | null;
    const from = active ? els.indexOf(active) : -1;
    if (from < 0 && !fromBody) return false;
    const main = document.querySelector('main');
    const firstInMain = main ? Math.max(0, els.findIndex((e) => main.contains(e))) : 0;
    const rects = els.map((e) => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; });
    const to = menuFocusTarget(rects, from, dir, firstInMain);
    if (to < 0 || to === from) return from >= 0;   // nothing that way: stay put, but the key was ours
    const el = els[to];
    el.focus({ preventScroll: true });
    // the scroll padding (app/globals.css) keeps it clear of the rail and the tab bar
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return true;
  };

  const back = () => {
    const dialog = document.querySelector('[role="dialog"], [role="alertdialog"]');
    if (dialog) {
      (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return;
    }
    if (window.history.length > 1) window.history.back();
  };

  let remoteSeen = false;
  const onKey = (e: KeyboardEvent) => {
    const intent = menuKeyIntent(e);
    if (!intent || paused()) return;
    const active = document.activeElement;
    if (ownsArrows(active as HTMLElement | null)) return;
    if (intent === 'back') { e.preventDefault(); back(); return; }
    if (intent === 'select') return;
    const onBody = !active || active === document.body || active === document.documentElement;
    // From the body an arrow scrolls the page, as it always has — unless this screen is being driven by a remote or a pad
    // (no hover-capable pointer: a TV), where the first arrow has to land somewhere.
    const remote = remoteSeen || padSeen || (typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: none)').matches);
    if (onBody && !remote) return;
    if (move(intent, onBody)) {
      e.preventDefault();
      if (onBody && !remoteSeen) { remoteSeen = true; opts.onRemote?.(); }
    }
  };
  window.addEventListener('keydown', onKey);

  // the pad: polled only while one is connected
  let raf = 0;
  let prev: PadFrame | null = null;
  let padSeen = false;
  const poll = () => {
    raf = 0;
    let pad: Gamepad | null = null;
    try { for (const p of navigator.getGamepads?.() ?? []) if (p && p.connected !== false) { pad = p; break; } } catch { /* permissions policy */ }
    if (!pad) { prev = null; return; }
    const frame = padFrame(pad);
    // the left stick is a menu stick only on a page with no 3D view (the closet's preview turns the athlete with it)
    if (document.querySelector('canvas')) {
      const b = (i: number) => Boolean(pad!.buttons?.[i]?.pressed);
      frame.up = b(12); frame.down = b(13); frame.left = b(14); frame.right = b(15);
    }
    const intents = padIntents(prev, frame);
    prev = frame;
    if (intents.length && !paused()) {
      padSeen = true;
      opts.onPad?.();
      for (const it of intents) {
        if (it === 'select') {
          const a = document.activeElement as HTMLElement | null;
          if (a && a !== document.body && menuControls().includes(a)) a.click();
          else move('down', true);
        } else if (it === 'back') back();
        else move(it, true);
      }
    }
    raf = requestAnimationFrame(poll);
  };
  const startPoll = () => { if (!raf) raf = requestAnimationFrame(poll); };
  const onConnect = () => startPoll();
  window.addEventListener('gamepadconnected', onConnect);
  try { if (Array.from(navigator.getGamepads?.() ?? []).some((p) => p && p.connected !== false)) startPoll(); } catch { /* none */ }

  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('gamepadconnected', onConnect);
    if (raf) cancelAnimationFrame(raf);
  };
}
