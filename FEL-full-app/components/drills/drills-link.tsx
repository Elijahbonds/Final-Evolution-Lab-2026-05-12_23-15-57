// "Run it on camera" — from a Playbook lesson to its drill on /play/drills (Mirror & coaching plan Phase 6, 2026-10-07).
//
// Beside edu-links' "Check it on camera" (components/education/camera-link.tsx, which opens the Mirror on a movement):
// a lesson whose drill is charted for the camera (lib/drills/playbookLinks.ts, derived from each drill's own source)
// links to that drill's page — its detail, never the camera itself: the camera always waits for a tap there, and an
// under-18 meets the grown-up step first. A plain anchor, like CameraLink: no prefetch of a camera page from every lesson.
// Renders nothing for a lesson with no drill.

import { Activity } from 'lucide-react';
import { lessonDrillLinks } from '@/lib/drills/playbookLinks';

export function DrillsLink({ lessonId }: { lessonId: string }) {
  const links = lessonDrillLinks(lessonId);
  if (!links.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2" data-drills-link={lessonId}>
      {links.map((l) => (
        <a
          key={l.drillId}
          href={l.href}
          data-drill-link={l.drillId}
          className="inline-flex items-center gap-2 rounded-xl border border-[#00FF9D]/30 bg-[#00FF9D]/[0.06] px-3.5 py-2 text-[13px] font-bold text-[#00FF9D] transition-colors hover:border-[#00FF9D]/60"
        >
          <Activity aria-hidden className="h-4 w-4 shrink-0" />
          {l.label}
        </a>
      ))}
    </div>
  );
}
