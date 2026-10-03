import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AGENT_MODES } from './agentModes';
import { ENABLED_BABYLON_MODES } from '../modes/registry';

// Ported from 9e32fd31 (cursor/app-quality-and-completion-4810). Its third test — the manifest's pipeline
// entryPoint must exist on disk — is not carried: lib/build-config.test.ts already owns that check.
//
// Prove It (`dunkduel`) remains an enabled Babylon registry mode for /dev/mode
// coverage, but /play/dunkduel is the real-life camera flow and does not mount
// GameShell or the agent bridge. Static discovery must not send an agent there.
const NON_AGENT_PLAY_MODES = new Set(['dunkduel']);

interface ManifestMode {
  id: string;
  route: string;
  label: string;
  actions: string[];
}

interface ManifestAction {
  name: string;
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

  it('advertises every enabled Babylon registry mode that has an agent-controllable play route', () => {
    const advertised = AGENT_MODES.map((mode) => mode.id).sort();
    const controllable = [...ENABLED_BABYLON_MODES].filter((mode) => !NON_AGENT_PLAY_MODES.has(mode)).sort();
    expect(advertised).toEqual(controllable);
  });

  it('only advertises actions that the manifest defines', () => {
    const actions = new Set(manifest().actions.map((action: ManifestAction) => action.name));
    const undefinedActions = AGENT_MODES.flatMap((mode) =>
      mode.actions.filter((action) => !actions.has(action)).map((action) => `${mode.id}:${action}`),
    );

    expect(undefinedActions).toEqual([]);
  });

  it('advertises only play routes that exist and mount the game shell', () => {
    for (const mode of AGENT_MODES) {
      const routeDir = join(process.cwd(), 'app', ...mode.route.replace(/^\//, '').split('/'));
      const pagePath = join(routeDir, 'page.tsx');
      const loaderPath = join(routeDir, '_components', 'loader.tsx');
      const componentDir = join(routeDir, '_components');
      const routeSources = [
        readFileSync(pagePath, 'utf8'),
        ...readdirSync(componentDir)
          .filter((file) => file.endsWith('.tsx') && file !== 'loader.tsx')
          .map((file) => readFileSync(join(componentDir, file), 'utf8')),
      ].join('\n');

      expect(existsSync(pagePath), `${mode.id} is missing ${mode.route}/page.tsx`).toBe(true);
      expect(existsSync(loaderPath), `${mode.id} is missing ${mode.route}/_components/loader.tsx`).toBe(true);
      expect(routeSources, `${mode.id} route must use its GameShell loader`).toMatch(/['"]\.\/(?:_components\/)?loader['"]/);
      expect(readFileSync(loaderPath, 'utf8'), `${mode.id} must mount GameShell`).toContain('GameShell');
    }
  });
});
