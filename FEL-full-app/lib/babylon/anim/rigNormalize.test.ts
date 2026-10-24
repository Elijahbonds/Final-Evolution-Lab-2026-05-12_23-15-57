import { describe, expect, it } from 'vitest';
import type { AssetContainer, Skeleton } from '@babylonjs/core';
import { storeBoneMatricesInTexture } from './rigNormalize';

function containerWith(skeletons: Array<Pick<Skeleton, 'useTextureToStoreBoneMatrices'>>): AssetContainer {
  return { skeletons } as AssetContainer;
}

describe('storeBoneMatricesInTexture', () => {
  it('puts every imported skeleton on texture-backed bone matrices', () => {
    const a = { useTextureToStoreBoneMatrices: false };
    const b = { useTextureToStoreBoneMatrices: false };
    const updated = storeBoneMatricesInTexture(containerWith([a, b]));

    expect(updated).toBe(2);
    expect(a.useTextureToStoreBoneMatrices).toBe(true);
    expect(b.useTextureToStoreBoneMatrices).toBe(true);
  });

  it('is idempotent once a skeleton is already safe', () => {
    const a = { useTextureToStoreBoneMatrices: true };

    expect(storeBoneMatricesInTexture(containerWith([a]))).toBe(0);
    expect(a.useTextureToStoreBoneMatrices).toBe(true);
  });
});
