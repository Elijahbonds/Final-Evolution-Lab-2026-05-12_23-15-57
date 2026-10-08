// DunkOriginality — THE JUDGES AND THE BUILDING REWARD A NEW IDEA (dunk-next phase 2, 2026-10-06).
//
// A real contest is four dunks and four ideas: the panel pays the dunk nobody has seen, and the building loses its mind for it.
// Before this the judges remembered one exact string per dunker — `style_prop_tricks` — so a windmill over the car and a windmill
// off a self-lob were two "fresh" dunks, the rival's own dunk thrown straight back at him was fresh, and a new idea earned +0.5
// difficulty that saturated and nobody ever saw (docs/DUNK-NEXT.md §1 row 3).
//
// Now every made dunk is broken into ELEMENTS — its air tricks, its chain, what it did on the runway, the prop, the foot, where it
// left the floor, the side it came from, the rim hang — and the night remembers WHO SHOWED EACH ONE FIRST. A dunk is read against
// that memory:
//   FRESH     — nobody has shown it tonight. A showpiece (a trick, a chain, a runway move, a prop, a parkour launch) pays the most;
//               a touch (the foot, the range, the side, the hang) pays a little. Paid as STYLE, capped.
//   COPIED    — the OTHER dunker showed it first. It pays nothing, the banner says whose it was, and a dunk whose every showpiece is
//               copied is read as SEEN IT — the panel's existing repeat rule — because that is what a judge calls it.
//   OWN       — you showed it already. It pays nothing new (the exact-repeat rule still applies on top, unchanged).
//
// Only a MADE dunk shows the building anything: a miss you retry is still a surprise when it goes down. Pure: no Babylon.

/** Who showed it: 'player', 'rival', or (dunk-next phase 5, the four-dunker field) any dunker's own id — the night tells them apart. */
export type Dunker = 'player' | 'rival' | (string & Record<never, never>);
export type ElementKind = 'trick' | 'chain' | 'runway' | 'prop' | 'launch' | 'foot' | 'range' | 'side' | 'hang';
export interface DunkElement { kind: ElementKind; key: string; label: string }

/** The showpieces — what a dunk is ABOUT. The rest are touches. */
export const SHOWPIECE: ReadonlySet<ElementKind> = new Set(['trick', 'chain', 'runway', 'prop', 'launch']);
/** How much each kind of element counts: a trick or a chain is the idea, a runway move or a prop the setting, a touch a detail. */
export const ELEMENT_WEIGHT: Readonly<Record<ElementKind, number>> = { trick: 3, chain: 3, runway: 2, prop: 2, launch: 2, foot: 1, range: 1, side: 1, hang: 1 };

/** TUNED (dunk-next phase 2): style per weight of a fresh showpiece, per fresh touch, and the most freshness can pay (0–10 scale). */
export const FRESH_SHOW_STYLE = 0.3, FRESH_TOUCH_STYLE = 0.15, FRESH_STYLE_MAX = 1.5;

export interface DunkFacts {
  tricks: readonly { id: string; label: string }[];
  /** Everything thrown or ridden on the runway (the runway tricks, the sky tap, the board run, the bus …), by its label. */
  runway: readonly string[];
  /** The prop the dunk used, or null for none. */
  prop: { id: string; label: string } | null;
  /** A parkour launch (a rebound or a wall run off a corner prop), or ''. */
  launch?: string;
  foot: 'one' | 'two';
  /** DunkApproach.rangeLabel: UNDER THE RIM / IN THE PAINT / FROM THE ELBOW / FROM THE STRIPE. */
  range: string;
  /** HEAD-ON / WING / BASELINE. */
  side: string;
  hang: boolean;
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** A dunk, as the judges remember it. */
export function dunkElements(f: DunkFacts): DunkElement[] {
  const out: DunkElement[] = [];
  for (const t of f.tricks) out.push({ kind: 'trick', key: `trick:${t.id}`, label: t.label });
  if (f.tricks.length >= 2) out.push({ kind: 'chain', key: `chain:${f.tricks.map((t) => t.id).join('>')}`, label: f.tricks.map((t) => t.label).join(' → ') });
  for (const r of f.runway) if (r) out.push({ kind: 'runway', key: `runway:${slug(r)}`, label: r });
  if (f.prop && f.prop.id !== 'none') out.push({ kind: 'prop', key: `prop:${f.prop.id}`, label: f.prop.label });
  if (f.launch) out.push({ kind: 'launch', key: `launch:${slug(f.launch)}`, label: f.launch });
  out.push({ kind: 'foot', key: `foot:${f.foot}`, label: f.foot === 'one' ? 'ONE-FOOT' : 'TWO-FOOT' });
  if (f.range) out.push({ kind: 'range', key: `range:${slug(f.range)}`, label: f.range });
  if (f.side) out.push({ kind: 'side', key: `side:${slug(f.side)}`, label: f.side });
  if (f.hang) out.push({ kind: 'hang', key: 'hang', label: 'RIM HANG' });
  // one of each: a doubled runway label (two kick-ups) is one idea
  return out.filter((e, i) => out.findIndex((x) => x.key === e.key) === i);
}

export interface OriginalityRead {
  fresh: DunkElement[];
  copied: DunkElement[];
  own: DunkElement[];
  /** 0..1: the share of this dunk's weight nobody had shown tonight. */
  freshness01: number;
  /** Style the panel adds (≤ FRESH_STYLE_MAX). */
  style: number;
  /** Every showpiece of this dunk was shown first by the other dunker (and it had at least one): the panel calls it SEEN. */
  copiedWhole: boolean;
}

export class NightMemory {
  private first = new Map<string, Dunker>();

