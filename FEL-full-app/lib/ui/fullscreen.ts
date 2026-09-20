// fullscreen — the browser's own full-screen, with the parts that differ between browsers in one place.
//
// It matters most on the thing this was built for: a phone held sideways. Mobile Safari and Chrome keep an
// address bar and a home indicator over the game, and `100dvh` only tells you how much is left AFTER they have
// taken it. Fullscreen is the only way to actually get those pixels.
//
// iOS Safari on iPhone does NOT implement the Fullscreen API on ordinary elements — `requestFullscreen` is
// simply absent. That is not a bug to work around with a hack; it is a capability to detect, so the control can
// be hidden rather than offered and then doing nothing. `canFullscreen()` is that check.

type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  webkitEnterFullscreen?: () => void;
};
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

export function canFullscreen(el?: HTMLElement | null): boolean {
  if (typeof document === 'undefined') return false;
  const d = document as FsDocument & { fullscreenEnabled?: boolean };
  if (d.fullscreenEnabled === false) return false;
  const target = (el ?? document.documentElement) as FsElement;
  return typeof target.requestFullscreen === 'function' || typeof target.webkitRequestFullscreen === 'function';
}

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const d = document as FsDocument;
  return Boolean(document.fullscreenElement ?? d.webkitFullscreenElement);
}

/** Resolves whether or not it worked; a refused request is an ordinary outcome, not an error to surface. */
export async function enterFullscreen(el: HTMLElement | null): Promise<boolean> {
  const target = (el ?? document.documentElement) as FsElement;
  try {
    if (typeof target.requestFullscreen === 'function') { await target.requestFullscreen(); return true; }
    if (typeof target.webkitRequestFullscreen === 'function') { await target.webkitRequestFullscreen(); return true; }
  } catch { /* the browser said no — usually because it was not a user gesture */ }
  return false;
}

export async function exitFullscreen(): Promise<boolean> {
  const d = document as FsDocument;
  try {
    if (typeof document.exitFullscreen === 'function') { await document.exitFullscreen(); return true; }
    if (typeof d.webkitExitFullscreen === 'function') { await d.webkitExitFullscreen(); return true; }
  } catch { /* nothing to exit */ }
  return false;
}

export async function toggleFullscreen(el: HTMLElement | null): Promise<boolean> {
  return isFullscreen() ? !(await exitFullscreen()) : enterFullscreen(el);
}

/**
 * A phone held sideways: wide, and short enough that the browser's chrome is a meaningful share of the screen.
 * Keyed on HEIGHT rather than on a width breakpoint, because a landscape phone is 844x390 — wide by any width
 * test, and the thing that actually breaks is the 390.
 */
export const LANDSCAPE_MAX_HEIGHT = 520;

export function isLandscapePhone(w: number, h: number): boolean {
  return w > h && h <= LANDSCAPE_MAX_HEIGHT;
}
