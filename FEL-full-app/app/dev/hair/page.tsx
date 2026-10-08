import { notFound } from 'next/navigation';
import { HairSheet } from './hair-sheet';

export const dynamic = 'force-dynamic';

/**
 * Dev-only hair stage, no auth. Hard 404 outside `next dev`. 2026-10-07 (the hair expansion).
 *
 * One kit body under the Studio's light, wearing a look through the real identity pipe (identityFrom → applyIdentity →
 * the code-built hair), so the whole catalogue can be photographed on both kits, front and 3/4, by a script: the page
 * exposes `window.felHair.show({ sex, style, extras, yaw })` and `window.felHair.snap()` (a PNG data URL).
 */
export default function DevHairPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <HairSheet />;
}
