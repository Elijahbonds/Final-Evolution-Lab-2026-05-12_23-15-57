'use client';

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { useThree } from '@react-three/fiber';

// Self-hosted decoders (copied into /public/loaders) so production never depends
// on a third-party CDN for Draco geometry or KTX2/Basis texture transcoding.
let _loader: GLTFLoader | null = null;

function getLoader(gl: THREE.WebGLRenderer): GLTFLoader {
  if (_loader) return _loader;
  const draco = new DRACOLoader();
  draco.setDecoderPath('/loaders/draco/');
  const ktx2 = new KTX2Loader();
  ktx2.setTranscoderPath('/loaders/basis/');
  ktx2.detectSupport(gl);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.setKTX2Loader(ktx2);
  _loader = loader;
  return loader;
}

const cache = new Map<string, GLTF | Promise<GLTF>>();

// Suspense-friendly GLTF loader. Throws a promise while loading (caught by
// <Suspense>), caches the parsed result, and evicts on error so a transient
// failure can be retried.
export function useGLTFAsset(url: string): GLTF {
  const gl = useThree((s) => s.gl);
  const hit = cache.get(url);
  if (hit) {
    if (hit instanceof Promise) throw hit;
    return hit;
  }
  const p = getLoader(gl)
    .loadAsync(url)
    .then((g) => {
      cache.set(url, g);
      return g;
    })
    .catch((e) => {
      cache.delete(url);
      throw e;
    });
  cache.set(url, p);
  throw p;
}

export function preloadGLTF(gl: THREE.WebGLRenderer, url: string) {
  if (cache.has(url)) return;
  const p = getLoader(gl)
    .loadAsync(url)
    .then((g) => {
      cache.set(url, g);
      return g;
    })
    .catch((e) => {
      cache.delete(url);
      throw e;
    });
  cache.set(url, p);
}
