// The Playbook's card on /education. EDU-LINKS (2026-10-07), Mirror & coaching plan Phase 5 (#17): /education taught
// only the game-mechanics tracks, and nothing on it said the movement course existed. This is the door: the course, and
// its quick cards in the Knowledge Feed. A server component — no state, no request.

import Link from 'next/link';
import { ArrowRight, BookOpen, Layers } from 'lucide-react';
import { CHAPTERS } from '@/lib/education/course';
import { LEARN_PATH, PLAYBOOK_PATH } from '@/lib/education/links';

export function PlaybookCard() {
  return (
    <section data-playbook-card className="mx-auto max-w-[900px] px-4 pt-6">
      <div className="rounded-2xl border border-[#00FF9D]/25 bg-[#00FF9D]/[0.04] p-5" style={{ borderTop: '2px solid #00FF9D' }}>
        <div className="flex items-start gap-3">
          <BookOpen aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-[#00FF9D]" />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#00FF9D]">The Playbook</p>
            <h2 className="fel-heading mt-1 text-xl font-bold leading-tight text-white">How the body actually moves</h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/60">
              {CHAPTERS.length} chapters from The Neuro-Mechanic Playbook: the joints, the jump, the landing, the reset.
              Read a chapter, then check the movement on camera.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Link
            href={PLAYBOOK_PATH}
            data-playbook-open
            className="inline-flex items-center gap-2 rounded-xl bg-[#00FF9D] px-4 py-2.5 text-[13.5px] font-bold text-[#050505]"
          >
            Open the Playbook <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
          <Link
            href={LEARN_PATH}
            prefetch={false}
            data-playbook-feed
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-[13.5px] font-bold text-white/75 hover:border-white/30 hover:text-white"
          >
            <Layers aria-hidden className="h-4 w-4" /> Quick cards in the Knowledge Feed
          </Link>
        </div>
      </div>
    </section>
  );
}
