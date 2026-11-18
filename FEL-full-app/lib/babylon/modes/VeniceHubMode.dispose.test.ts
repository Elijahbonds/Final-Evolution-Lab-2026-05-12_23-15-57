import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');

describe('Venice hub teardown', () => {
  it('disposes the scene that is ending, not every live Venice mount', () => {
    const harness = readFileSync(path.join(ROOT, 'lib/babylon/core/ModeHarness.ts'), 'utf8');
    const mode = readFileSync(path.join(ROOT, 'lib/babylon/modes/VeniceHubMode.ts'), 'utf8');

    expect(harness).toContain('def.dispose?.(ctx)');
    expect(mode).toContain('dispose(ctx?: ModeContext)');
    expect(mode).toContain('states.get(ctx.scene)');
    expect(mode).toContain('live.delete(S)');
    expect(mode).toContain('if (live.size === 0) hubUi.reset()');
  });
});
