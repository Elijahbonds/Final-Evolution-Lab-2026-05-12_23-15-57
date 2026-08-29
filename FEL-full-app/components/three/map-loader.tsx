'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTFAsset } from './gltf-loader';
import type { MapConfig } from '@/lib/map-data';
import { PROCEDURAL_ENVIRONMENTS } from './env-flags';
import { ProceduralMap } from './procedural-map';

/**
 * MapMesh — the single choke point for rendering a venue's environment.
 *
 * By default (PROCEDURAL_ENVIRONMENTS === true) this renders the procedural,
 * assetless <ProceduralMap> built from three.js primitives + painted textures,
 * bypassing every broken Meshy environment GLB app-wide in one place — exactly
 * mirroring the M105 character strategy.
 *
 * Set NEXT_PUBLIC_PROCEDURAL_ENVIRONMENTS="false" to fall back to <GLBMap>,
 * which loads the original Meshy GLB (files left on disk for rollback).
 */
export function MapMesh({ config }: { config: MapConfig }) {
  if (PROCEDURAL_ENVIRONMENTS) {
    return <ProceduralMap config={config} />;
  }
  return <GLBMap config={config} />;
}

/**
 * Loads a Meshy environment GLB and renders it at the correct world scale.
 * Handles Draco + WebP textures via the shared GLTFLoader.
 * Applies the premium dark aesthetic: emissive boost, subtle environment mapping.
 */
function GLBMap({ config }: { config: MapConfig }) {
  const gltf = useGLTFAsset(config.glb);

  const scene = useMemo(() => {
    const s = gltf.scene.clone(true);
    // Boost materials for premium dark look
    s.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.receiveShadow = true;
        mesh.castShadow = false; // environments receive, don't cast
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat?.isMeshStandardMaterial) {
          // Boost emissive slightly for glow in dark scenes
          if (mat.emissiveMap) {
            mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 0.6);
          }
          // Slightly increase roughness for grounded look
          mat.roughness = Math.max(mat.roughness, 0.4);
          mat.envMapIntensity = 0.5;
          // M12.2(b): matte painted-blacktop profile. Kills the specular/reflection
          // sheen that made the scanned blue court read as rippling water, and
          // brightens the albedo (via a flat emissive re-use of the diffuse map)
          // so it reads as a lit painted court rather than a dark pool.
          if (config.matteFloor) {
            mat.roughness = 0.96;
            mat.metalness = 0.0;
            mat.envMapIntensity = 0.02;
            if (mat.map && !mat.emissiveMap) {
              mat.emissiveMap = mat.map;
              mat.emissive = new THREE.Color(0xffffff);
              mat.emissiveIntensity = 0.3;
            }
          }
          mat.needsUpdate = true;
        }
      }
    });
    return s;
  }, [gltf]);

  return (
    <primitive
      object={scene}
      scale={[config.scale, config.scale, config.scale]}
      rotation={[0, config.mapRotationY ?? 0, 0]}
      position={config.mapOffset ?? [0, 0, 0]}
    />
  );
}
