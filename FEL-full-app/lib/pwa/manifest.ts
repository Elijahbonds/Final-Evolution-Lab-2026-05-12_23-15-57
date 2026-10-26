// THE WEB APP MANIFEST (app-feel, round 7, 2026-10-25). What makes FEL installable: a home-screen icon, its own
// window with no browser bar, and the splash colour while it opens. The owner approved "graceful offline via PWA"
// (2026-10-20); the scorecard (polish, 2026-10-25) found FEL could not be installed at all.
//
// WHERE IT IS SERVED, AND WHY NOT app/manifest.ts. Next's metadata route (app/manifest.ts) adds its
// <link rel="manifest"> to the metadata it re-renders on every client navigation — the same tree FDB-2 (2026-10-17)
// took the favicon links out of, because they were fetched again on each hop. So the manifest is a plain route
// handler (app/app.webmanifest/route.ts) and its one link sits in the root layout's own <head>, next to the favicon,
// rendered once per document. Not /manifest.webmanifest: Next classes any app path starting with /manifest as its own
// metadata route (next/dist/lib/metadata/is-metadata-route.js).
//
// COLOURS are the theme tokens (app/theme.css): --fel-bg #050505 for the splash and the status bar, and the icon is
// the favicon's cyan "FEL" (--fel-cyan) on the same black.
//
// assumption: the icons are made from public/favicon.svg until the owner supplies logo art
// (scripts/brand/make-app-icons.ts; re-run it on the new art).
//
// Pure.
import type { MetadataRoute } from 'next';

export const MANIFEST_HREF = '/app.webmanifest';
export const APPLE_TOUCH_ICON_HREF = '/icons/apple-touch-icon.png';
/** --fel-bg. The browser chrome, the splash screen and the iPhone status bar. */
export const THEME_COLOR = '#050505';
export const APP_NAME = 'Final Evolution Lab';
export const APP_SHORT_NAME = 'FEL';

/** Every icon file the manifest and the head name, with its pixel size, so a test can open each one. */
export const APP_ICONS = [
  { src: '/icons/icon-192.png', size: 192, purpose: 'any' },
  { src: '/icons/icon-512.png', size: 512, purpose: 'any' },
  { src: '/icons/icon-maskable-512.png', size: 512, purpose: 'maskable' },
  { src: APPLE_TOUCH_ICON_HREF, size: 180, purpose: 'apple' },
] as const;

export const FEL_MANIFEST: MetadataRoute.Manifest = {
  id: '/',
  name: APP_NAME,
  short_name: APP_SHORT_NAME,
  description: '60 seconds to a dunk. Games, training and coaching on your phone, laptop and TV.',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: THEME_COLOR,
  theme_color: THEME_COLOR,
  categories: ['games', 'sports', 'health', 'fitness'],
  // No `orientation`: the games pick their own (portrait menus, landscape courts), and a manifest lock would fight them.
  icons: APP_ICONS.filter((i) => i.purpose !== 'apple').map((i) => ({
    src: i.src,
    sizes: `${i.size}x${i.size}`,
    type: 'image/png',
    purpose: i.purpose as 'any' | 'maskable',
  })),
};
