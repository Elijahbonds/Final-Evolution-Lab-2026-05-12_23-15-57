// "Install FEL" (app-feel, round 7, 2026-10-25): when the offer to add FEL to the home screen may show.
//
// Two ways in. Chrome (Android, desktop) fires `beforeinstallprompt` once it judges the site installable and the
// visitor engaged; we keep that event and our button calls its prompt(). iPhone Safari has no such event and no API at
// all, so the offer there is a hint: Share, then Add to Home Screen.
//
// The rules, all of which must hold:
//   - ONLY on the hub pages (INSTALL_PROMPT_PATHS, exact match). Never in a game, on a TV, in the camera screen, in a
//     controller or in the dev views: an allowlist, so a new game route is excluded without anyone remembering to.
//   - never on a TV browser (the same user-agent test the controller link uses, lib/controller-link/tvMode.ts);
//   - never once FEL is already running installed (display-mode standalone, or iOS navigator.standalone);
//   - once: after it has been seen, dismissed or used, it never comes back on this device (INSTALL_PROMPT_KEY);
//   - on iPhone, only after the visitor has moved around the app once in this visit, so it does not greet a first-time
//     visitor over the landing page. (Chrome's own event already waits for engagement.)
//
// Pure.
import { TV_UA } from '@/lib/controller-link/tvMode';

export const INSTALL_PROMPT_KEY = 'fel-install-prompt';
export const INSTALL_PROMPT_PATHS: readonly string[] = ['/', '/play', '/train', '/profile', '/modes', '/learn'];

export type InstallRoute = 'prompt' | 'ios-share';

export interface InstallContext {
  pathname: string;
  userAgent: string;
  /** navigator.maxTouchPoints: iPadOS reports a Mac user agent, and touch is what tells them apart. */
  maxTouchPoints: number;
  /** Already running as an installed app. */
  standalone: boolean;
  /** Anything stored under INSTALL_PROMPT_KEY: seen, dismissed or installed. */
  seen: boolean;
  /** Chrome's beforeinstallprompt has fired and been kept. */
  hasPromptEvent: boolean;
  /** The visitor has navigated within the app at least once this visit. */
  engaged: boolean;
}

/** Safari on an iPhone, iPod or iPad (not Chrome, Firefox, Edge or Opera on iOS, whose Share menus differ). */
export function isIosSafari(userAgent: string, maxTouchPoints: number): boolean {
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  return ios && /Safari\//.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(userAgent);
}

export function isInstallPage(pathname: string): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return INSTALL_PROMPT_PATHS.includes(p);
}

/** Which offer to show here and now, or null for none. */
export function installRoute(c: InstallContext): InstallRoute | null {
  if (c.seen || c.standalone) return null;
  if (!isInstallPage(c.pathname)) return null;
  if (TV_UA.test(c.userAgent)) return null;
  if (c.hasPromptEvent) return 'prompt';
  if (c.engaged && isIosSafari(c.userAgent, c.maxTouchPoints)) return 'ios-share';
  return null;
}
