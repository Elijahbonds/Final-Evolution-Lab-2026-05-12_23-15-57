import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENT_MODES } from './agentModes';

// Ported from 9e32fd31 (cursor/app-quality-and-completion-4810). Its third test — the manifest's pipeline
// entryPoint must exist on disk — is not carried: lib/build-config.test.ts already owns that check.

interface ManifestMode {
  id: string;
  route: string;
  label: string;
  actions: string[];
}

function manifest() {
  return JSON.parse(readFileSync(join(process.cwd(), 'public', 'agent-manifest.json'), 'utf8'));
}

describe('NEXUS agent manifest', () => {
  it('stays in sync with the runtime agent mode descriptors', () => {
    const modes = manifest().modes.map(({ id, route, label, actions }: ManifestMode) => ({
      id,
      route,
      label,
      actions,
    }));

    expect(modes).toEqual(AGENT_MODES);
  });

  it('advertises only play routes that exist and mount the game shell', () => {
    for (const mode of AGENT_MODES) {
      const routeDir = join(process.cwd(), 'app', ...mode.route.replace(/^\//, '').split('/'));
      const pagePath = join(routeDir, 'page.tsx');
      const loaderPath = join(routeDir, '_components', 'loader.tsx');

      expect(existsSync(pagePath), `${mode.id} is missing ${mode.route}/page.tsx`).toBe(true);
      expect(existsSync(loaderPath), `${mode.id} is missing ${mode.route}/_components/loader.tsx`).toBe(true);
      expect(readFileSync(loaderPath, 'utf8'), `${mode.id} must mount GameShell`).toContain('GameShell');
    }
  });
});
