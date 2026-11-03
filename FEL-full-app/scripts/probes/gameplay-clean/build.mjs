// gameplay-clean rig build (lane/gameplay-clean, 2026-10-28): node build.mjs <siteDir> [--dev]
//
// Bundles ./entry.tsx — the REAL /play/<route> loader (GameShell + the mode's host + its HUD, READY card, pause, touch
// deck and the feel panel's tab), with Next's server pieces stubbed — into <siteDir> as an ESM bundle with split chunks
// (one shared Babylon chunk; each loader's dynamic import its own chunk), plus the app's CSS (Tailwind compiled with its
// own CLI from app/globals.css, then app/theme.css and app/game-surface.css, as app/layout.tsx imports them) and the
// app's font files. The site's public/ folders are symlinked in, so the modes load their models as they do on the site.
//
// No server, no `next dev` / `next build`, no new dependency (esbuild and tailwindcss are already in node_modules).
// The stubs are the accessibility rig's (scripts/a11y/rig.mts), copied, plus the game routes' answers (see entry.tsx).
// Production React/Babylon by default (minified, what a phone runs); --dev = NODE_ENV development.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../../..');
const SITE = process.argv[2];
if (!SITE) { console.error('usage: node build.mjs <siteDir> [--dev]'); process.exit(2); }
const dev = process.argv.includes('--dev');
const require = createRequire(path.join(APP, 'package.json'));
const esbuild = require('esbuild');
const ENV = dev ? '"development"' : '"production"';
fs.mkdirSync(SITE, { recursive: true });

const STUBS = {
  'next/link': `import { createElement, forwardRef } from 'react';
    const Link = forwardRef(function Link({ href, children, prefetch, replace, scroll, shallow, passHref, legacyBehavior, ...rest }, ref) {
      return createElement('a', { href: typeof href === 'string' ? href : (href && href.pathname) || '/', ref, ...rest, onClick: (e) => { e.preventDefault(); window.__NAV = (window.__NAV || []).concat(String(typeof href === 'string' ? href : href && href.pathname)); rest.onClick && rest.onClick(e); } }, children); });
    export default Link;`,
  'next/image': `import { createElement } from 'react';
    export default function Image({ src, alt, fill, priority, quality, placeholder, blurDataURL, loader, unoptimized, sizes, ...rest }) {
      return createElement('img', { src: typeof src === 'string' ? src : (src && src.src) || '', alt, ...rest }); }`,
  'next/navigation': `export const usePathname = () => window.__PATH || '/play';
    const nav = (h) => { window.__NAV = (window.__NAV || []).concat(String(h)); };
    export const useRouter = () => ({ push: nav, replace: nav, refresh() {}, back() { nav('back'); }, prefetch() {} });
    export const useSearchParams = () => new URLSearchParams(window.location.search);
    export const useParams = () => ({});
    export const redirect = (to) => { throw new Error('redirect ' + to); };
    export const notFound = () => { throw new Error('404'); };`,
  'next/dynamic': `import { createElement, lazy, Suspense } from 'react';
    export default function dynamic(loader, opts) { const L = lazy(async () => { const m = await loader(); return { default: m.default || m }; });
      const fb = opts && opts.loading ? createElement(opts.loading) : null;
      return (props) => createElement(Suspense, { fallback: fb }, createElement(L, props)); }`,
  'next/headers': `export const cookies = () => ({ get: () => undefined, getAll: () => [], has: () => false });
    export const headers = () => new Headers();`,
  'next-auth': `export const getServerSession = async () => window.__SESSION; export default function NextAuth() {}`,
  'next-auth/react': `import { createContext, createElement } from 'react';
    const value = () => ({ data: window.__SESSION, status: 'authenticated', update: async () => window.__SESSION });
    export const SessionContext = createContext(undefined);
    export const useSession = () => value();
    export const SessionProvider = ({ children }) => createElement(SessionContext.Provider, { value: value() }, children);
    export const signIn = async () => ({ ok: true }); export const signOut = async () => {};
    export const getSession = async () => window.__SESSION; export const getCsrfToken = async () => 'x'; export const getProviders = async () => ({});`,
  '@/lib/auth': `export const authOptions = {};`,
  '@/lib/db': `const model = () => new Proxy({}, { get: () => async () => null });
    export const prisma = new Proxy({}, { get: () => model() }); export const db = prisma; export default prisma;`,
  'server-only': ``,
};
const stubs = {
  name: 'gameplay-clean-stubs',
  setup(b) {
    const re = new RegExp(`^(${Object.keys(STUBS).map((k) => k.replace(/[/@-]/g, '\\$&')).join('|')})$`);
    b.onResolve({ filter: re }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ loader: 'tsx', resolveDir: APP, contents: STUBS[a.path] }));
    b.onResolve({ filter: /^(node:.*|crypto|fs|fs\/promises|path|os|stream|zlib|http|https|net|tls|dns|child_process|util|async_hooks|perf_hooks|worker_threads|url|buffer|events)$/ }, (a) => ({ path: a.path, namespace: 'nodestub' }));
    b.onLoad({ filter: /.*/, namespace: 'nodestub' }, () => ({ loader: 'js', contents: 'const f = function () { return p; }; const p = new Proxy(f, { get: (t, k) => k === "__esModule" ? false : k === Symbol.toPrimitive ? () => "" : p, apply: () => p, construct: () => p }); module.exports = p;' }));
  },
};

