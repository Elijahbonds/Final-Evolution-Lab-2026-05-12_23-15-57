// QG-05: scripts/rollback.sh picks the right commit, refuses an unsafe one, and never deploys. It runs against a
// throwaway git repository laid out like FEL-full-app, so the test needs no history from this checkout (CI clones
// shallow) and touches nothing real.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let repo = '';
const sha: Record<string, string> = {};
const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim();
const put = (p: string, s: string) => { mkdirSync(join(repo, p, '..'), { recursive: true }); writeFileSync(join(repo, p), s); };
const run = (args: string[], env: Record<string, string> = {}) => spawnSync('bash', [join(repo, 'scripts/rollback.sh'), ...args], { cwd: repo, encoding: 'utf8', env: { ...process.env, ROLLBACK_SHA: '', ...env } });
const releases = (rows: Array<{ v: string; sha: string; deployedAt: string | null }>) =>
  JSON.stringify({ releases: rows.map((r) => ({ version: r.v, date: '2026-10-20', sha: r.sha, fromSha: r.sha, deployedAt: r.deployedAt, notes: [] })) });

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'fel-rollback-'));
  git('init', '-q');
  git('config', 'user.email', 'rig@example.com'); git('config', 'user.name', 'rig'); git('config', 'commit.gpgsign', 'false');
  mkdirSync(join(repo, 'scripts'));
  copyFileSync(join(__dirname, '../../scripts/rollback.sh'), join(repo, 'scripts/rollback.sh'));
  put('prisma/schema.prisma', 'model A { id Int @id }\n'); put('package-lock.json', '{}\n'); put('firebase.json', '{}\n');
  put('public/_prisma/schema.prisma', 'x'); put('public/_prisma/client/schema.prisma', 'x'); put('public/_prisma/client/index.js', 'x');
  put('public/_prisma/client/libquery_engine-debian-openssl-3.0.x.so.node', 'x');
  git('add', '-A'); git('commit', '-qm', 'A'); sha.A = git('rev-parse', 'HEAD');
  put('app.txt', 'B'); git('add', '-A'); git('commit', '-qm', 'B'); sha.B = git('rev-parse', 'HEAD');
  put('prisma/schema.prisma', 'model A { id Int @id }\nmodel B { id Int @id }\n'); git('add', '-A'); git('commit', '-qm', 'C'); sha.C = git('rev-parse', 'HEAD');
  // a commit that lost the committed Prisma client (the trap in /CLAUDE.md)
  git('checkout', '-q', '-b', 'broken', sha.A); git('rm', '-q', 'public/_prisma/client/index.js'); git('commit', '-qm', 'broken'); sha.broken = git('rev-parse', 'HEAD');
  git('checkout', '-q', '-b', 'side', sha.A); put('side.txt', 'S'); git('add', '-A'); git('commit', '-qm', 'side'); sha.side = git('rev-parse', 'HEAD');
  git('checkout', '-q', sha.C);
  put('lib/release/releases.json', releases([{ v: 'C', sha: sha.C, deployedAt: '2026-10-22' }, { v: 'B', sha: sha.B, deployedAt: '2026-10-21' }, { v: 'A', sha: sha.A, deployedAt: '2026-10-20' }]));
  git('add', '-A'); git('commit', '-qm', 'record');   // HEAD is the deployed tree; --current C names what is live
});
afterAll(() => { if (repo) rmSync(repo, { recursive: true, force: true }); });

describe('scripts/rollback.sh', () => {
  it('--dry-run picks the previous DEPLOYED release, runs every check, prints the steps, and changes nothing', () => {
    const before = git('rev-parse', 'HEAD');
    const r = run(['--dry-run', '--current', sha.C]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`ROLLBACK_SHA=${sha.B}`);
    expect(r.stdout).toContain('it is an ancestor of the live commit');
    expect(r.stdout).toContain('Linux (debian) engine');
    expect(r.stdout).toContain('the Prisma schema differs from live');
    expect(r.stdout).toContain('firebase-tools@latest deploy');   // printed for the owner…
    expect(git('rev-parse', 'HEAD')).toBe(before);                 // …and nothing moved
  });

  it('with no flags it is a dry run', () => {
    const r = run(['--current', sha.C]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`ROLLBACK_SHA=${sha.B}`);
  });

  it('a release never deployed is skipped; --to and ROLLBACK_SHA win over the record', () => {
    put('lib/release/releases.json', releases([{ v: 'C', sha: sha.C, deployedAt: '2026-10-22' }, { v: 'B', sha: sha.B, deployedAt: null }, { v: 'A', sha: sha.A, deployedAt: '2026-10-20' }]));
    expect(run(['--current', sha.C]).stdout).toContain(`ROLLBACK_SHA=${sha.A}`);
    expect(run(['--current', sha.C, '--to', sha.B]).stdout).toContain(`ROLLBACK_SHA=${sha.B}`);
    expect(run(['--current', sha.C], { ROLLBACK_SHA: sha.B }).stdout).toContain(`ROLLBACK_SHA=${sha.B}`);
    git('checkout', '-q', '--', 'lib/release/releases.json');
  });

  it('refuses a commit without the committed Prisma client, the live commit itself, and an unknown sha', () => {
    const broken = run(['--current', sha.C, '--to', sha.broken]);
    expect(broken.status).toBe(1);
    expect(broken.stderr).toContain('public/_prisma/client/index.js is not committed');
    expect(run(['--current', sha.C, '--to', sha.C]).stderr).toContain('IS the live commit');
    expect(run(['--current', sha.C, '--to', 'deadbeef']).status).toBe(1);
  });

  it('warns when the rollback commit is not an ancestor (a different line, not a step back)', () => {
    const r = run(['--current', sha.C, '--to', sha.side]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`ROLLBACK_SHA=${sha.side}`);
    expect(r.stdout).toContain('is NOT an ancestor of the live commit');
  });

  it('the script holds no deploy or push of its own (it only prints them)', () => {
    const src = execFileSync('grep', ['-nE', '^[^#]*(firebase-tools|firebase deploy|git push|gcloud )', join(repo, 'scripts/rollback.sh')], { encoding: 'utf8' });
    for (const line of src.trim().split('\n')) expect(line, line).toMatch(/^\d+:\s{4}/);   // every mention is an indented line of the printed heredoc
  });
});
