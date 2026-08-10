'use client';

import { useEffect } from 'react';
import { useThree, useLoader } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * SceneBackdrop
 * ─────────────
 * Renders a photographic environment image as the scene background so the 3D
 * arenas sit inside their intended venue instead of a flat black void. The
 * texture is drawn behind all geometry and is unaffected by scene fog (fog only
 * tints world meshes), so the venue photo always reads crisply while the ground
 * still blends into the fog near the horizon.
 *
 * We also feed the same texture into an equirectangular-style environment map so
 * reflective court/dojo materials pick up subtle colour from the surroundings.
 */
export function SceneBackdrop({ url, asEnvironment = true }: { url: string; asEnvironment?: boolean }) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const texture = useLoader(THREE.TextureLoader, url);

  useEffect(() => {
    if (!texture) return;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;

    const prevBg = scene.background;
    const prevEnv = scene.environment;
    scene.background = texture;
    if (asEnvironment) scene.environment = texture;

    return () => {
      scene.background = prevBg;
      scene.environment = prevEnv;
    };
  }, [texture, scene, gl, asEnvironment]);

  return null;
}
