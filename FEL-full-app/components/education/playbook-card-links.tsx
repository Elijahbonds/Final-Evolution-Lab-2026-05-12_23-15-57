// The links under a Playbook card in the Knowledge Feed (/learn): the chapter it came from, and the camera when that
// chapter teaches a Mirror movement. EDU-LINKS (2026-10-07), Mirror & coaching plan Phase 5. Renders nothing for a card
// that is not from the Playbook, so the feed mounts it under every card without asking.
//
// The hrefs are lib/education/links.ts playbookCardLinks (tested there). Both pages ask a guest to sign in and bring
// them back (loginPath), so a guest reading the 5-card preview is never sent to a dead end.

import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { playbookCardLinks } from '@/lib/education/links';
import { CameraLink } from './camera-link';

export function PlaybookCardLinks({ cardId }: { cardId: string }) {
  const links = playbookCardLinks(cardId);
  if (!links) return null;
  return (
    <p data-playbook-links className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5">
      <Link
        href={links.chapter.href}
        prefetch={false}
        data-chapter-link
        className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#00FF9D] underline-offset-2 hover:underline"
      >
        <BookOpen aria-hidden className="h-4 w-4 shrink-0" /> {links.chapter.label}
      </Link>
      {links.camera ? <CameraLink movement={links.camera.movement} label={links.camera.label} compact /> : null}
    </p>
  );
}
