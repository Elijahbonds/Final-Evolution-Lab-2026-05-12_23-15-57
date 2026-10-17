// Style pass (owner 2026-10-16, decisions S1 and S3): a forge rival hangs its OWN accessory signature at spawn, and 3v3 puts the
// team colour on the TOP only — the bottoms stay the player's own (the shorts take it only on a body whose top the jersey keys miss).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lib = readFileSync('lib/babylon/core/CharacterLibrary.ts', 'utf8');
const three = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');

describe('the casual rivals are wired', () => {
  it('a spawn hangs the body\'s baked signature before the seeded deal (an explicit look still wins)', () => {
    expect(lib).toMatch(/const baked = bakedLook\(\[root, \.\.\.root\.getChildTransformNodes\(false\)\]\.map\(\(n\) => n\.metadata\?\.gltf\?\.extras\?\.look\)/);
    expect(lib).toMatch(/attachAccessories\(scene, skeleton, root, opts\.look \?\? baked \?\? \{/);
  });
  it('3v3 tints the top with the team colour; the shorts only as the fallback for a top the jersey keys miss', () => {
    expect(three).toMatch(/tintGarmentSlot\(char, SLOT_KEYS\.jersey, TEAM_JERSEY\[side\]\);/);
    expect(three).toMatch(/const topTinted = char\.meshes\.some\(\(m\) => SLOT_KEYS\.jersey\.some\(/);
    expect(three).toMatch(/if \(!topTinted\) tintGarmentSlot\(char, SLOT_KEYS\.shorts, TEAM_SHORTS\[side\]\);/);
  });
});
