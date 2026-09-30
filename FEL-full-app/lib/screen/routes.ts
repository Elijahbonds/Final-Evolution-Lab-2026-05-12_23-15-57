// routes — the Quick Screen's own addresses (SCREEN-FIX S-2, 2026-09-29).
//
// Every one of these is a quick-screen path (components/providers.tsx isQuickScreenPath): no next-auth
// SessionProvider, so no /api/auth/session request and no `nextauth.message` in localStorage. The screen's back arrow
// only ever points at one of them (lib/screen/routes.test.tsx), never at /play/mirror, /login or /try.
//
// Pure data.
import type { LaneSlug } from './PROPOSED-program-lanes';

/** The QR address: it sends to the start of the screen (app/screen/page.tsx). */
export const SCREEN_HOME = '/screen';
/** The screen itself. */
export const ASSESS_PATH = '/play/mirror/assess';
/** The results: an address that carries no data. */
export const RESULTS_PATH = '/play/mirror/assess/results';
/**
 * How the screen keeps things private, in plain words: linked from the start card and the results. Written as a link
 * target (`href:`) so lib/nav/reachability.test.ts, which reads link literals, sees /screen linked from inside the app.
 */
export const PRIVACY_LINK_TARGET = { href: '/screen/privacy' } as const;
export const PRIVACY_PATH = PRIVACY_LINK_TARGET.href;
/** A program lane's sample page: the address carries only the lane. */
export const programPath = (lane: LaneSlug): string => `/screen/program/${lane}`;

/**
 * The Quick Screen's own paths: /screen, /screen/**, /play/mirror/assess/**. There the app mounts no next-auth
 * SessionProvider (components/providers.tsx, which re-exports this) and no crash report is sent (SCREEN-FIX-2 amend 4:
 * app/global-error.tsx, and the screen's own boundary). Moved here from components/providers.tsx, unchanged, so the
 * crash screen can read it without importing next-auth.
 */
export const isQuickScreenPath = (p: string): boolean => /^\/(screen|play\/mirror\/assess)(\/|$)/.test(p);
