// CI-SUITE-NPX: the runner must spawn the tsx CLI npm installed, and must not
// fetch a package at run time. vitest.config.ts already includes lib/**/*.test.ts.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { installedTsxCli, isDirectRun, suiteCommand } from '../../scripts/ci-suite';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePath = path.join(root, 'scripts', 'ci-suite.ts');
const source = fs.readFileSync(sourcePath, 'utf8');

describe('ci-suite runner', () => {
  it('contains no yarn spawn and no bare npx tsx that could download', () => {
    expect(source.includes("'yarn'")).toBe(false);
    expect(source.includes('"yarn"')).toBe(false);
    expect(source.includes('npx tsx')).toBe(false);
    expect(source.includes("'npx'")).toBe(false);
    expect(source.includes('"npx"')).toBe(false);
    expect(source).not.toMatch(/execFile\(\s*['"]npx['"]/);
    expect(source).not.toMatch(/spawn\(\s*['"]npx['"]/);
  });

  it('resolves suiteCommand to the locally installed tsx CLI', () => {
    const cli = installedTsxCli();
    expect(cli).toBe(require.resolve('tsx/cli'));
    expect(path.normalize(cli)).toBe(path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'));
    expect(fs.existsSync(cli)).toBe(true);
    const [command, args] = suiteCommand('smokeTest.ts');
    expect(command).toBe(process.execPath);
    expect(args).toEqual([cli, path.join('scripts', 'smokeTest.ts')]);
  });

  it('does not auto-run on import, and the CLI still runs when it is the entry', () => {
    expect(isDirectRun()).toBe(false);
    expect(isDirectRun(sourcePath, pathToFileURL(sourcePath).href)).toBe(true);

    const out = execFileSync(
      process.execPath,
      [installedTsxCli(), sourcePath, '--list'],
      {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, NODE_ENV: 'test' },
      },
    );
    expect(out).toContain('suite(s) discovered');
    expect(out).toContain('smokeTest.ts');
    expect(out).toContain('mode-list-check.ts');
  });
});
