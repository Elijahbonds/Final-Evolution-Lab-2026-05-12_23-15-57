import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');

describe('CharacterLibrary skinning budget', () => {
  it('stores GLB spawn bone matrices in a texture before animation starts', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/babylon/core/CharacterLibrary.ts'), 'utf8');
    const skeletonCheck = src.indexOf("if (!skeleton) throw new Error(`[FEL-CHAR] no skeleton");
    const textureBacked = src.indexOf('skeleton.useTextureToStoreBoneMatrices = true;');
    const animator = src.indexOf('const animator = new CharacterAnimator');

    expect(skeletonCheck).toBeGreaterThanOrEqual(0);
    expect(textureBacked).toBeGreaterThan(skeletonCheck);
    expect(textureBacked).toBeLessThan(animator);
  });
});
