// CoachNote — the coach's note on one of Today's exercises, with the Mirror's written corrective as a link
// (MIRROR-COACH P9 fix, 2026-09-30, code review).
//
// Rule (e) says the written correctives are reachable "from a coach prescription". A screen prescription's Prep row now
// carries its matching written corrective in the coach note ("… Written corrective: /play/mirror/correctives#…",
// lib/coach/mirrorToProgram.ts coachNoteFor); this renders that path as a link to the correctives page and the rest
// of the note as the plain text it always was. ONLY that one internal path is ever linked — a coach note is typed text,
// and nothing else in it (a URL, another path) becomes a link.
//
// Stateless and hook-free, so a server render is its test (coach-note.test.tsx).
import Link from 'next/link';
import { CORRECTIVES_PATH } from '@/lib/mirror/correctives';

/** The correctives page, with an optional section anchor (#band-drills, #release, #program) — nothing else. */
const CORRECTIVE_LINK = new RegExp(`${CORRECTIVES_PATH.replace(/[/]/g, '\\/')}(?:#[a-z-]+)?(?![\\w/#-])`);

/** The note split around its first correctives link, or null when it has none. */
export function splitCorrectiveLink(note: string): { before: string; href: string; after: string } | null {
  const m = CORRECTIVE_LINK.exec(note);
  if (!m) return null;
  return { before: note.slice(0, m.index), href: m[0], after: note.slice(m.index + m[0].length) };
}

export function CoachNote({ note }: { note: string }) {
  const parts = splitCorrectiveLink(note);
  return (
    <div className="text-xs text-[#00E5FF]/80" data-coach-note>
      Coach:{' '}
      {parts ? (
        <>
          {parts.before}
          <Link href={parts.href} data-corrective-link className="font-semibold underline decoration-[#00E5FF]/40 hover:text-[#00E5FF]">
            open it in the Mirror
          </Link>
          {parts.after}
        </>
      ) : note}
    </div>
  );
}
