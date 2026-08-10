'use client';

import { useEffect, useState } from 'react';

export type Orientation = 'landscape' | 'portrait';

// Tracks viewport orientation for responsive 3D layout. Client-only (the 3D
// canvas is always dynamically imported with ssr:false, so no hydration risk).
export function useOrientation(): Orientation {
  const [o, setO] = useState<Orientation>('landscape');
  useEffect(() => {
    const compute = () => {
      const portrait = typeof window !== 'undefined' && window.innerHeight >= window.innerWidth;
      setO(portrait ? 'portrait' : 'landscape');
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('orientationchange', compute);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('orientationchange', compute);
    };
  }, []);
  return o;
}
