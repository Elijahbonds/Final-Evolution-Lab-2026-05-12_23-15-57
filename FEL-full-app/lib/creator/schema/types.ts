// THE CHARACTER CREATOR IS A SCHEMA, NOT A SCREEN (2026-09-14).
//
// The spec's own acceptance test for this layer: "add a new trait and a new attribute purely by editing
// data tables. If that requires touching engine or UI code, the abstraction isn't done yet." Everything in
// this folder exists so that sentence is true — the rows are data, the editor is one component that reads
// them, and the validator walks them without knowing what any particular row means.
//
// Nothing here imports Babylon, React or the DOM. A schema that needs a renderer to be inspected cannot be
// unit-tested, and this is the layer every other one is validated against.

/** Which editor screen a row belongs to. One tab strip per section, driven off these. */
export type CreatorSection =
  | 'vitals' | 'appearance' | 'body' | 'ink' | 'gear' | 'accessories'
  | 'attributes' | 'tendencies' | 'hotZones' | 'mechanics' | 'traits';

/** Every row the generic editor can render, whatever section it came from. */
export interface SchemaRow {
  id: string;
  label: string;
  section: CreatorSection;
  /** Tab within the section — the tab strip is derived from the distinct values, in first-seen order. */
  tab: string;
  /** Tooltip / glossary modal text. The spec requires EVERY row to carry one. */
  glossary: string;
}

/** A 0–99 integer row: attributes and tendencies share this shape exactly. */
export interface RatedRow extends SchemaRow {
  kind: 'rated';
  min: number;
  max: number;
  /**
   * Printed straight after the number, or absent for a bare rating.
   *
   * Data rather than a rule in the component: a Vitals row is a percent of a standard frame and an
   * attribute is a 0–99 rating, and the editor must not be the thing that knows the difference.
   */
  suffix?: string;
  /**
   * What the row reads as before anybody touches it. Defaults to `min`.
   *
   * Needed the moment a rated row's neutral value is not its floor: a Vitals height of 88% is the shortest
   * frame in the game, and an untouched creator opening on it would hand every player who never visited
   * the section a body they did not choose.
   */
  defaultValue?: number;
  /**
   * The PRQ axis that CAPS this row, or null when nothing measured should limit it.
   *
   * OWNER DECISION (2026-09-14): **PRQ sets the ceiling; the editor spends underneath it.** Training in
   * the real world raises what a body attribute can reach, and the editor decides how the points are
   * distributed under that cap — so real work moves the number and a slider never claims you got faster.
   *
   * The split is principled rather than convenient: PRQ measures a BODY, so it caps body attributes
   * (speed, strength, vertical, stamina, agility) and has no business capping a jump shot, a post hook or
   * court vision. Those are skill, they are free, and `prqAxis: null` says so.
   */
  prqAxis: PrqAxisId | null;
}

/** The eight measured axes, from lib/prq.ts. Named here as a type so the tables cannot invent a ninth. */
export type PrqAxisId =
  | 'strength' | 'speed' | 'endurance' | 'agility' | 'power' | 'flexibility' | 'recovery' | 'mental';

/** A tiered trait: unequipped, then a ladder. */
export interface TraitRow extends SchemaRow {
  kind: 'trait';
  /** Tier names in order, index 0 = the first equipped tier. Unequipped is the absence of a tier. */
  tiers: readonly string[];
  /** Trait points each tier costs, cumulative index-for-index with `tiers`. */
  cost: readonly number[];
  /** Attribute id and minimum value required before this trait can be equipped at all. */
  requires: { attribute: string; min: number } | null;
  /** What it actually does in the game, per tier — surfaced by the Trait Glossary modal. */
  tierText: readonly string[];
  /**
   * The existing gameplay hook this trait scales.
   *
   * The audit's finding, and it shapes the whole traits layer: most of these already exist as MECHANICS —
   * Deep Handle is `movesFor(handle)`, Breakdown Artist is `ankleBreakOdds`, Contest King is
   * `groundContest`, Airspace Denial is `aiBlockChance`. A trait is a tiered multiplier over a hook that
   * is already in the game, never a new system, or the roster grows forty-five new code paths.
   */
  hook: string;
}

/** An animation-slot row: a named set, "standard", or nothing. */
export interface SlotRow extends SchemaRow {
  kind: 'slot';
  /** Ids of the FEL motion sets this slot accepts. Never a real athlete's name. */
  options: readonly string[];
  /** May the slot be left empty? Dunk packages 2–5 may; a jump-shot base may not. */
  allowNone: boolean;
  /**
   * What an untouched row reads as, when that is not the first option.
   *
   * Caught on the running page: a required slot with nothing stored was showing its first option, which is
   * right for a jump-shot base and WRONG for a hot zone, where the first option is FRIGID and the rest of
   * the system treats an untouched zone as NEUTRAL. The screen would have been telling a player their
   * whole court was ice-cold while the resolver scored it neutral. The default belongs to whichever
   * module owns the concept — `ZONE_DEFAULT`, `defaultFace()`, `defaultEquipped()` — and is passed in
   * from there rather than inferred from array order.
   */
  defaultOption?: string;
  /** Gate: this slot only offers its options when the attribute clears the minimum. */
  requires: { attribute: string; min: number } | null;
}

export type AnyRow = RatedRow | TraitRow | SlotRow;

/** A whole section's table. The tab strip, the row list and the filter all derive from this. */
export interface SectionTable<T extends AnyRow = AnyRow> {
  section: CreatorSection;
  title: string;
  rows: readonly T[];
}

/** Distinct tabs in first-seen order — the tab strip, derived rather than declared. */
export function tabsOf(table: SectionTable): string[] {
  const seen: string[] = [];
  for (const r of table.rows) if (!seen.includes(r.tab)) seen.push(r.tab);
  return seen;
}

/** The rows on one tab, in table order. */
export function rowsOfTab(table: SectionTable, tab: string): AnyRow[] {
  return table.rows.filter((r) => r.tab === tab);
}
