// FurtherReading — a plain citation under the Playbook course (MIRROR-COACH P9, 2026-09-30; owner decisions #8, #25).
//
// Title, authors, publisher, year — nothing else: no cover image, no quotes, no link, no affiliate code, and framed as
// further reading, never as FEL's source (the course is the owner's Neuro-Mechanic Playbook). lib/education/
// furtherReading.ts holds the data; further-reading.test.tsx holds this markup to it. Hook-free, so it renders on the
// server with the page.
import { FURTHER_READING, FURTHER_READING_HEADING, FURTHER_READING_NOTE, citationLine } from '@/lib/education/furtherReading';

export function FurtherReading() {
  return (
    <section aria-labelledby="further-reading-h" data-further-reading className="mt-8 border-t border-white/[0.06] pt-5">
      <h2 id="further-reading-h" className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
        {FURTHER_READING_HEADING}
      </h2>
      <ul className="mt-2 space-y-1 text-[13px] leading-relaxed text-white/60">
        {FURTHER_READING.map((c) => <li key={c.title}>{citationLine(c)}</li>)}
      </ul>
      <p className="mt-1.5 text-[12px] leading-relaxed text-white/35">{FURTHER_READING_NOTE}</p>
    </section>
  );
}
