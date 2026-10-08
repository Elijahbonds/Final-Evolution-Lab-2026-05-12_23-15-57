// OWNER DECISION 2026-10-06 (moderate): the scene-recall party mode's player-facing name is "Spot the Scene" — the old name
// riffed on a trademarked title. The internal mode id, route and storage keys stay (`who_scene_it`, `whoSceneIt`,
// `/play/who-scene-it`, `who-scene-it`) so saved sessions, links and stakes keep working.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MODE_INFO } from '@/lib/game-data';
import { AGENT_MODES } from '@/lib/babylon/core/agentModes';
import { REASON_LABELS } from '@/lib/wallet/reason-labels';

const ROOT = path.join(__dirname, '../..');
const read = (f: string): string => readFileSync(path.join(ROOT, f), 'utf8');

/** Every file that puts the mode's name in front of a player (menus, splash, HUD, cards, manifest, wallet history). */
const PLAYER_FACING = [
  'app/play/who-scene-it/_components/loader.tsx', 'components/games/who-scene-it-babylon.tsx', 'components/games/who-scene-it-game.tsx',
  'app/creator/_components/hub.tsx', 'lib/creator/creative-card-types.ts', 'lib/game-data.ts', 'lib/babylon/core/agentModes.ts',
  'lib/babylon/nexus/venueSpecs.ts', 'lib/controller-link/schemas/registry.ts', 'lib/guidance/pathways.ts', 'lib/mp/match-core.ts',
  'public/agent-manifest.json', 'lib/wallet/reason-labels.ts',
];

describe('Spot the Scene (owner 2026-10-06)', () => {
  it('the catalogue, the agent list and the shell title say Spot the Scene; the id and route are unchanged', () => {
    expect(MODE_INFO.whoSceneIt.name).toBe('Spot the Scene');
    expect(MODE_INFO.whoSceneIt.href).toBe('/play/who-scene-it');
    const agent = AGENT_MODES.find((m) => m.id === 'who_scene_it');
    expect(agent).toMatchObject({ route: '/play/who-scene-it', label: 'Spot the Scene' });
    expect(read('app/play/who-scene-it/_components/loader.tsx')).toContain('<GameShell mode="whoSceneIt" title="SPOT THE SCENE"');
    expect(REASON_LABELS.SCENEIT_FREEUSE_IDENTIFIED.label).toBe('Spot the Scene — Free-Use Legend');
  });
  it('no player-facing string names the old title (comments may still say where it came from)', () => {
    for (const f of PLAYER_FACING) {
      const code = read(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      const strings = code.match(/(['"`])(?:\\.|(?!\1).)*\1|>[^<{}]+</g) ?? [];
      for (const raw of strings) {
        const s = raw.replace(/who-scene-it|who_scene_it|whoSceneIt|WhoSceneIt|WHO_SCENE_IT/g, '');   // the kept route / id / code spellings
        expect(s, f).not.toMatch(/who[ -]?scene[ -]?it/i);
        expect(s, f).not.toMatch(/\bScene It\b|SCENE IT/);
      }
    }
  });
});
