#!/usr/bin/env -S npx tsx
/**
 * scripts/sql-guard/cli.ts — the thin I/O shell around sqlGuard.ts, for .github/workflows/db-guard.yml.
 * It never connects to a database: the workflow runs Prisma and hands this script files.
 *
 *   npx tsx scripts/sql-guard/cli.ts decide --diff <diff.sql> [--pending prisma/pending] [--report <out.md>] [--expect-empty]
 *       Prints the decision. Exit 0 for "empty" or "match", 3 for "unexpected" (and, with --expect-empty, 3 for
 *       anything but "empty"). Under GitHub Actions it also writes `decision=` and `files=` to $GITHUB_OUTPUT.
 *   npx tsx scripts/sql-guard/cli.ts redact < in > out
 *       Copies stdin to stdout with every part of $PROD_DIRECT_URL replaced by <redacted> (the repo is public).
 *   npx tsx scripts/sql-guard/cli.ts rollback <file.sql>...
 *       Prints each file's undo. Never run by the workflow; for the owner, by hand (docs/DB-GUARD.md).
 */
import fs from 'node:fs';
import path from 'node:path';
import { decide, formatDecision, redact, rollbackFor, type PendingFile } from './sqlGuard';

const SAFE_NAME = /^[A-Za-z0-9._-]+\.sql$/;

function arg(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
}

export function readPending(dir: string): PendingFile[] {
  return fs.readdirSync(dir)
    .filter(name => name.endsWith('.sql'))
    .sort()
    .map(name => ({ name, sql: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  if (cmd === 'decide') {
    const diffPath = arg(rest, '--diff');
    if (!diffPath) { console.error('decide: --diff <file> is required'); return 2; }
    const pendingDir = arg(rest, '--pending') ?? path.join(__dirname, '..', '..', 'prisma', 'pending');
    const d = decide(fs.readFileSync(diffPath, 'utf8'), readPending(pendingDir));
    if (d.kind === 'match' && !d.files.every(f => SAFE_NAME.test(f))) {
      console.error(`decide: refusing a pending file name outside ${SAFE_NAME}`);
      return 3;
    }
    const text = formatDecision(d);
    console.log(text);
    const report = arg(rest, '--report');
    if (report) fs.writeFileSync(report, `${text}\n`);
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `decision=${d.kind}\nfiles=${d.kind === 'match' ? d.files.join(' ') : ''}\n`);
    }
    if (d.kind === 'unexpected') return 3;
    if (rest.includes('--expect-empty') && d.kind !== 'empty') return 3;
    return 0;
  }
  if (cmd === 'redact') {
    process.stdout.write(redact(fs.readFileSync(0, 'utf8'), process.env.PROD_DIRECT_URL));
    return 0;
  }
  if (cmd === 'rollback') {
    for (const f of rest) {
      console.log(`-- ${path.basename(f)}`);
      for (const line of rollbackFor(fs.readFileSync(f, 'utf8'))) console.log(line);
    }
    return 0;
  }
  console.error('usage: cli.ts decide --diff <file> [--pending <dir>] [--report <md>] [--expect-empty] | redact | rollback <file>...');
  return 2;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
