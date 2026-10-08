// The Studio-only presentation size (IMPROVE (2026-10-06), CREATOR-PLAN phase 4b; owner decision 2026-10-06: "giant and
// tiny builds show at full size only in the Studio and photo mode; every game mode keeps fair play size").
// Isolation, three ways: the scene rule (only a Studio / photo scene, never a mode or ranked), the identity (identityFrom
// never carries the size), and the source (only the Studio's preview imports the module that applies it).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRESENTATION_RANGE, emptyCreatorDoc } from '../../../creator/look/doc';
import { STANDARD_FRAME_MODES } from '../../core/playFrame';
import { identityFrom } from '../../core/playerIdentity';
import { defaultFace } from '../../../closet/wearable-catalog';
import { PRESENTATION_CONTEXTS, presentationScaleOf, stampPresentation } from './presentation';

describe('presentationScaleOf: only a Studio or photo scene', () => {
  it('a Studio or photo stamp is honoured (clamped to the range)', () => {
    for (const context of PRESENTATION_CONTEXTS) {
      expect(presentationScaleOf({ felPresentation: { context, scale: 1.2 } })).toBe(1.2);
      expect(presentationScaleOf({ felPresentation: { context, scale: 0.6 } })).toBe(0.6);
      expect(presentationScaleOf({ felPresentation: { context, scale: 9 } })).toBe(PRESENTATION_RANGE[1]);
      expect(presentationScaleOf({ felPresentation: { context, scale: 0.01 } })).toBe(PRESENTATION_RANGE[0]);
    }
  });
  it('any mode — every standard-frame mode and any casual one — and any ranked session answer exactly 1, stamp or not', () => {
    for (const felModeId of [...Object.keys(STANDARD_FRAME_MODES), 'karate', 'skate', 'golf']) {
      expect(presentationScaleOf({ felModeId, felPresentation: { context: 'studio', scale: 1.3 } })).toBe(1);
    }
    expect(presentationScaleOf({ felRanked: true, felPresentation: { context: 'photo', scale: 1.3 } })).toBe(1);
  });
  it('an unstamped scene, an unknown context or a bad scale answer 1', () => {
    for (const md of [null, undefined, {}, { felPresentation: null }, { felPresentation: { context: 'lobby', scale: 1.3 } },
      { felPresentation: { context: 'studio' } }, { felPresentation: { context: 'studio', scale: NaN } }, { felPresentation: { context: 'studio', scale: -1 } }, 'studio']) {
      expect(presentationScaleOf(md)).toBe(1);
    }
  });
  it('stampPresentation writes the scene\'s stamp, keeping its other metadata', () => {
    const scene = { metadata: { felTier: 'mobile' } as unknown };
    stampPresentation(scene, 'studio', 1.25);
    expect(scene.metadata).toEqual({ felTier: 'mobile', felPresentation: { context: 'studio', scale: 1.25 } });
    stampPresentation(scene, 'studio', null);
    expect(presentationScaleOf(scene.metadata)).toBe(1);
  });
});

describe('identity never carries it', () => {
  it('identityFrom on a slot with a Studio size: no trace of it in the identity every mode spawns from', () => {
    const slot = { id: 's1', label: 'GIANT', body: 'male', base: {}, doc: { ...emptyCreatorDoc(), shape: { face: {}, body: { head: 1.2 } } }, presentation: { scale: 1.35 }, frame: { heightScale: 1.04, buildScale: 1 } };
    const id = identityFrom({ look: { face: { ...defaultFace(), creatorSlots: [slot], activeSlot: 's1' }, equipped: {} } }, { body: 'kit-male', frame: null }, null);
    expect(JSON.stringify(id)).not.toMatch(/presentation|1\.35/);
    expect(id.creator!.shape.body.head).toBe(1.2);
    // the height is the play clamp's, never the Studio size
    expect(id.proportions!.heightScale).toBeLessThanOrEqual(1.04 * 100);
  });
});

describe('the source: only the Studio applies it', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) files.push(p);
    }
  };
  for (const d of ['app', 'components', 'lib']) walk(d);
  it('no file but the Studio preview imports shape/presentation (no mode, no harness, no identity)', () => {
    const importers = files.filter((p) => /creator\/shape\/presentation['"]/.test(readFileSync(p, 'utf8')));
    expect(importers.sort()).toEqual(['components/closet/avatar-preview.tsx']);
  });
  it('the identity pipe and the slot reader never name it', () => {
    const identity = readFileSync('lib/babylon/core/playerIdentity.ts', 'utf8');
    expect(identity).not.toMatch(/presentation/i);
    const hook = readFileSync('lib/babylon/core/creatorLook.ts', 'utf8').replace(/^\s*\/\/.*$/gm, '');
    expect(hook).not.toMatch(/presentation/i);
    const reader = /export function activeLook[\s\S]*?\n}\n/.exec(readFileSync('lib/creator/look/slots.ts', 'utf8'))![0].replace(/^\s*\/\/.*$/gm, '');
    expect(reader).not.toMatch(/presentation/);
  });
});
