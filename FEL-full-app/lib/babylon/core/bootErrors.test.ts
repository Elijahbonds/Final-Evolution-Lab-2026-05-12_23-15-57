import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { bootErrorRequiresPageReload, WEBGL_CONTEXT_RESET_MESSAGE } from './bootErrors';

const ROOT = path.resolve(__dirname, '../../..');

describe('Babylon boot error recovery', () => {
  it('treats WebGL context reset as a page reload recovery', () => {
    expect(bootErrorRequiresPageReload(WEBGL_CONTEXT_RESET_MESSAGE)).toBe(true);
    expect(bootErrorRequiresPageReload('Load timed out — check your connection and retry.')).toBe(false);
    expect(bootErrorRequiresPageReload(undefined)).toBe(false);
  });

  it('uses reload wording from the harness and reloads from the splash', () => {
    const harness = fs.readFileSync(path.join(ROOT, 'lib/babylon/core/ModeHarness.ts'), 'utf8');
    const splash = fs.readFileSync(path.join(ROOT, 'components/games/boot-splash.tsx'), 'utf8');

    expect(harness).toContain('WEBGL_CONTEXT_RESET_MESSAGE');
    expect(splash).toContain('window.location.reload();');
    expect(splash).toContain("{reloadRequired ? 'RELOAD' : 'RETRY'}");
  });
});
