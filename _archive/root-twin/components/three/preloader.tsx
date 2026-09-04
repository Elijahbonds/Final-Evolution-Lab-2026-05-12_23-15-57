'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { preloadGLTF } from './gltf-loader';
import * as THREE from 'three';

/**
 * Invisible Canvas that warms the WebGL context + preloads GLB assets.
 * Mount this early (e.g. in loader.tsx) so by the time the real game Canvas
 * mounts, assets are already in cache → instant scene startup.
 */
function Warmup({ urls, onDone }: { urls: string[]; onDone: () => void }) {
  const gl = useThree((s) => s.gl);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    // preload all GLBs in parallel
    urls.forEach((u) => preloadGLTF(gl, u));
    // Mark ready after a short tick to let GPU compile shaders
    const t = setTimeout(onDone, 80);
    return () => clearTimeout(t);
  }, [gl, urls, onDone]);
  return null;
}

export function AssetPreloader({ urls, children }: { urls: string[]; children: React.ReactNode }) {
  const [warm, setWarm] = useState(false);

  return (
    <>
      {/* Invisible 1x1 canvas just to boot WebGL + start asset loads */}
      {!warm && (
        <div style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <Canvas gl={{ powerPreference: 'high-performance' }}>
            <Warmup urls={urls} onDone={() => setWarm(true)} />
          </Canvas>
        </div>
      )}
      {children}
    </>
  );
}
