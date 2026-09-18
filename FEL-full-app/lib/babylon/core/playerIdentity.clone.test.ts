// Regression: Material.clone deep-clones textures, and DynamicTexture.clone()
// is a blank canvas nobody draws into — the tinted skin material never became
// ready and the body vanished from the Closet (and from every logged-in hero).
// The tint clones must SHARE the source bump map.
import { describe, expect, it } from 'vitest';
import { NullEngine, PBRMaterial, RawTexture, Scene } from '@babylonjs/core';
import { cloneForTint } from './playerIdentity';

describe('cloneForTint', () => {
  it('shares the source bump texture instead of a blank deep clone', () => {
    const scene = new Scene(new NullEngine());
    const src = new PBRMaterial('skin', scene);
    src.bumpTexture = RawTexture.CreateRGBATexture(new Uint8Array([255, 128, 255, 255]), 1, 1, scene);
    const clone = cloneForTint(src, 'skin_skin') as PBRMaterial;
    expect(clone).not.toBeNull();
    expect(clone.bumpTexture).toBe(src.bumpTexture);
    // the source's other properties still copied
    expect(clone.name).toBe('skin_skin');
    // materials without a bump map clone plainly
    const plain = new PBRMaterial('jersey', scene);
    const c2 = cloneForTint(plain, 'jersey_wear') as PBRMaterial;
    expect(c2.bumpTexture).toBeNull();
  });
});