  /** A new night: nothing has been shown. */
  reset(): void { this.first.clear(); }
  /** Has anybody shown this element tonight? */
  shown(key: string): boolean { return this.first.has(key); }
  /** Who showed it first, if anybody. */
  firstBy(key: string): Dunker | null { return this.first.get(key) ?? null; }
  get size(): number { return this.first.size; }

  /** Read a dunk against the night, without remembering it. */
  read(elements: readonly DunkElement[], by: Dunker): OriginalityRead {
    const fresh: DunkElement[] = [], copied: DunkElement[] = [], own: DunkElement[] = [];
    for (const e of elements) {
      const who = this.first.get(e.key);
      if (!who) fresh.push(e); else if (who === by) own.push(e); else copied.push(e);
    }
    const w = (es: readonly DunkElement[]) => es.reduce((s, e) => s + ELEMENT_WEIGHT[e.kind], 0);
    const total = w(elements);
    const freshness01 = total > 0 ? w(fresh) / total : 0;
    const showFresh = w(fresh.filter((e) => SHOWPIECE.has(e.kind)));
    const touchFresh = fresh.filter((e) => !SHOWPIECE.has(e.kind)).length;
    const style = Math.min(FRESH_STYLE_MAX, showFresh * FRESH_SHOW_STYLE + touchFresh * FRESH_TOUCH_STYLE);
    const shows = elements.filter((e) => SHOWPIECE.has(e.kind));
    const copiedWhole = shows.length > 0 && shows.every((e) => this.first.get(e.key) && this.first.get(e.key) !== by);
    return { fresh, copied, own, freshness01, style, copiedWhole };
  }

  /** A made dunk shows the building what it did: every element not already shown is now `by`'s. */
  show(elements: readonly DunkElement[], by: Dunker): void {
    for (const e of elements) if (!this.first.has(e.key)) this.first.set(e.key, by);
  }
}

/** The banner's words for a read: the fresh showpieces (two at most), or whose a copied dunk was. '' when there is nothing to say. */
export function originalityLine(r: OriginalityRead, otherName: string): string {
  if (r.copiedWhole) return `${otherName} DID THAT FIRST`;
  const shows = r.fresh.filter((e) => SHOWPIECE.has(e.kind) && e.kind !== 'chain');
  if (!shows.length) return r.copied.some((e) => SHOWPIECE.has(e.kind)) ? `${otherName} DID THE ${r.copied.find((e) => SHOWPIECE.has(e.kind))!.label} FIRST` : '';
  return `FIRST TIME TONIGHT: ${shows.slice(0, 2).map((e) => e.label).join(' · ')}`;
}

/** The standing tip that names what the night has not seen yet: `pool` is the air vocabulary (id + label). */
export function freshTip(memory: NightMemory, pool: readonly { id: string; label: string }[], max = 3): string {
  const left = pool.filter((t) => !memory.shown(`trick:${t.id}`));
  if (!left.length) return 'EVERY TRICK HAS BEEN SHOWN TONIGHT — THE PANEL WANTS A NEW CHAIN, A NEW PROP, A NEW SPOT';
  return `FRESH TONIGHT — ${left.length} of ${pool.length} tricks nobody has shown: ${left.slice(0, max).map((t) => t.label).join(' · ')}${left.length > max ? ' …' : ''}`;
}
