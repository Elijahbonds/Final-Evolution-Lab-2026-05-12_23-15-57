// studio-22 (2026-11-11): build the game page a Studio Play-test opens (./game-entry.tsx) into <siteDir>, for the studio-easy rig.
//   node scripts/probes/studio-22/game-build.mjs <siteDir> [--dev]
// Production React/Babylon by default (what the deployed site runs, and what the Studio's production Play-test hands off to);
// --dev = NODE_ENV development (the Studio's development Play-test, `/dev/mode/<key>?venue=`). Every file is served under
// /__game/ by the probe (index.html asks for /__game/game-entry.js and /__game/app.css; the split chunks import relatively),
// and the site's public/ folders come from the probe's own fallback, so nothing is linked here.
//
// The esbuild settings and Next stubs are the gameplay-clean rig's (scripts/probes/gameplay-clean/build.mjs, read-only to this
// lane), copied: that script builds its own entry only. No new dependency (esbuild and tailwindcss are in node_modules).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../../..');
const SITE = process.argv[2];
if (!SITE) { console.error('usage: node game-build.mjs <siteDir> [--dev]'); process.exit(2); }
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
  name: 'studio-22-game-stubs',
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
  absWorkingDir: APP, entryPoints: { 'game-entry': path.join(HERE, 'game-entry.tsx') }, bundle: true, splitting: true, format: 'esm',
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
  return `@font-face{font-family:'${fam}';src:url('/__game/fonts/${file}') format('woff2');font-weight:${weight};font-display:swap}`;
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
fs.writeFileSync(path.join(SITE, 'index.html'), `<!doctype html><html lang="en" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/__game/app.css"></head><body class="font-sans min-h-screen bg-[#050505]"><div id="root"></div><script type="module" src="/__game/game-entry.js"></script></body></html>`);
const size = fs.readdirSync(path.join(SITE, 'c')).reduce((s, f) => s + fs.statSync(path.join(SITE, 'c', f)).size, fs.statSync(path.join(SITE, 'game-entry.js')).size);
console.log(`built ${dev ? 'dev' : 'prod'} game → ${SITE} (${(size / 1e6).toFixed(1)} MB js) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
