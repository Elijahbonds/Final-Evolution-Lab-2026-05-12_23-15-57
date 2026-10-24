'use client';

// The form tile for everyone whose Mirror sets are NOT saved on the server — under-18s, no birth year, an adult who has
// not opted in (owner decision 1, 2026-10-07). Their clean-rep % is kept on this phone (lib/mirror/deviceProgress), so
// the page reads it here, after hydration, and the server's empty tile is what shows until then (and if there is none).
import { useEffect, useState } from 'react';
import { readDeviceEntries } from '@/lib/mirror/deviceProgress';
import { HEADLINE, PROGRESS_MOVEMENTS } from '@/lib/mirror/progressReading';
import { formFrom, type ProgressTile } from '@/lib/profile-v2/tiles';
import { TileView } from './tile';

export function DeviceFormTile({ fallback, accent }: { fallback: ProgressTile; accent: string }) {
  const [tile, setTile] = useState<ProgressTile>(fallback);
  useEffect(() => {
    const points: { at: number; value: number }[] = [];
    for (const m of PROGRESS_MOVEMENTS) {
      if (HEADLINE[m].id !== 'cleanShare') continue;   // the press/row's faults per rep is another scale
      for (const e of readDeviceEntries(m) ?? []) points.push(e);
    }
    if (points.length) setTile(formFrom(points, Date.now(), 'device'));
  }, []);
  return <TileView tile={tile} accent={accent} />;
}