const t0 = Date.now();
// NOT --keep-names (docs/DUNK-FLAGSHIP.md §1: it breaks Babylon's Draco worker and freezes every clip)
await esbuild.build({
  absWorkingDir: APP, entryPoints: { entry: path.join(HERE, 'entry.tsx') }, bundle: true, splitting: true, format: 'esm',
  minify: !dev, platform: 'browser', target: 'es2020', jsx: 'automatic', tsconfig: path.join(APP, 'tsconfig.json'),
  define: { 'process.env.NODE_ENV': ENV }, plugins: [stubs], logLevel: 'error', outdir: SITE, chunkNames: 'c/[hash]',
  banner: { js: `var process = globalThis.process || { env: { NODE_ENV: ${ENV} } }; globalThis.process = process;` },
  loader: { '.glb': 'dataurl', '.wasm': 'dataurl', '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty' },
});
const cssTmp = path.join(SITE, 'tw.css');
execFileSync(path.join(APP, 'node_modules/.bin/tailwindcss'), ['-c', path.join(APP, 'tailwind.config.ts'), '-i', path.join(APP, 'app/globals.css'), '-o', cssTmp, '--minify'], { cwd: APP, stdio: 'ignore' });
fs.mkdirSync(path.join(SITE, 'fonts'), { recursive: true });
const face = (fam, file, weight) => {
  const dst = path.join(SITE, 'fonts', file);
  if (!fs.existsSync(dst)) fs.copyFileSync(path.join(APP, 'app/fonts', file), dst);
  return `@font-face{font-family:'${fam}';src:url('/fonts/${file}') format('woff2');font-weight:${weight};font-display:swap}`;
};
const FONTS = [
  ...['500', '600', '700', '800'].map((wt) => face('FEL Barlow', `barlow-condensed-latin-${wt}.woff2`, wt)),
  face('FEL Plex', 'ibm-plex-sans-latin-variable.woff2', '400 700'),
  face('FEL Mono', 'jetbrains-mono-latin-variable.woff2', '100 800'),
  ...['400', '500', '600', '700'].map((wt) => face('FEL Chakra', `chakra-petch-latin-${wt}.woff2`, wt)),
  `:root{--font-display:'FEL Barlow';--font-sans:'FEL Plex';--font-mono:'FEL Mono';--font-chakra:'FEL Chakra'}`,
].join('\n');
fs.writeFileSync(path.join(SITE, 'app.css'), [FONTS, fs.readFileSync(cssTmp, 'utf8'), fs.readFileSync(path.join(APP, 'app/theme.css'), 'utf8'), fs.readFileSync(path.join(APP, 'app/game-surface.css'), 'utf8')].join('\n'));
fs.rmSync(cssTmp);
fs.writeFileSync(path.join(SITE, 'index.html'), `<!doctype html><html lang="en" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body class="font-sans min-h-screen bg-[#050505]"><div id="root"></div><script type="module" src="/entry.js"></script></body></html>`);
// the site's public folders, as the deployed site serves them
for (const d of fs.readdirSync(path.join(APP, 'public'))) {
  const dst = path.join(SITE, d);
  if (['index.html', 'fonts', 'c', 'entry.js', 'app.css'].includes(d) || fs.existsSync(dst)) continue;
  fs.symlinkSync(path.join(APP, 'public', d), dst);
}
const size = fs.readdirSync(path.join(SITE, 'c')).reduce((s, f) => s + fs.statSync(path.join(SITE, 'c', f)).size, fs.statSync(path.join(SITE, 'entry.js')).size);
console.log(`built ${dev ? 'dev' : 'prod'} → ${SITE} (${(size / 1e6).toFixed(1)} MB js) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
