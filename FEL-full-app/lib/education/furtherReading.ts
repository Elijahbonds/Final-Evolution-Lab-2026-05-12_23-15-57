// furtherReading — the one place FEL names a book it is not built from (MIRROR-COACH P9, 2026-09-30).
//
// OWNER DECISIONS #8 and #25 (DECISIONS.md, DECISIONS-2.md): FEL's movement taxonomy is the owner's Neuro-Mechanic
// Playbook; "Pain-Free Performance" (the book this pass was cross-referenced against) appears ONLY as further reading in
// Education, as a PLAIN CITATION — title, authors, publisher, year. No cover, no quotes, no link, no affiliate code, and
// it is framed as further reading, never as FEL's source. So this module holds the citation as data and nothing else: no
// URL field exists to fill, and further-reading.test.tsx holds the rendered block to exactly the citation (no <a>, no
// <img>, no quotation marks, no "source" or "based on" wording).
//
// Pure data. Rendered by components/education/further-reading.tsx under the Playbook course (app/education/playbook).

export interface BookCitation {
  title: string;
  /** As credited on the book. */
  authors: string;
  publisher: string;
  year: number;
}

export const FURTHER_READING: readonly BookCitation[] = [
  { title: 'Pain-Free Performance', authors: 'Dr. John Rusin with Glen Cordoza', publisher: 'Victory Belt Publishing', year: 2025 },
];

/** The heading the block carries. */
export const FURTHER_READING_HEADING = 'Further reading';
/** The one line of framing: further reading, and the course above is the Playbook's own. */
export const FURTHER_READING_NOTE = 'Listed as further reading. The course above is the Playbook’s own.';

/** One citation as a plain line: "Title, Authors, Publisher, Year." */
export function citationLine(c: BookCitation): string {
  return `${c.title}, ${c.authors}, ${c.publisher}, ${c.year}.`;
}
