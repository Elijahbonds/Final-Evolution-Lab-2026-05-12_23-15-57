'use client';

// The weekly card for everyone whose Mirror sets are NOT saved on the server (under 18, no birth year, an adult who has
// not opted in): their clean-rep % is kept on this phone (lib/mirror/deviceProgress), so the form tile is read here,
// after hydration, and the card is summarized again so its top line agrees with the tile. The same read as profile v2's
// form tile (components/profile-v2/device-form-tile.tsx). Nothing is sent.
import { useEffect, useState } from 'react';
import { readDeviceEntries } from '@/lib/mirror/deviceProgress';
import { HEADLINE, PROGRESS_MOVEMENTS } from '@/lib/mirror/progressReading';
import { formFrom } from '@/lib/profile-v2/tiles';
import { withTile, type ProgressCard } from '@/lib/progress-card/summary';
import { ProgressCardView } from './progress-card-view';

/** This phone's clean-rep shares (0..1), every clean-share movement; [] when it keeps none. */
export function phoneFormPoints(): { at: number; value: number }[] {
  const points: { at: number; value: number }[] = [];
  for (const m of PROGRESS_MOVEMENTS) {
    if (HEADLINE[m].id !== 'cleanShare') continue;   // the press/row's faults per rep is another scale
    for (const e of readDeviceEntries(m) ?? []) points.push(e);
  }
  return points;
}

export function DeviceCard({ card }: { card: ProgressCard }) {
  const [shown, setShown] = useState(card);
  useEffect(() => {
    const points = phoneFormPoints();
    setShown(points.length ? withTile(card, formFrom(points, Date.now(), 'device')) : card);
  }, [card]);
  return <ProgressCardView card={shown} />;
}
