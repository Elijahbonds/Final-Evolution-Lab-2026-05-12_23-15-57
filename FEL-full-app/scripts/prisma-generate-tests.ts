#!/usr/bin/env -S npx tsx
/**
 * scripts/prisma-generate-tests.ts — GATE-HYGIENE. The postinstall generate must leave a clean tree:
 * the committed client's platform fields stay the committed pair, and npm ci's rewrite of yarn.lock is undone.
 *
 * Run: npx tsx scripts/prisma-generate-tests.ts
 */
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stabilizeClientText, restoreCommittedYarnLock } from './prisma-generate.mjs';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

const LINUX_TARGETS = `"binaryTargets": [
      {
        "fromEnvVar": null,
        "value": "debian-openssl-3.0.x",
        "native": true
      },
      {
        "fromEnvVar": null,
        "value": "debian-openssl-3.0.x"
      }
    ]`;
const LINUX_INDEX = `preamble ${LINUX_TARGETS} middle
// file annotations for bundling tools to include these files
path.join(__dirname, "libquery_engine-debian-openssl-3.0.x.so.node");
path.join(process.cwd(), "public/_prisma/client/libquery_engine-debian-openssl-3.0.x.so.node")
// file annotations for bundling tools to include these files
path.join(__dirname, "schema.prisma");
path.join(process.cwd(), "public/_prisma/client/schema.prisma")
`;

console.log('\nprisma generate output is pinned to the committed client');

ok('a Linux generate is rewritten to the committed darwin-arm64 + debian pair', () => {
  const out = stabilizeClientText('index.js', LINUX_INDEX);
  assert.ok(out.includes('"value": "darwin-arm64"'));
  assert.ok(out.includes('"native": true'));
  assert.equal(out.includes('"value": "debian-openssl-3.0.x",\n        "native": true'), false);
  assert.ok(out.includes('libquery_engine-darwin-arm64.dylib.node'));
  assert.ok(out.includes('libquery_engine-debian-openssl-3.0.x.so.node'));
  assert.ok(out.includes('schema.prisma'));
  assert.ok(out.startsWith('preamble '));
});

ok('edge.js gets the binary targets and is not given engine annotations', () => {
  const out = stabilizeClientText('edge.js', `x ${LINUX_TARGETS} y`);
  assert.ok(out.includes('"value": "darwin-arm64"'));
  assert.equal(out.includes('libquery_engine'), false);
});

ok('other client files are left alone', () => {
  assert.equal(stabilizeClientText('wasm.js', LINUX_INDEX), LINUX_INDEX);
});

ok('already-canonical text is unchanged', () => {
  const once = stabilizeClientText('index.js', LINUX_INDEX);
  assert.equal(stabilizeClientText('index.js', once), once);
});

console.log('\nnpm ci yarn.lock rewrite is undone only from postinstall');

ok('postinstall restores the committed yarn.lock; any other lifecycle leaves it', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fel-yarnlock-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=gate-hygiene@example.com', '-c', 'user.name=gate-hygiene', ...args], { cwd: dir, encoding: 'utf8' });
  try {
    git('init', '-b', 'main');
    writeFileSync(path.join(dir, 'yarn.lock'), 'ORIGINAL\n');
    git('add', 'yarn.lock');
    git('commit', '-m', 'lock');
    writeFileSync(path.join(dir, 'yarn.lock'), 'REWRITTEN BY NPM\n');
    assert.equal(restoreCommittedYarnLock(dir, { npm_lifecycle_event: 'build' }), false);
    assert.equal(readFileSync(path.join(dir, 'yarn.lock'), 'utf8'), 'REWRITTEN BY NPM\n');
    assert.equal(restoreCommittedYarnLock(dir, { npm_lifecycle_event: 'postinstall' }), true);
    assert.equal(readFileSync(path.join(dir, 'yarn.lock'), 'utf8'), 'ORIGINAL\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n✅ prisma-generate-tests: ${pass} checks green`);
