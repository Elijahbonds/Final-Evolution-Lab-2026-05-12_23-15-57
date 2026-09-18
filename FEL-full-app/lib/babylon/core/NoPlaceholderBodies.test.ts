// NO PLACEHOLDER BODIES — owner, 2026-09-12: "make sure there arent any placeholder bodies anymore,
// only humanoids that move well".
//
// The audit that prompted this came back clean, which is exactly when a guard is worth writing: the
// cheapest way to populate a scene is a capsule, and it has happened before. Ship Pass 6 replaced the
// onlookers' "armless pills on the rail" (the owner's own read: "fix the arms of the NPCs") with roster
// bodies — so this is a regression the project has already paid for once.
//
// These read the SOURCE rather than a scene, deliberately: a rule about what the code is allowed to do
// is cheaper and far more reliable to enforce on the code than on a render.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MODES = path.join(ROOT, 'lib/babylon/modes');
const VISUAL = path.join(ROOT, 'lib/babylon/visual');

const tsFiles = (dir: string): string[] =>
  fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => path.join(dir, f));

/** Words that mean "this mesh is standing in for a person". */
const BODY_WORDS = /(opponent|opp_|rival|foe|enemy|npc|dummy|stand_?in|placeholder|proxy_?body|spectator|onlooker|pedestrian|fighter|defender|teammate|mate_|goalie|keeper|crowd_?body|person|human)/i;
const PRIMITIVE = /Create(Box|Capsule|Sphere|Cylinder|Disc|Plane|Polyhedron)\(\s*['"`]([^'"`]+)['"`]/g;

describe('nobody is a capsule', () => {
  it('no mode builds a primitive mesh named after a person', () => {
    const offenders: string[] = [];
    for (const file of [...tsFiles(MODES), ...tsFiles(VISUAL)]) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(PRIMITIVE)) {
        const name = m[2];
        if (BODY_WORDS.test(name)) offenders.push(`${path.basename(file)}: ${m[1]}('${name}')`);
      }
    }
    // a primitive called 'ball' or 'rail' is a prop and entirely fine; one called 'opponent' is a person
    expect(offenders).toEqual([]);
  });

  it('the onlookers spawn real roster bodies through CharacterLibrary, not silhouettes', () => {
    const src = fs.readFileSync(path.join(VISUAL, 'Onlookers.ts'), 'utf8');
    expect(src).toMatch(/CharacterLibrary\.spawn/);
    // the shape of the old bug: two instanced capsule masters standing in for a crowd
    expect(src).not.toMatch(/CreateCapsule\(/);
  });

  it('every crowd body is given a START CLIP, so none of them stands in bind pose', () => {
    // a body spawned with no clip renders in its BIND POSE — a T-pose, which is the most placeholder
    // thing a humanoid can possibly look like while technically being a humanoid
    const src = fs.readFileSync(path.join(VISUAL, 'Onlookers.ts'), 'utf8');
    expect(src).toMatch(/startClip:\s*'[a-z_]+'/);
  });
});

describe('a start clip that does not exist is the same bug as no start clip', () => {
  it('every startClip named anywhere in the modes resolves in the clip registry', () => {
    // Clip names resolve from TWO files and a test that reads only one is a false alarm: the first run
    // of this flagged skate_idle_cruise / karate_idle_stance / football_sprint_return as missing when all
    // three are declared in clipAliases.ts.
    const registry = ['clipRegistry.ts', 'clipAliases.ts']
      .map((f) => fs.readFileSync(path.join(ROOT, 'lib/babylon/anim', f), 'utf8')).join('\n');
    const named = new Set<string>();
    for (const dir of [MODES, VISUAL]) {
      for (const file of tsFiles(dir)) {
        const src = fs.readFileSync(file, 'utf8');
        for (const m of src.matchAll(/startClip:\s*'([a-z0-9_]+)'/g)) named.add(m[1]);
      }
    }
    expect(named.size).toBeGreaterThan(0);
    const missing = [...named].filter((clip) => {
      // either a registry KEY (an alias such as `idle: 'idle_stand'`) or a clip name the registry knows
      const asKey = new RegExp(`(^|\\n)\\s*${clip}\\s*:`).test(registry);
      const asValue = new RegExp(`['"\`]${clip}['"\`]`).test(registry);
      return !asKey && !asValue;
    });
    expect(missing).toEqual([]);
  });
});

describe('THE CAPSULE STAND-INS ARE NEVER ON SCREEN', () => {
  // The venue specs still BUILD armless capsule actors — they are the only way to compose a venue before any
  // rig exists — and Ship Pass 6 made every mode hide them once its real bodies landed, with a 2.5 s
  // auto-hide for the modes that forgot. Which meant that for the first two and a half seconds of every
  // venue mount, capsule people were on screen. Measured before this changed: 12 of 12 parts visible at
  // 2.75 s in tennis; after: 0 at every sample.
  const venue = fs.readFileSync(path.join(ROOT, 'lib/babylon/core/NexusVenue.ts'), 'utf8');

  it('mountVenue hides them AT THE MOUNT, not on a timer', () => {
    // positional rather than sliced at the first `return {` — this file has several, and slicing on the
    // first one cut the check off before the line it was looking for
    const hideAtMount = venue.indexOf('for (const a of placeholders) a.getChildMeshes()');
    const handleMethod = venue.indexOf('hidePlaceholders() {');
    expect(hideAtMount, 'no hide-at-mount loop').toBeGreaterThan(-1);
    expect(hideAtMount, 'the hide happens after the handle is returned').toBeLessThan(handleMethod);
  });

  it('there is no auto-hide timer left to race the first frames', () => {
    expect(venue).not.toMatch(/setTimeout\([^)]*placeholders/);
    expect(venue).not.toMatch(/autoHide/);
  });

  it('revealing them is possible but explicit — authoring only', () => {
    expect(venue).toMatch(/showPlaceholders\(\)/);
  });
});
