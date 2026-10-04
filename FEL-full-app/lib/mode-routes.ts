import { MODE_INFO, canonicalModeKey } from './game-data';

function routePath(href: string | null | undefined): string | null {
  const path = String(href ?? '').split(/[?#]/)[0]?.trim();
  if (!path) return null;
  return path.startsWith('/') ? path : `/${path}`;
}

const MODE_BY_ROUTE = new Map<string, string>(
  Object.entries(MODE_INFO).flatMap(([key, info]) => {
    const path = routePath(info.href);
    return path ? [[path, canonicalModeKey(key)] as const] : [];
  }),
);

/** Return the session/catalogue mode key for an app href, or null when the href is not a mode. */
export function modeKeyForHref(href: string | null | undefined): string | null {
  const path = routePath(href);
  return path ? MODE_BY_ROUTE.get(path) ?? null : null;
}
