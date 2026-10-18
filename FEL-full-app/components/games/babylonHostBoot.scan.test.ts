import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../..');
const HOST_DIR = path.join(ROOT, 'components/games');
const babylonHosts = fs.readdirSync(HOST_DIR)
  .filter((name) => name.endsWith('-babylon.tsx'))
  .concat('tiebreak-game.tsx')
  .sort();

const read = (file: string): string =>
  stripComments(fs.readFileSync(path.join(HOST_DIR, file), 'utf8'));
const readFromRoot = (file: string): string =>
  stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8'));

describe('Babylon hosts own their boot effect for the mount', () => {
  it('keeps the host inventory visible to this guard', () => {
    expect(babylonHosts.length).toBeGreaterThanOrEqual(21);
  });

  it.each(babylonHosts)('%s reads completion callbacks through refs', (file) => {
    const src = read(file);

    expect(src).toMatch(/const onEndRef = useRef\(onEnd\);?/);
    expect(src).toMatch(/onEndRef\.current\s*=\s*onEnd/);
    expect(src).toMatch(/onEndRef\.current\(/);
    expect(src).not.toMatch(/\bonEnd\(/);
  });

  it.each(babylonHosts)('%s does not reboot because onEnd identity changed', (file) => {
    const src = read(file);

    expect(src).not.toMatch(/\},\s*\[onEnd\]\);/);
  });

  it.each(babylonHosts)('%s surfaces boot failures as retryable errors', (file) => {
    const src = read(file);

    expect(src).toMatch(/from ['"](?:\.|@\/components\/games)\/boot-error['"]/);
    expect(src).toMatch(
      /\.catch\(\(e\) => surfaceBootError\(e, \{[\s\S]*?setPhase,\s*setLoadError[\s\S]*?\}\)\);/,
    );
  });

  it.each(babylonHosts)('%s remounts when a rejected boot is retried', (file) => {
    const src = read(file);

    expect(src).toContain('bootAttempt');
    expect(src).toContain('retryBoot');
    expect(src).toMatch(/\},\s*\[[^\]]*bootAttempt[^\]]*\]\);/);
    expect(src).not.toContain('onRetry={tapStart}');
    if (file === 'who-scene-it-babylon.tsx') expect(src).toContain('onClick={retryBoot}');
    else expect(src).toContain('onRetry={retryBoot}');
  });
});

describe('deferred Babylon host boot', () => {
  it.each(babylonHosts)('%s defers boot and reports a load error', (file) => {
    const src = read(file);
    expect(src).toContain('const startTimer = setTimeout');
    expect(src).toContain('clearTimeout(startTimer)');
    expect(src).toContain('onEndRef');
    expect(src).toContain('.catch((e) => surfaceBootError(e, {');
  });
});

describe('controller host boot recovery', () => {
  it('remounts a rejected TV host boot from the retry button', () => {
    const src = readFromRoot('components/controller-link/host-stage.tsx');

    expect(src).toContain("from '@/components/games/boot-error'");
    expect(src).toContain("from '@/components/games/use-babylon-boot-retry'");
    expect(src).toContain('const { bootAttempt, retryBoot } = useBabylonBootRetry');
    expect(src).toContain('onRetry={retryBoot}');
    expect(src).toMatch(/\.catch\(\(e\) => surfaceBootError\(e, \{[\s\S]*?setPhase,\s*setLoadError[\s\S]*?\}\)\)/);
    expect(src).toMatch(/\},\s*\[[^\]]*bootAttempt[^\]]*\]\);/);
  });
});
