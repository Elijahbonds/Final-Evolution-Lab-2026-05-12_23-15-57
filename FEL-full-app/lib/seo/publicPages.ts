// The pages a search engine may list (owner, 2026-10-16: "fill the sitemap with the public pages, regardless of the store
// flag"). app/sitemap.ts prints this list; app/robots.ts points at the sitemap. lib/seo/publicPages.test.ts holds the list
// to the app directory: it walks every page and fails if a listed route redirects a signed-out visitor to /login, is
// noindex, is a dev or held route, or sits under a path robots.ts disallows.
//
// A page belongs here only if it renders for a stranger with no session and is meant to be found. Not here, on purpose:
//   * every page that sends a signed-out visitor to /login (the games, /play, /train, /profile, /account, ...);
//   * /login and /signup (the way in, not content), /age and /consent/* (account steps);
//   * /dev/*, /api/*, /studio (HOLD: not shipped), /admin/*;
//   * pages opened by a code, token or booking (/c, /card, /p, /party, /join, /controller, /session, /program, /coach/join);
//   * /host (a TV controller stage), /play/mirror/assess (the camera tool; its stable address is /screen);
//   * /press/library and /press/receipt (a buyer's own library and a Stripe landing), /live/schedule (flag-gated, 404s);
//   * /coach/** (the coach store: app/sitemap.ts lists it only while the store flag is on).
import { BOOKS } from '@/lib/books/bookCatalog';
import { approvedProfiles } from '@/lib/creator/creatorCatalog';

/** The production origin. app/robots.ts and app/sitemap.ts both read it. */
export const SITE_ORIGIN = 'https://go.finalevolutiongroup.com';

/** Static pages open to a signed-out visitor, in the order they are listed. */
export const PUBLIC_STATIC_PATHS = [
  '/',
  '/try',
  '/modes',
  '/learn',
  '/screen',
  '/screen/privacy',
  '/links',
  '/press',
  '/team',
  '/media-kit',
  '/work-with-us',
  '/support',
  '/credits',
  '/privacy',
  '/terms',
  '/store-terms',
] as const;

/** Every public path: the static pages, each book's page and each approved team profile's page. */
export function publicPaths(): string[] {
  return [
    ...PUBLIC_STATIC_PATHS,
    ...BOOKS.map((b) => `/press/${b.slug}`),
    ...approvedProfiles().map((p) => `/team/${p.slug}`),
  ];
}
