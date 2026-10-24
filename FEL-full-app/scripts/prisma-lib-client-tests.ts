#!/usr/bin/env -S npx tsx
/**
 * scripts/prisma-lib-client-tests.ts — THE PARALLEL CLIENT (lib/generated/prisma) IS THE SAME CLIENT, MINUS public/.
 *
 * PRISMA-PUBLIC step 1 (owner decision 2026-10-24; docs/PRISMA-PUBLIC-PLAN.md). The deployed client lives in
 * public/_prisma/client, which Firebase Hosting also serves to anyone who asks, schema included. The move out of public/
 * goes in four steps; step 1 only adds a second, parallel client under lib/generated/prisma that nothing imports yet.
 * Step 2 points lib/db.ts and the imports at it. Until step 4 deletes public/_prisma, BOTH clients are committed, and a
 * schema change that regenerates one and not the other would ship a client that has never heard of the new table: the
 * exact outage lib/db/prismaSchemaSync.test.ts was written for. This suite holds the two together.
 *
 * What it checks, and why each one:
 *   · the lib client is generated from prisma/schema.prisma by scripts/prisma-generate.mjs's libSchemaFrom(), which
 *     swaps ONLY the generator block. Everything else (datasource, models, enums) must be the source's own text.
 *   · the two clients carry the same runtime data model and the same Prisma/engine versions.
 *   · the lib client ships exactly one engine, the Cloud Run one (debian-openssl-3.0.x), and has no `native` target,
 *     so nothing in it depends on the machine that generated it (no 19 MB darwin dylib, no dirty tree on a Mac).
 *   · public/_prisma/client did not pick up a second generator: step 1 leaves the deploy artifact alone
 *     (scripts/prisma-artifact-tests.ts guards that it stays tracked).
 *   · in CI (process.env.CI), after `npm ci` and `npm run prisma:generate` have regenerated it, lib/generated/prisma is
 *     byte-identical to what is committed: a commit that changed the schema without the regenerated client fails here.
 *     The lib client is machine-independent, so the WHOLE directory is compared, not only schema.prisma.
 *     (Locally the regenerated files are compared before you commit them, so that check is CI-only.)
 *
 * Deliberately not here: the import switch (step 2) and the deletion of public/_prisma (step 4).
 *
 * Run: npx tsx scripts/prisma-lib-client-tests.ts
 */
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const appDir = path.join(__dirname, '..');
const LIB = 'lib/generated/prisma';
const PUB = 'public/_prisma/client';
const ENGINE = 'libquery_engine-debian-openssl-3.0.x.so.node';
const read = (rel: string) => readFileSync(path.join(appDir, rel), 'utf8');
const git = (...args: string[]) => execFileSync('git', args, { cwd: appDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

let pass = 0;
const ok = async (n: string, fn: () => void | Promise<void>) => { await fn(); pass++; console.log(`  ✓ ${n}`); };

/** The `generator client { ... }` block, the same rule scripts/prisma-generate.mjs replaces. */
const GENERATOR = /^generator client \{[\s\S]*?^\}/m;
const withoutGenerator = (s: string) => s.replace(GENERATOR, '');
/** `prisma generate` formats the copy it writes into the client (whitespace only), so compare without whitespace. */
const squash = (s: string) => s.replace(/\s+/g, '');

/** The generator config Prisma writes into a client's index.js (`const config = { "generator": {...}, ... }`). */
function generatorConfig(js: string) {
  const m = /const config = (\{[\s\S]*?\n\})\n/.exec(js);
  assert.ok(m, 'could not find the client config in index.js');
  // inlineSchema and friends are long strings; the head of the object up to inlineDatasources is plain JSON.
  const head = m[1].slice(0, m[1].indexOf('"inlineDatasources"')).replace(/,\s*$/, '') + '}';
  return JSON.parse(head) as {
    generator: { output: { value: string }; binaryTargets: { value: string; native?: boolean }[]; sourceFilePath: string };
    clientVersion: string;
    engineVersion: string;
  };
}
function runtimeDataModel(js: string): unknown {
  const raw = /config\.runtimeDataModel = JSON\.parse\(("(?:[^"\\]|\\.)*")\)/.exec(js);
  assert.ok(raw, 'runtimeDataModel not found in index.js');
  return JSON.parse(JSON.parse(raw[1]));
}
function inlineSchema(js: string): string {
  const raw = /"inlineSchema": ("(?:[^"\\]|\\.)*")/.exec(js);
  assert.ok(raw, 'inlineSchema not found in index.js');
  return JSON.parse(raw[1]);
}

async function main() {
  const gen = await import(pathToFileURL(path.join(appDir, 'scripts/prisma-generate.mjs')).href) as {
    libSchemaFrom: (s: string) => string;
    LIB_BINARY_TARGETS: string[];
    GENERATOR_BLOCK: RegExp;
  };
  const source = read('prisma/schema.prisma');
  const libJs = read(`${LIB}/index.js`);
  const pubJs = read(`${PUB}/index.js`);

  console.log('\nthe parallel Prisma client (lib/generated/prisma) is the same client as public/_prisma/client');

  await ok('libSchemaFrom swaps ONLY the generator block of prisma/schema.prisma', () => {
    assert.strictEqual(String(gen.GENERATOR_BLOCK), String(GENERATOR), 'this suite and the generator must cut the same block');
    const derived = gen.libSchemaFrom(source);
    assert.strictEqual(withoutGenerator(derived), withoutGenerator(source),
      'everything outside the generator block must be the source schema byte for byte');
    const block = GENERATOR.exec(derived)![0];
    assert.match(block, /^\s*output\s+= "\.\/prisma"$/m, 'output is relative to lib/generated/schema.prisma');
    assert.match(block, /^\s*binaryTargets = \["debian-openssl-3\.0\.x"\]$/m, 'the Cloud Run engine only, no "native"');
    assert.deepStrictEqual(gen.LIB_BINARY_TARGETS, ['debian-openssl-3.0.x']);
    assert.throws(() => gen.libSchemaFrom(withoutGenerator(source)), /no `generator client/);
  });

  await ok('the lib client was generated from the CURRENT schema (models, enums, datasource: all of it)', () => {
    const shipped = read(`${LIB}/schema.prisma`);
    assert.strictEqual(squash(shipped), squash(gen.libSchemaFrom(source)),
      `${LIB}/schema.prisma is not prisma/schema.prisma's derived schema. The schema changed and the lib client was not ` +
      'regenerated: run `npm run prisma:generate` and commit lib/generated/prisma with the schema.');
    assert.strictEqual(squash(inlineSchema(libJs)), squash(shipped), 'index.js embeds the same schema it ships');
  });

  await ok('both clients come from the same schema: identical outside the generator block', () => {
    assert.strictEqual(squash(withoutGenerator(read(`${LIB}/schema.prisma`))), squash(withoutGenerator(read(`${PUB}/schema.prisma`))),
      'lib/generated/prisma and public/_prisma/client disagree about the schema: regenerate both with `npm run prisma:generate`');
  });

  await ok('both clients run the same data model, Prisma version and engine version', () => {
    assert.deepStrictEqual(runtimeDataModel(libJs), runtimeDataModel(pubJs), 'runtimeDataModel differs between the clients');
    const a = generatorConfig(libJs), b = generatorConfig(pubJs);
    assert.strictEqual(a.clientVersion, b.clientVersion);
    assert.strictEqual(a.engineVersion, b.engineVersion);
  });

  await ok('the lib client targets the Cloud Run engine only, path-independent, nothing machine-specific', () => {
    const { generator } = generatorConfig(libJs);
    assert.deepStrictEqual(generator.binaryTargets, [{ fromEnvVar: null, value: 'debian-openssl-3.0.x' }],
      'binaryTargets must be exactly debian-openssl-3.0.x with no `native` entry (a native entry differs per machine)');
    assert.strictEqual(generator.output.value, LIB, 'output must be repo-relative (scripts/prisma-generate.mjs normalizes it)');
    assert.strictEqual(generator.sourceFilePath, 'lib/generated/schema.prisma');
    for (const name of ['index.js', 'edge.js']) {
      const abs = /"(sourceFilePath|value)": "(\/|[A-Za-z]:\\\\)[^"]*"/.exec(read(`${LIB}/${name}`));
      assert.ok(!abs, `${LIB}/${name} has an absolute path: ${abs?.[0]}`);
    }
  });

  await ok('exactly one engine binary, the debian one: no darwin dylib, no other platform', () => {
    const engines = readdirSync(path.join(appDir, LIB)).filter((f) => /\.node$|query_engine|query-engine/.test(f));
    assert.deepStrictEqual(engines, [ENGINE], `expected only ${ENGINE} in ${LIB}, found ${engines.join(', ')}`);
    assert.ok(!existsSync(path.join(appDir, 'lib/generated/schema.prisma')),
      'the derived schema is transient: scripts/prisma-generate.mjs removes it after generating');
  });

  await ok('the lib client is committed (index.js, types, runtime, schema, the debian engine) and nothing else is', () => {
    const tracked = new Set(git('ls-files', '--', 'lib/generated').split('\n').filter(Boolean));
    for (const f of ['index.js', 'index.d.ts', 'default.js', 'edge.js', 'package.json', 'schema.prisma',
                     'runtime/library.js', ENGINE]) {
      assert.ok(tracked.has(`${LIB}/${f}`), `${LIB}/${f} is not tracked: commit the generated client`);
    }
    for (const f of tracked) {
      assert.ok(f.startsWith(`${LIB}/`), `only ${LIB} belongs under lib/generated, found ${f}`);
      assert.ok(!/darwin|windows|\.dylib|\.dll/.test(f), `${f}: only the debian engine is committed`);
    }
    const attrs = git('check-attr', 'linguist-generated', '--', `${LIB}/index.js`);
    assert.ok(/linguist-generated: (true|set)/.test(attrs), `.gitattributes must mark ${LIB} generated, got "${attrs}"`);
  });

  await ok('step 1 leaves the deployed client alone: public/_prisma/client has one generator, its own', () => {
    const pubSchema = read(`${PUB}/schema.prisma`);
    assert.strictEqual((pubSchema.match(/^generator\s+\w+\s*\{/gm) ?? []).length, 1, 'public client: exactly one generator');
    // (The generator block's comment already names /workspace/lib/generated/prisma, from the 2026-09 attempt, so the
    // check is on an `output` line, not on the bare string.)
    const libOutput = /^\s*output\s*=\s*"[^"]*generated\/prisma"/m;
    assert.ok(!libOutput.test(pubSchema) && !libOutput.test(inlineSchema(pubJs)),
      'the public client must not carry a lib/generated output: the parallel client is derived, not a second generator block');
    assert.strictEqual((source.match(/^generator\s+\w+\s*\{/gm) ?? []).length, 1, 'prisma/schema.prisma keeps one generator');
    assert.ok(!libOutput.test(source), 'prisma/schema.prisma is unchanged by step 1 (no second generator)');
  });

  await ok('CI: the regenerated lib client is byte-identical to the committed one', () => {
    if (!process.env.CI) { console.log('      (local run: skipped; CI compares after npm ci regenerates it)'); return; }
    // Working tree against the index (in CI the index is the commit): changed files, then files the commit lacks.
    const dirty = [git('diff', '--name-only', '--', 'lib/generated'),
                   git('ls-files', '--others', '--exclude-standard', '--', 'lib/generated')].filter(Boolean).join('\n');
    assert.strictEqual(dirty, '',
      `regenerating lib/generated/prisma changed committed files:\n${dirty}\nThe commit is missing the regenerated ` +
      'client: run `npm run prisma:generate` and commit lib/generated/prisma.\n' +
      // What changed, so a CI-only difference can be read off the log instead of guessed at.
      (dirty ? dirty.split('\n') : []).map((f) => {
        // `diff --name-only` names files from the repo root, `ls-files` from appDir.
        const top = git('rev-parse', '--show-toplevel');
        const abs = existsSync(path.join(top, f)) ? path.join(top, f) : path.join(appDir, f);
        if (!existsSync(abs)) return `${f}: missing`;
        const rel = path.relative(appDir, abs);
        if (!git('ls-files', '--', rel)) return `${f}: not in the commit`;
        // Untrimmed (the git() helper trims, which would invent a difference at byte 0).
        const was = execFileSync('git', ['show', `HEAD:./${rel}`], { cwd: appDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        const now = readFileSync(path.join(appDir, rel), 'utf8');
        let i = 0;
        while (i < was.length && was[i] === now[i]) i++;
        return `${f} first differs at ${i}:\n  committed: ${JSON.stringify(was.slice(Math.max(0, i - 120), i + 200))}\n  ` +
          `regenerated: ${JSON.stringify(now.slice(Math.max(0, i - 120), i + 200))}`;
      }).join('\n'));
  });

  console.log(`\n✅ prisma-lib-client-tests: ${pass} checks green`);
}

main().catch((e) => { console.error(e); process.exit(1); });
