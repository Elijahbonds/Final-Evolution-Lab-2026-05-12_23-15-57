// AuthorStudio — the Cell/Nexus-assisted book authoring engine (M60).
// Encodes the requested authoring approach as a reusable template: a
// 20-chapter bestseller-structured arc, with per-chapter beat prompts.
// What's REAL here: the structural outline generator (a genuine local
// generator producing a coherent 20-chapter skeleton for any topic) and
// the chapter workspace contract. The marked CELL SEAM is where a real
// Cell/Nexus LLM call drafts prose per chapter — same input/output shape,
// swap the internals when the LLM wiring exists. Shards gating matches the
// studio's pattern (generation costs Shards; editing your own words is
// always free).

export const OUTLINE_COST_SHARDS = 100;
export const CHAPTER_DRAFT_COST_SHARDS = 40;

/** The 20-chapter bestseller arc — acts and the job of every chapter. */
export const BOOK_TEMPLATE: { act: string; beats: string[] }[] = [
  {
    act: 'ACT I — THE HOOK (ch 1-5)',
    beats: [
      'Open inside the problem — a scene, not a lecture. Make the pain concrete.',
      'The promise: what changes for the reader by the last page. Stakes, stated.',
      'Why now — the cost of waiting, the myth that keeps people stuck.',
      'Your credibility story — the moment you earned the right to write this.',
      'The framework overview — name the method, map the journey ahead.',
    ],
  },
  {
    act: 'ACT II — THE CLIMB (ch 6-13)',
    beats: [
      'Principle 1, taught through a story first, mechanics second.',
      'Principle 1 applied — a walkthrough the reader can copy today.',
      'Principle 2 — the counterintuitive one. Lead with the surprise.',
      'Principle 2 applied — include the most common failure and its fix.',
      'Principle 3 — the multiplier that makes 1 and 2 compound.',
      'Principle 3 applied — a before/after case with real numbers.',
      'The valley chapter — what going wrong looks like; how to diagnose it.',
      'The turn — the mindset shift that separates finishers from quitters.',
    ],
  },
  {
    act: 'ACT III — THE PAYOFF (ch 14-20)',
    beats: [
      'The full system assembled — one page the reader could frame.',
      'Advanced play — what the top 1% do differently with the same system.',
      'Objections, answered honestly — including when this WON\'T work.',
      'The 30-day plan — day-by-day, zero ambiguity.',
      'The 90-day horizon — milestones and how to measure them.',
      'The identity chapter — who the reader becomes, not just what they do.',
      'The send-off — return to chapter 1\'s scene, transformed. Final charge.',
    ],
  },
];

export interface ChapterDraft { title: string; beat: string; text: string }
export interface BookOutline { topic: string; chapters: ChapterDraft[] }

/** REAL local generation: a coherent 20-chapter skeleton for any topic —
 *  titles from the beat structure + topic phrasing. Costs OUTLINE_COST. */
export function draftOutline(topic: string, seed = Date.now()): BookOutline {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const t = topic.trim() || 'the craft';
  const titleBanks = [
    [`The ${cap(t)} Problem`, `Everything They Told You About ${cap(t)} Is Half-True`, `Where ${cap(t)} Actually Starts`],
    [`The Promise`, `What ${cap(t)} Makes Possible`, `The Other Side of the Work`],
    [`Why Now`, `The Cost of Waiting`, `The Myth Holding You Still`],
    [`How I Learned This`, `Scar Tissue`, `The Day It Clicked`],
    [`The Method, Mapped`, `The Whole Journey on One Page`, `Your Route Through ${cap(t)}`],
  ];
  const chapters: ChapterDraft[] = [];
  let beatIdx = 0;
  for (const act of BOOK_TEMPLATE) {
    for (const beat of act.beats) {
      const bank = titleBanks[beatIdx] ?? [
        `${cap(t)}: Step ${beatIdx + 1}`, `The ${ordinal(beatIdx + 1)} Move`, `Deeper Into ${cap(t)}`,
      ];
      chapters.push({ title: bank[Math.floor(rnd() * bank.length)], beat, text: '' });
      beatIdx++;
    }
  }
  return { topic: t, chapters };
}

/** CELL SEAM — drafting prose for one chapter. Today: a structured scaffold
 *  the author fills (never fake prose passed off as finished writing).
 *  A real Cell/Nexus call replaces the body: same signature, same cost. */
export function draftChapterScaffold(outline: BookOutline, index: number): string {
  const ch = outline.chapters[index];
  if (!ch) return '';
  return [
    `[${ch.title}]`, '',
    `BEAT: ${ch.beat}`, '',
    'OPENING SCENE — put the reader somewhere specific:', '…', '',
    'THE POINT — one sentence, no hedging:', '…', '',
    'THE EVIDENCE — story, example, or numbers:', '…', '',
    'THE PRACTICE — what the reader does before the next chapter:', '…',
  ].join('\n');
}

const cap = (x: string): string => x.charAt(0).toUpperCase() + x.slice(1);
const ordinal = (n: number): string => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
};
