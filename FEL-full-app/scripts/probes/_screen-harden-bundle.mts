// SCREEN-HARDEN bundle probe (2026-09-30): after `next build` with NEXT_DIST_DIR=.next-screen-harden, grep screen
// route client chunks for wallet/login markers. Expect 0 on screen routes; positive control on /play.
//
//   NEXT_DIST_DIR=.next-screen-harden node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json scripts/probes/_screen-harden-bundle.mts
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.env.NEXT_DIST_DIR ?? '.next-screen-harden';
const OUT = process.env.SCREEN_HARDEN_SHOTS ?? '/opt/cursor/artifacts/SCREEN-HARDEN-shots';
const ROOT = process.cwd();

const MARKERS = [
  'dual-wallet-chip',
  'wallet-chip',
  '/api/v1/wallet',
  'wallet/earn',
  'next-auth/react',
  'SessionProvider',
  'useSession',
  'signIn',
  'signOut',
  '/api/auth/session',
  'status-rail',
  'tab-bar',
];

const SCREEN_ROUTES = [
  '/screen',
  '/screen/privacy',
  '/screen/program/dunking',
  '/play/mirror/assess',
  '/play/mirror/assess/results',
];

function loadManifest(): Record<string, string[]> {
  const p = join(ROOT, DIST, 'build-manifest.json');
  if (!existsSync(p)) throw new Error(`missing ${p} — run next build with NEXT_DIST_DIR=${DIST}`);
  return JSON.parse(readFileSync(p, 'utf8')) as Record<string, string[]>;
}

function grepChunks(chunks: string[]): Record<string, number> {
  const hits: Record<string, number> = {};
  for (const rel of chunks) {
    const file = join(ROOT, DIST, rel.startsWith('/') ? rel.slice(1) : rel);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const m of MARKERS) if (text.includes(m)) hits[m] = (hits[m] ?? 0) + 1;
  }
  return hits;
}

const manifest = loadManifest();
const report: Record<string, unknown> = { dist: DIST, routes: {}, control: {} };

for (const route of SCREEN_ROUTES) {
  const key = route === '/' ? '/index' : route;
  const chunks = manifest[key] ?? manifest[route] ?? [];
  report.routes[route] = { chunkCount: chunks.length, hits: grepChunks(chunks) };
}

const controlChunks = manifest['/play'] ?? manifest['/play/page'] ?? [];
report.control = { route: '/play', hits: grepChunks(controlChunks) };

import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'bundle.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
