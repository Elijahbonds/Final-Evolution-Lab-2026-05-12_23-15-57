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
//
// THE SECOND CLIENT (PRISMA-PUBLIC step 1, 2026-10-24, owner-approved; docs/PRISMA-PUBLIC-PLAN.md). After the public
// client, this script generates a parallel client into lib/generated/prisma from the SAME prisma/schema.prisma. Nothing
// imports it yet; step 2 moves lib/db.ts and the imports onto it, and step 4 deletes public/_prisma.
//   · It is generated from a DERIVED schema, not from a second generator block in prisma/schema.prisma. A second block
//     would change the inline schema embedded in public/_prisma/client/index.js and both schema copies under
//     public/_prisma, i.e. touch the deploy artifact this step must leave byte-for-byte alone, and it would trip the
//     prisma/ ban in lib/privacy/u13-lock-log.test.ts. libSchemaFrom() swaps ONLY the generator block; every model,
//     enum and the datasource are the source's own bytes. scripts/prisma-lib-client-tests.ts holds that.
//   · binaryTargets is ["debian-openssl-3.0.x"] only, with no "native": the Cloud Run engine and nothing else. No
//     darwin-arm64 dylib is committed, and the generated files carry no machine-specific entry, so a Mac and a Linux
//     container regenerate it byte-identically (the public client's `native` entry is why it goes dirty on a Mac).
//   · The derived schema is written to lib/generated/schema.prisma for the generate and removed after it.
//   · `--no-lib` skips it (for bisecting a generate problem; nothing in the repo passes it).
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = join(APP, 'public', '_prisma', 'client');
/** PRISMA-PUBLIC step 1: the parallel client, its derived schema (transient) and its one engine. */
export const LIB_CLIENT = join(APP, 'lib', 'generated', 'prisma');
const LIB_SCHEMA = join(APP, 'lib', 'generated', 'schema.prisma');
const SOURCE_SCHEMA = join(APP, 'prisma', 'schema.prisma');
export const LIB_BINARY_TARGETS = ['debian-openssl-3.0.x'];
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
    const bad = /"(sourceFilePath|value)": "(\/|[A-Za-z]:\\\\)[^"]*(_prisma|generated)[^"]*"/.exec(readFileSync(file, 'utf8'));
    if (bad) throw new Error(`[prisma-generate] ${name} still has an absolute path: ${bad[0]}`);
  }
  return changed;
}

/** The generator block of a schema: `generator client { ... }` up to the first line that is a lone `}`. */
export const GENERATOR_BLOCK = /^generator client \{[\s\S]*?^\}/m;

/**
 * The lib client's schema: the source schema with ONLY its generator block replaced. Output is relative to the derived
 * schema's own location (lib/generated/schema.prisma), so "./prisma" is lib/generated/prisma.
 */
export function libSchemaFrom(source) {
  if (!GENERATOR_BLOCK.test(source)) throw new Error('[prisma-generate] no `generator client { ... }` block in the source schema');
  return source.replace(GENERATOR_BLOCK, [
    'generator client {',
    '    provider      = "prisma-client-js"',
    '    // DERIVED by scripts/prisma-generate.mjs from prisma/schema.prisma; this block is the only difference.',
    '    // The parallel client of PRISMA-PUBLIC step 1 (docs/PRISMA-PUBLIC-PLAN.md): the Cloud Run engine only.',
    '    output        = "./prisma"',
    `    binaryTargets = [${LIB_BINARY_TARGETS.map((t) => `"${t}"`).join(', ')}]`,
    '}',
  ].join('\n'));
}

/** Generate lib/generated/prisma from prisma/schema.prisma (see the header). Returns false when there is no source. */
export function generateLibClient(prismaCli) {
  if (!existsSync(SOURCE_SCHEMA)) {
    console.log('[prisma-generate] prisma/schema.prisma not here; lib/generated/prisma left as committed');
    return false;
  }
  mkdirSync(dirname(LIB_SCHEMA), { recursive: true });
  writeFileSync(LIB_SCHEMA, libSchemaFrom(readFileSync(SOURCE_SCHEMA, 'utf8')));
  try {
    const r = spawnSync(process.execPath, [prismaCli, 'generate', `--schema=${LIB_SCHEMA}`], { cwd: APP, stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  } finally {
    rmSync(LIB_SCHEMA, { force: true });
  }
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const noLib = args.includes('--no-lib');
  if (!args.includes('--normalize-only')) {
    const prismaCli = createRequire(join(APP, 'package.json')).resolve('prisma/build/index.js');
    const r = spawnSync(process.execPath, [prismaCli, 'generate', ...args.filter((a) => a !== '--no-lib')], { cwd: APP, stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
    if (!noLib) generateLibClient(prismaCli);
  }
  const changed = [...normalizeClientPaths(), ...(noLib ? [] : normalizeClientPaths(LIB_CLIENT))];
  console.log(`[prisma-generate] client paths made relative${changed.length ? `: ${changed.join(', ')}` : ' (already relative)'}`);
}
