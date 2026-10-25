// The accessibility rig's page (A11-01 / A11-02 / A11-05): the ten key pages (scripts/a11y/entry.tsx) and the audit's page
// side (scripts/a11y/inpage.ts), bundled with esbuild; the app's Tailwind CSS compiled with its own CLI, plus app/theme.css
// and the app's own font files under next/font's variables. No server, no new dependency.
import { build, type Plugin } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

// Next's server and router pieces, stubbed: no app router is mounted in a bare page, and no database answers.
const STUBS: Record<string, string> = {
  'next/link': `import { createElement, forwardRef } from 'react';
    const Link = forwardRef(function Link({ href, children, prefetch, replace, scroll, shallow, passHref, legacyBehavior, ...rest }, ref) {
      return createElement('a', { href: typeof href === 'string' ? href : (href && href.pathname) || '/', ref, ...rest }, children); });
    export default Link;`,
  'next/image': `import { createElement } from 'react';
    export default function Image({ src, alt, fill, priority, quality, placeholder, blurDataURL, loader, unoptimized, sizes, ...rest }) {
      return createElement('img', { src: typeof src === 'string' ? src : (src && src.src) || '', alt, ...rest, style: fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%', ...(rest.style || {}) } : rest.style }); }`,
  'next/navigation': `export const usePathname = () => window.__PATH;
    export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} });
    export const useSearchParams = () => new URLSearchParams('');
    export const useParams = () => ({});
    export const redirect = (to) => { throw new Error('redirect ' + to); };
    export const notFound = () => { throw new Error('404'); };`,
  'next/dynamic': `import { createElement, lazy, Suspense } from 'react';
    export default function dynamic(loader) { const L = lazy(async () => { const m = await loader(); return { default: m.default || m }; });
      return (props) => createElement(Suspense, { fallback: null }, createElement(L, props)); }`,
  'next/headers': `export const cookies = () => ({ get: () => undefined, getAll: () => [], has: () => false });
    export const headers = () => new Headers();`,
  'next-auth': `export const getServerSession = async () => window.__SESSION; export default function NextAuth() {}`,
  'next-auth/react': `import { createContext, createElement } from 'react';
    const value = () => ({ data: window.__SESSION, status: window.__SESSION ? 'authenticated' : 'unauthenticated', update: async () => window.__SESSION });
    export const SessionContext = createContext(undefined);
    export const useSession = () => value();
    export const SessionProvider = ({ children }) => createElement(SessionContext.Provider, { value: value() }, children);
    export const signIn = async () => ({ ok: true }); export const signOut = async () => {};
    export const getSession = async () => window.__SESSION; export const getCsrfToken = async () => 'x'; export const getProviders = async () => ({});`,
  '@/lib/auth': `export const authOptions = {};`,
  '@/lib/db': `const answer = (m) => m === 'count' ? 0 : /^findMany|groupBy$/.test(m) ? [] : m === 'aggregate' ? { _sum: {}, _count: 0, _max: {}, _min: {}, _avg: {} } : null;
    const model = () => new Proxy({}, { get: (_, m) => async () => answer(String(m)) });
    export const prisma = new Proxy({}, { get: (_, k) => k === '$transaction' ? async (x) => Array.isArray(x) ? Promise.all(x) : x(prisma) : k === '$queryRaw' || k === '$queryRawUnsafe' ? async () => [] : model() });
    export const db = prisma; export default prisma;`,
  'server-only': ``,
};
const stubs: Plugin = {
  name: 'a11y-stubs',
  setup(b) {
    const re = new RegExp(`^(${Object.keys(STUBS).map((k) => k.replace(/[/@-]/g, '\\$&')).join('|')})$`);
    b.onResolve({ filter: re }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ loader: 'tsx', resolveDir: ROOT, contents: STUBS[a.path] }));
    // node built-ins, reached through server modules a page imports but never calls in the browser: an inert CommonJS
    // proxy (CommonJS so any named import resolves at runtime instead of failing the build)
    b.onResolve({ filter: /^(node:.*|crypto|fs|fs\/promises|path|os|stream|zlib|http|https|net|tls|dns|child_process|util|async_hooks|perf_hooks|worker_threads|url|buffer|events)$/ }, (a) => ({ path: a.path, namespace: 'nodestub' }));
    b.onLoad({ filter: /.*/, namespace: 'nodestub' }, () => ({ loader: 'js', contents: 'const f = function () { return p; }; const p = new Proxy(f, { get: (t, k) => k === "__esModule" ? false : k === Symbol.toPrimitive ? () => "" : p, apply: () => p, construct: () => p }); module.exports = p;' }));
  },
};

export async function buildRig(BUILD: string): Promise<{ html: string }> {
mkdirSync(BUILD, { recursive: true });
const common = {
  bundle: true, format: 'iife' as const, platform: 'browser' as const, jsx: 'automatic' as const, logLevel: 'error' as const,
  define: { 'process.env.NODE_ENV': '"development"' }, tsconfig: join(ROOT, 'tsconfig.json'), plugins: [stubs],
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.wasm': 'empty', '.glb': 'empty' } as Record<string, 'empty'>,
  external: ['@mediapipe/tasks-vision', '@babylonjs/*'],
};
await build({ ...common, entryPoints: [join(ROOT, 'scripts/a11y/entry.tsx')], outfile: join(BUILD, 'pages.js'), splitting: false });
await build({ ...common, entryPoints: [join(ROOT, 'scripts/a11y/inpage.ts')], outfile: join(BUILD, 'inpage.js') });
  const cssFile = join(BUILD, 'app.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', cssFile], { cwd: ROOT, stdio: 'ignore' });
// app/layout.tsx's next/font faces, as plain @font-face rules over the same files, under the same variables
const face = (fam: string, file: string, weight: string) => `@font-face{font-family:'${fam}';src:url('file://${join(ROOT, 'app/fonts', file)}') format('woff2');font-weight:${weight};font-display:block}`;
const FONTS = [
  ...['500', '600', '700', '800'].map((wt) => face('FEL Barlow', `barlow-condensed-latin-${wt}.woff2`, wt)),
  face('FEL Plex', 'ibm-plex-sans-latin-variable.woff2', '400 700'),
  face('FEL Mono', 'jetbrains-mono-latin-variable.woff2', '100 800'),
  ...['400', '500', '600', '700'].map((wt) => face('FEL Chakra', `chakra-petch-latin-${wt}.woff2`, wt)),
  `:root{--font-display:'FEL Barlow';--font-sans:'FEL Plex';--font-mono:'FEL Mono';--font-chakra:'FEL Chakra'}`,
].join('\n');
const css = FONTS + '\n' + readFileSync(cssFile, 'utf8') + '\n' + readFileSync(join(ROOT, 'app/theme.css'), 'utf8');
const html = join(BUILD, 'index.html');
writeFileSync(html, `<!doctype html><html lang="en" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body class="font-sans min-h-screen bg-[#050505]"><div id="root"></div><script src="pages.js"></script><script src="inpage.js"></script></body></html>`);
return { html };
}
