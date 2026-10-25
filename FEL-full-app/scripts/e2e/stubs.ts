// The rig's stand-ins for Next's runtime (QG-01, quality-gates lane, 2026-10-25).
//
// A page bundled by esbuild has no app router, no server and no image optimiser, so the few `next/*` client modules a
// page imports are replaced with the smallest thing that behaves the same in a browser:
//   next/navigation  useRouter().push/replace are REAL navigations (window.location), so a flow can assert where the
//                    page went; useSearchParams/usePathname read the real URL; redirect() navigates, notFound() throws.
//   next/link        a plain <a>: a click is a real navigation, which the rig routes like any other.
//   next/image       a plain <img>.
//   next/dynamic     React.lazy behind Suspense with the loader's own `loading` fallback (esbuild inlines the import()).
// Everything else — next-auth/react, sonner, framer-motion, the app's own modules — is the real code.
import type { Plugin } from 'esbuild';

const NAVIGATION = `
export const useRouter = () => ({
  push: (h) => window.location.assign(h), replace: (h) => window.location.replace(h),
  refresh: () => {}, back: () => window.history.back(), forward: () => window.history.forward(), prefetch: () => {},
});
export const useSearchParams = () => new URLSearchParams(window.location.search);
export const usePathname = () => window.location.pathname;
export const useParams = () => (window.__RIG && window.__RIG.params) || {};
export const useSelectedLayoutSegment = () => null;
export const useSelectedLayoutSegments = () => [];
export const redirect = (h) => { window.location.replace(h); throw new Error('NEXT_REDIRECT ' + h); };
export const permanentRedirect = redirect;
export const notFound = () => { throw new Error('NEXT_NOT_FOUND'); };
`;

const LINK = `
import { createElement, forwardRef } from 'react';
const Link = forwardRef(function Link({ href, children, prefetch, replace, scroll, shallow, passHref, legacyBehavior, locale, ...rest }, ref) {
  const to = typeof href === 'string' ? href : (href && (href.pathname || '') + (href.query ? '?' + new URLSearchParams(href.query).toString() : '')) || '#';
  return createElement('a', { href: to, ref, ...rest }, children);
});
export default Link;
`;

const IMAGE = `
import { createElement, forwardRef } from 'react';
const Image = forwardRef(function Image({ src, alt, fill, priority, quality, placeholder, blurDataURL, loader, unoptimized, sizes, style, ...rest }, ref) {
  const url = typeof src === 'string' ? src : (src && src.src) || '';
  return createElement('img', { src: url, alt: alt || '', ref, style: fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%', ...(style || {}) } : style, ...rest });
});
export default Image;
`;

const DYNAMIC = `
import { createElement, lazy, Suspense } from 'react';
export default function dynamic(loader, opts) {
  const o = opts || {};
  const L = lazy(() => Promise.resolve(typeof loader === 'function' ? loader() : loader).then((m) => ({ default: (m && m.default) || m })));
  return function Dynamic(props) {
    return createElement(Suspense, { fallback: o.loading ? createElement(o.loading, { isLoading: true }) : null }, createElement(L, props));
  };
}
`;

const SOURCES: Record<string, string> = {
  'next/navigation': NAVIGATION,
  'next/link': LINK,
  'next/image': IMAGE,
  'next/dynamic': DYNAMIC,
};

export function nextStubs(root: string): Plugin {
  return {
    name: 'fel-rig-next-stubs',
    setup(b) {
      b.onResolve({ filter: /^next\/(navigation|link|image|dynamic)$/ }, (a) => ({ path: a.path, namespace: 'fel-rig-stub' }));
      // `import 'server-only'` throws outside a server component; a client bundle that reaches it is a finding the
      // page itself would also hit, so it stays an error rather than a stub.
      b.onLoad({ filter: /.*/, namespace: 'fel-rig-stub' }, (a) => ({ loader: 'jsx', resolveDir: root, contents: SOURCES[a.path] }));
    },
  };
}
