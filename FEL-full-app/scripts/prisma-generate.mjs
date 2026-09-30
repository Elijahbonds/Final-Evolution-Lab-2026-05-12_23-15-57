// GATE-HYGIENE (measured 2026-09-30): npm's arborist Shrinkwrap.save rewrites yarn.lock per-OS during reify
// (yarnLock.fromTree, before this postinstall). prisma generate does not touch yarn.lock. Gates already accept
// yarn.lock as the only allowed dirty file. This script does not restore or overwrite it.
//
// scripts/prisma-generate.mjs — `prisma generate`, then make the COMMITTED client path-independent (PRISMA-PATH,
// 2026-09-30).
//
// WHY. public/_prisma/client is committed on purpose (see .gitattributes and scripts/prisma-artifact-tests.ts). But
// Prisma 6 writes the generator's config into the client it generates, and two fields of that config are ABSOLUTE
// paths of the machine and checkout that ran it: `generator.output.value` (the client directory) and
// `generator.sourceFilePath` (the schema file), in index.js and edge.js. So every generate in a different worktree
// (…/mode-lanes/wt-mirror, …/lanes/gate, a Linux container…) rewrote those two files and dirtied the tree. Prisma has
// no option to write them relative, so this script rewrites them after the generate: the app root
// ("/…/FEL-full-app/") is stripped, leaving "public/_prisma/client" and "public/_prisma/schema.prisma". The result is
// byte-identical in every checkout on the same platform (the engine binaries still follow binaryTargets).
//
// WHY THE RUNTIME DOES NOT CARE. Neither field is how the client finds its files. index.js sets
// `config.dirname = __dirname` (or <cwd>/public/_prisma/client when bundled) and the library engine is looked up in
// [config.dirname, __dirname/.., generator.output.value, …, cwd] — the first hit wins, and config.dirname is the
// directory the engine ships in. `sourceFilePath` is not read by the runtime at all. The committed value until now was
// a Mac path that has never existed on Cloud Run, so the deployed function already worked without it; a relative
// value is at worst one more harmless candidate (resolved against the function's cwd). edge.js sets
// `config.dirname = '/'` and does not read files.
//
// USE. `npm run prisma:generate` (also what `postinstall` and `build` run). Extra args are passed to prisma generate.
// After a bare `npx prisma generate`, `node scripts/prisma-generate.mjs --normalize-only` puts the files back to the
// committed form without touching git.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = join(APP, 'public', '_prisma', 'client');
const TEXT = /\.(js|mjs|cjs|ts|json|prisma)$/;

/** Strip the app root from every text file of the generated client. Returns the files it changed. */
export function normalizeClientPaths(clientDir = CLIENT, appRoot = APP) {
  const roots = [...new Set([appRoot, existsSync(appRoot) ? realpathSync(appRoot) : appRoot])].map((r) => `${r}/`);
  const changed = [];
  const files = [];
  for (const d of [clientDir, join(clientDir, 'runtime')]) {
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d, { withFileTypes: true })) if (f.isFile() && TEXT.test(f.name)) files.push(join(d, f.name));
  }
  for (const file of files) {
    const before = readFileSync(file, 'utf8');
    let after = before;
    for (const r of roots) after = after.split(r).join('');
    if (after !== before) { writeFileSync(file, after); changed.push(file.slice(appRoot.length + 1)); }
  }
  // Refuse to leave an absolute path in the generator config behind (a root this script did not know about).
  for (const name of ['index.js', 'edge.js']) {
    const file = join(clientDir, name);
    if (!existsSync(file)) continue;
    const bad = /"(sourceFilePath|value)": "(\/|[A-Za-z]:\\\\)[^"]*_prisma[^"]*"/.exec(readFileSync(file, 'utf8'));
    if (bad) throw new Error(`[prisma-generate] ${name} still has an absolute path: ${bad[0]}`);
  }
  return changed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (!args.includes('--normalize-only')) {
    const prismaCli = createRequire(join(APP, 'package.json')).resolve('prisma/build/index.js');
    const r = spawnSync(process.execPath, [prismaCli, 'generate', ...args], { cwd: APP, stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  const changed = normalizeClientPaths();
  console.log(`[prisma-generate] client paths made relative${changed.length ? `: ${changed.join(', ')}` : ' (already relative)'}`);
}
