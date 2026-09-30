// scripts/prisma-generate.mjs — `prisma generate`, then make the COMMITTED client path-independent (PRISMA-PATH,
// 2026-09-30) and platform-independent (GATE-HYGIENE).
//
// WHY. public/_prisma/client is committed on purpose (see .gitattributes and scripts/prisma-artifact-tests.ts). But
// Prisma 6 writes the generator's config into the client it generates, and two fields of that config are ABSOLUTE
// paths of the machine and checkout that ran it: `generator.output.value` (the client directory) and
// `generator.sourceFilePath` (the schema file), in index.js and edge.js. So every generate in a different worktree
// (…/mode-lanes/wt-mirror, …/lanes/gate, a Linux container…) rewrote those two files and dirtied the tree. Prisma has
// no option to write them relative, so this script rewrites them after the generate: the app root
// ("/…/FEL-full-app/") is stripped, leaving "public/_prisma/client" and "public/_prisma/schema.prisma".
//
// The schema's binaryTargets include "native", which Prisma resolves to the machine that ran generate and marks
// `"native": true` (a Mac writes darwin-arm64; Linux writes debian-openssl-3.0.x and drops the darwin engine
// annotation). That is the other half of a dirty tree. The committed client is the darwin-arm64 + debian pair, and
// the runtime picks the engine for the OS it is actually on from that list (debian stays in the list, so Cloud Run
// still loads libquery_engine-debian-openssl-3.0.x.so.node). This script puts the generator config and the bundler
// engine annotations back to that committed pair after every generate.
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
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = join(APP, 'public', '_prisma', 'client');
const TEXT = /\.(js|mjs|cjs|ts|json|prisma)$/;

// The committed client's generator config. "native" in the schema resolves per machine; the blob in git was generated
// where native is darwin-arm64, with the Linux engine kept beside it. Cloud Run loads by the target name, not by
// which entry is marked native.
const CANONICAL_BINARY_TARGETS = `"binaryTargets": [
      {
        "fromEnvVar": null,
        "value": "darwin-arm64",
        "native": true
      },
      {
        "fromEnvVar": null,
        "value": "debian-openssl-3.0.x"
      }
    ]`;
const BINARY_TARGETS_RE = /"binaryTargets": \[\s*\{\s*"fromEnvVar": null,\s*"value": "[^"]+",\s*"native": true\s*\},\s*\{\s*"fromEnvVar": null,\s*"value": "[^"]+"\s*\}\s*\]/;
// index.js ends with bundler hints (path.join of each engine, not a require). A Linux generate emits only the
// debian engine; the committed file names both. One or two libquery blocks, never the schema.prisma hint after them.
const CANONICAL_ENGINES = `// file annotations for bundling tools to include these files
path.join(__dirname, "libquery_engine-darwin-arm64.dylib.node");
path.join(process.cwd(), "public/_prisma/client/libquery_engine-darwin-arm64.dylib.node")

// file annotations for bundling tools to include these files
path.join(__dirname, "libquery_engine-debian-openssl-3.0.x.so.node");
path.join(process.cwd(), "public/_prisma/client/libquery_engine-debian-openssl-3.0.x.so.node")`;
const ENGINE_BLOCKS_RE = /\/\/ file annotations for bundling tools to include these files\npath\.join\(__dirname, "libquery_engine-[^"]+"\);\npath\.join\(process\.cwd\(\), "[^"]*libquery_engine-[^"]+"\)(?:\n\n\/\/ file annotations for bundling tools to include these files\npath\.join\(__dirname, "libquery_engine-[^"]+"\);\npath\.join\(process\.cwd\(\), "[^"]*libquery_engine-[^"]+"\))?/;

/** Put generator binaryTargets and the engine annotations back to the committed pair. Pure. */
export function stabilizeClientText(fileName, text) {
  if (fileName !== 'index.js' && fileName !== 'edge.js') return text;
  let out = BINARY_TARGETS_RE.test(text) ? text.replace(BINARY_TARGETS_RE, CANONICAL_BINARY_TARGETS) : text;
  if (fileName === 'index.js' && ENGINE_BLOCKS_RE.test(out)) out = out.replace(ENGINE_BLOCKS_RE, CANONICAL_ENGINES);
  return out;
}

/**
 * npm ci rewrites yarn.lock. Not prisma, and not this script's generate: @npmcli/arborist Shrinkwrap.save writes
 * `yarn.lock` whenever the file exists (`this.yarnLock.fromTree` rebuilds it for the current OS, so a Linux ci
 * swaps the lockfile's darwin-arm64 optional packages for linux-x64). That save runs inside `npm ci` BEFORE the
 * root postinstall, and there is no npm flag to skip it. Put the committed file back. Only during postinstall, so
 * `npm run prisma:generate` does not discard an uncommitted lockfile edit npm itself has not already overwritten.
 * Returns true when git restored the file. A tree with no git (the Cloud Run install) leaves npm's copy in place;
 * that install does not ship yarn.lock.
 * @param {string} [appRoot]
 * @param {{ npm_lifecycle_event?: string }} [env]
 */
export function restoreCommittedYarnLock(appRoot = APP, env = process.env) {
  if (env.npm_lifecycle_event !== 'postinstall') return false;
  const r = spawnSync('git', ['checkout', '--', 'yarn.lock'], { cwd: appRoot, stdio: 'ignore' });
  return r.status === 0;
}

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
    after = stabilizeClientText(basename(file), after);
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
  if (restoreCommittedYarnLock()) console.log('[prisma-generate] yarn.lock restored (npm ci rewrites it for this OS before postinstall)');
}
