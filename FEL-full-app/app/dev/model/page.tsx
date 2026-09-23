import { notFound } from 'next/navigation';
import { ModelViewer } from './loader';

export const dynamic = 'force-dynamic';

/** Dev-only model viewer (models pass, 2026-09-22): a rigged body through CharacterLibrary (Gate 0 + the FEL clip set) on a
 *  bare lit stage, for the contact sheet and the route measurements. Hard 404 outside `next dev`, no auth (the /dev/mode
 *  pattern). `?url=/models/x.glb&clip=idle_stand&yaw=0` */
export default function DevModelPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ModelViewer />;
}
