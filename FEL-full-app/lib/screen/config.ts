// config — the Quick Screen's two build-time switches (SCREEN-SHIP, 2026-09-29), and where the free-game button goes
// (SCREEN-FIX S-1).
//
// Both switches are NEXT_PUBLIC_ variables, so Next inlines them into the client at BUILD time: changing one needs a
// rebuild, not a code change. The pages pass process.env.X in; the functions here are pure, so the rules are tested
// directly.
//
// Pure.
import { linksAllowed, type AgeBand } from './age';

/**
 * The free game after the results: /try, the guest dunk contest. app/try/page.tsx renders GuestDunkShell for a
 * signed-out visitor (SCREEN-FIX S-1). Brain Brawl was the target before, but app/play/brain-brawl/page.tsx sends a
 * signed-out visitor to /login, and there is no guest Brain Brawl.
 */
export const DEFAULT_FREE_GAME_ROUTE = '/try';

/**
 * Routes a signed-out visitor cannot play, so the free-game button never goes there. Each route stands for itself and
 * everything under it. They are:
 *   · every page or layout under app/ that sends a signed-out visitor to /login (found with `git grep "redirect('/login"`
 *     and the /login?next= forms, 2026-09-29; config.test.ts re-scans app/ and fails on a new one missing here). /play
 *     is walled as a whole by app/play/page.tsx, which covers Brain Brawl (app/play/brain-brawl/page.tsx);
 *   · sign-in and sign-up themselves, accounts, the API, and the dev pages (a 404 outside `next dev`).
 * A route is refused even where one page under it might be open: a free-game button is not the place to guess.
 * /consent/guardian is the signed-in minor's own "ask a parent or guardian" page (MIRROR-COACH P5); the guardian's
 * link under it (/consent/guardian/<token>) is covered too, and is never a free game.
 */
export const SIGNED_IN_ONLY_ROUTES: readonly string[] = [
  '/login', '/signup', '/account', '/api', '/dev',
  '/admin', '/arena', '/camp', '/cards', '/closet', '/coach', '/consent/guardian', '/creator', '/education', '/guidance', '/kitchens',
  '/ladder', '/live', '/market', '/multiplayer', '/play', '/profile', '/sessions', '/shop', '/signature', '/store',
  '/story', '/studio', '/train', '/training', '/venues', '/wallet', '/workout',
];

/** The path a same-origin route opens, as the server will read it: dot segments resolved, decoded, lower case. */
function pathOf(route: string): string | null {
  try {
    const u = new URL(route, 'https://screen.invalid');
    if (u.origin !== 'https://screen.invalid') return null;
    return decodeURIComponent(u.pathname).toLowerCase().replace(/\/+$/, '') || '/';
  } catch { return null; }
}

/** Whether a route (a same-origin path, with or without a query) sends a signed-out visitor away. */
export function isSignedInOnly(route: string): boolean {
  const p = pathOf(route);
  if (p === null) return true;
  return SIGNED_IN_ONLY_ROUTES.some((r) => p === r || p.startsWith(`${r}/`));
}

/**
 * NEXT_PUBLIC_SCREEN_NEXT_ROUTE: the outlined free-game button's target. A same-origin PATH only: it must start with
 * one "/" (not "//host", not "/\\host"), carry no scheme and no whitespace, and not be a signed-in-only route. Anything
 * else, or unset/empty, is /try.
 */
export function freeGameRoute(env: string | undefined): string {
  const v = (env ?? '').trim();
  if (!v) return DEFAULT_FREE_GAME_ROUTE;
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return DEFAULT_FREE_GAME_ROUTE;
  if (/[\s\\]/.test(v) || /^[a-z][a-z0-9+.-]*:/i.test(v) || v.includes('://')) return DEFAULT_FREE_GAME_ROUTE;
  if (isSignedInOnly(v)) return DEFAULT_FREE_GAME_ROUTE;
  return v;
}

/**
 * THE ONE PLACE the free-game target is chosen (S-1, Cyber 3): 13 and older get /try (or the checked env route); under
 * 13 and "rather not say" get no target at all, and the results show "Have a parent open this" instead.
 */
export function screenNextTarget(age: AgeBand | null | undefined, env: string | undefined): string | null {
  return linksAllowed(age) ? freeGameRoute(env) : null;
}

/**
 * NEXT_PUBLIC_PROGRAM_SIGNUP_ENABLED: the future Dunk Program sign-up. OFF unless it is exactly "true".
 *
 * READ SITE NOTE (A3-5, A4-7). The real signup is OUT OF SCOPE for this ship and is only enabled after Cyber hardening
 * steps 1–2 land (Elijah approved 9:53 PM PT). SPEC ONLY, not built: under-18s go through the same grown-up step, and
 * only the PARENT's email is collected; under 13 never sees it (lib/screen/age.ts linksAllowed). With the flag off no
 * signup UI renders and no network call is made; with it on, the program page shows an inert placeholder only (no
 * form, no input, no request).
 */
export function programSignupEnabled(env: string | undefined): boolean {
  return env === 'true';
}
