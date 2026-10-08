// "Check it on camera" — from a lesson to the Mirror, opened on the movement the lesson teaches.
//
// EDU-LINKS (2026-10-07), Mirror & coaching plan Phase 5. The href is lessonMovement.ts cameraHref:
// /play/mirror?pattern=<movement>. Reading `?pattern=` and opening that tab is the Mirror's (Phase 2); until it does,
// the link lands on the Mirror page, which is the right place to check a movement anyway. A plain anchor, not next/link:
// the Mirror asks for the camera, and a prefetch of it from every lesson is wasted work on a phone.

import { Camera } from 'lucide-react';
import { cameraHref, MOVEMENT_LABEL, type MirrorMovementId } from '@/lib/education/lessonMovement';

export function CameraLink({ movement, label, compact = false }: { movement: MirrorMovementId; label?: string; compact?: boolean }) {
  return (
    <a
      href={cameraHref(movement)}
      data-camera-link={movement}
      className={compact
        ? 'inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#00E5FF] underline-offset-2 hover:underline'
        : 'inline-flex items-center gap-2 rounded-xl border border-[#00E5FF]/30 bg-[#00E5FF]/[0.06] px-3.5 py-2 text-[13px] font-bold text-[#00E5FF] transition-colors hover:border-[#00E5FF]/60'}
    >
      <Camera aria-hidden className="h-4 w-4 shrink-0" />
      {label ?? `Check it on camera: ${MOVEMENT_LABEL[movement]}`}
    </a>
  );
}
