#!/usr/bin/env -S npx tsx
/**
 * scripts/prisma-artifact-tests.ts — THE GENERATED PRISMA CLIENT STAYS COMMITTED.
 *
 * WHY THIS EXISTS. On 2026-09-26 I read a dirty `public/_prisma/client/index.js` in a Linux container, saw absolute
 * macOS paths and `darwin-arm64` baked into a checked-in generated file, and recommended gitignoring it — reasoning
 * that `"build": "... && prisma generate && next build"` regenerates it at deploy time anyway. That reasoning is
 * wrong, and acting on it would have reproduced an outage this repo already paid for:
 *
 *   · firebase.json uses the web-frameworks integration with `source: "."`, and the packager copies exactly
 *     .env*, next.config.js, package.json, package-lock.json, server.js, public/ and .next/ into the function.
 *   · That snapshot of public/ is taken FROM THE SOURCE TREE, BEFORE the build runs. So `prisma generate` inside
 *     the build writes a client the snapshot has already passed by — build time is too late.
 *   · public/_prisma/client carries libquery_engine-debian-openssl-3.0.x.so.node, the engine Cloud Run loads.
 *     Untracked, it is simply absent from the function: "ENGINE NOT FOUND", which is the failure that cost roughly
 *     ten deploys (prisma/schema.prisma's generator block records the whole hunt).
 *
 * The 44 MB was the owner's deliberate call, taken for a deterministic deploy. The file going dirty on a non-Mac is
 * EXPECTED, not a defect: the schema pins binaryTargets ["native", "debian-openssl-3.0.x"], so `native` resolves to
 * whatever machine generated it. .gitattributes marks the tree generated so that churn stays out of reviews.
 *
 * lib/db/prismaSchemaSync.test.ts already guards that the artifact's CONTENT is current. This guards that it EXISTS
 * in git at all — the one property a reasonable-sounding cleanup can quietly delete.
 *
 * Run: npx tsx scripts/prisma-artifact-tests.ts
 */
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const appDir = path.join(__dirname, '..');
const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: appDir, encoding: 'utf8' }).trim();

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

/** Files git is actually tracking under the generated client. */
const tracked = new Set(git('ls-files', 'public/_prisma').split('\n').filter(Boolean));

console.log('\nthe generated Prisma client is a committed deploy artifact');

ok('the client is tracked by git, not ignored', () => {
  assert.ok(tracked.size > 10,
    `expected the generated client to be committed, git tracks ${tracked.size} file(s) under public/_prisma — ` +
    'if this dropped to zero, something gitignored the deploy artifact (see this file\'s header)');
  assert.ok(tracked.has('public/_prisma/schema.prisma'), 'the shipped schema copy must be committed');
  assert.ok(tracked.has('public/_prisma/client/schema.prisma'), "the generated client's own schema must be committed");
  assert.ok(tracked.has('public/_prisma/client/index.js'), 'the client entrypoint must be committed');
});

ok('THE LINUX ENGINE is committed — the one Cloud Run loads', () => {
  const engine = 'public/_prisma/client/libquery_engine-debian-openssl-3.0.x.so.node';
  assert.ok(tracked.has(engine),
    `${engine} is not tracked. The deploy packager snapshots public/ from the source tree BEFORE the build, so an ` +
    'untracked engine never reaches the function: Prisma throws ENGINE NOT FOUND at runtime while every local ' +
    'check stays green. This is the exact outage prisma/schema.prisma\'s generator block documents.');
});

ok('no .gitignore rule matches the artifact', () => {
  // --no-index IS THE WHOLE POINT. Plain `git check-ignore` reports a TRACKED file as not-ignored no matter what the
  // rules say, because tracking wins over .gitignore — so the obvious spelling of this check passes even with
  // `public/_prisma/client/` sitting in .gitignore, which I verified by adding that exact rule and watching it go
  // green. --no-index asks the rules directly, which is the question: has anyone written the rule that takes effect
  // the moment these files stop being tracked (a fresh clone, a `git rm --cached`, a re-add)?
  for (const rel of ['public/_prisma/schema.prisma', 'public/_prisma/client/index.js',
                     'public/_prisma/client/libquery_engine-debian-openssl-3.0.x.so.node']) {
    let ignored = false;
    try { execFileSync('git', ['check-ignore', '--no-index', '-q', rel], { cwd: appDir }); ignored = true; } catch { ignored = false; }
    assert.ok(!ignored,
      `${rel} is matched by a gitignore rule. It is still tracked today, so nothing is broken YET — but the rule ` +
      'takes effect on any fresh clone or re-add, and then the deploy loses its query engine. See this file\'s header.');
  }
});

ok('the artifact is marked generated, so 43MB of churn stays out of reviews', () => {
  const attrs = git('check-attr', 'linguist-generated', '--', 'public/_prisma/client/index.js');
  assert.ok(/linguist-generated: (true|set)/.test(attrs),
    `expected .gitattributes to mark the generated client, got "${attrs}"`);
});

console.log(`\n✅ prisma-artifact-tests: ${pass} checks green — ${tracked.size} files tracked, engine included`);
