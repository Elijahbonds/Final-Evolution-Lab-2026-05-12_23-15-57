// config — the Quick Screen's two build-time switches (SCREEN-SHIP, 2026-09-29).
//
// Both are NEXT_PUBLIC_ variables, so Next inlines them into the client at BUILD time: changing one needs a rebuild,
// not a code change. The pages pass process.env.X in; the functions here are pure, so the rules are tested directly.
//
// Pure.

/** The free game after the results (Squad gate 6): Brain Brawl's play route, found at app/play/brain-brawl/page.tsx. */
export const DEFAULT_SCREEN_NEXT_ROUTE = '/play/brain-brawl';

/**
 * NEXT_PUBLIC_SCREEN_NEXT_ROUTE: the outlined secondary button's target. A same-origin PATH only: it must start with
 * one "/" (not "//host", not "/\\host"), carry no scheme and no whitespace. Anything else, or unset/empty, is the default.
 */
export function screenNextRoute(env: string | undefined): string {
  const v = (env ?? '').trim();
  if (!v) return DEFAULT_SCREEN_NEXT_ROUTE;
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return DEFAULT_SCREEN_NEXT_ROUTE;
  if (/[\s\\]/.test(v) || /^[a-z][a-z0-9+.-]*:/i.test(v) || v.includes('://')) return DEFAULT_SCREEN_NEXT_ROUTE;
  return v;
}

/**
 * NEXT_PUBLIC_PROGRAM_SIGNUP_ENABLED: the future Dunk Program sign-up. OFF unless it is exactly "true".
 *
 * READ SITE NOTE (A3-5, A4-7). The real signup is OUT OF SCOPE for this ship and is only enabled after Cyber hardening
 * steps 1–2 land (Elijah approved 9:53 PM PT). SPEC ONLY, not built: under-18s go through the same parent consent gate,
 * and only the PARENT's email is collected. With the flag off no signup UI renders and no network call is made; with it
 * on, the program page shows an inert placeholder only (no form, no input, no request).
 */
export function programSignupEnabled(env: string | undefined): boolean {
  return env === 'true';
}
