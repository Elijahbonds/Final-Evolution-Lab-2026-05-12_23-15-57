// DunkField — the four-dunker night: a first round, a cut to two, a final (dunk-next phase 5, 2026-10-06).
//
// Owner, 2026-10-06: "a contest night with four dunkers (you + three of the five rival bodies), a first round, a cut to two, a final, and
// the dunk-off". The night was you against one rival over two rounds of two (docs/DUNK-NEXT.md §1 row 6), although five rival bodies
// exist; the real event and its video-game benchmark are a FIELD, and the drama is the cut line.
//
// THE NIGHT:
//   · FIRST ROUND — four dunkers, two dunks each: you, then the rival on the floor (live, skippable to his card — phase 4), then two more
//     shown as broadcast HIGHLIGHTS (their dunks judged by core/DunkRivalSim, the same panel and rules; their names on the standings).
//   · THE CUT — the top two go to the final. Level at the cut line: the best single dunk, then the later dunk (the last impression), then
//     the draw order (who dunked first) — the field is always a strict order, so a cut never needs a rule nobody saw.
//   · THE FINAL — the two finalists, two dunks each, on their NIGHT totals (the first round carries: the number on the board is the
//     number on your card). Level → the dunk-off (ContinuousNight, endless). If you were cut, the final is shown as highlights and
//     the night card says who won it.
//
// ARENA INTEGRITY. The staked score is still the player's own card total, and the card still holds at most four judged dunks
// (2 rounds × 2: arena-score-integrity's MIRRORED.dunkRounds × dunksPerRound — the cap is untouched). A cut night's card holds TWO.
// That is within every integrity check, but it changes what a night's card can hold, so it is written up as an OWNER DECISION
// (docs/DUNK-NEXT.md, phase 5) rather than decided here.
//
// Pure: no Babylon, no randomness (the mode's sims are injected).
import { DUNK_RIVALS, type DunkRival } from './DunkRivals';
import type { RivalSituation } from './RivalNerve';
import { DUNK_OFF_CAP } from './ContinuousNight';

/** The dunkers in a night, and how many go through to the final. */
export const FIELD_SIZE = 4;
export const FINALISTS = 2;
export const PLAYER_ID = 'player';

export type FieldKind = 'player' | 'live' | 'highlight';
export interface FieldDunker {
  id: string;
  name: string;
  /** you, the rival on the floor, or a broadcast highlight */
  kind: FieldKind;
  /** every judged dunk tonight, first round and final (never a dunk-off) */
  cards: number[];
  /** the draw: who dunks first (0 = first) */
  order: number;
}

/** The two highlight dunkers for a night whose live rival is `foe`: the next two in the roster after him (the roster walks — every
 *  night a different floor, and over five nights everybody is on the floor once). */
export function fieldFor(foe: DunkRival, roster: readonly DunkRival[] = DUNK_RIVALS): DunkRival[] {
  const i = roster.findIndex((r) => r.id === foe.id);
  const out: DunkRival[] = [];
  for (let k = 1; out.length < FIELD_SIZE - 2 && k < roster.length; k++) out.push(roster[(Math.max(0, i) + k) % roster.length]);
  return out.filter((r) => r.id !== foe.id);
}

/** A new night's field: you, the live rival, the two highlights — in dunking order. */
export function newField(foe: DunkRival, roster: readonly DunkRival[] = DUNK_RIVALS): FieldDunker[] {
  return [
    { id: PLAYER_ID, name: 'YOU', kind: 'player', cards: [], order: 0 },
    { id: foe.id, name: foe.name, kind: 'live', cards: [], order: 1 },
    ...fieldFor(foe, roster).map((r, k): FieldDunker => ({ id: r.id, name: r.name, kind: 'highlight', cards: [], order: 2 + k })),
  ];
}

export const fieldTotal = (d: Pick<FieldDunker, 'cards'>): number => d.cards.reduce((a, c) => a + c, 0);
export const fieldBest = (d: Pick<FieldDunker, 'cards'>): number => d.cards.reduce((a, c) => Math.max(a, c), 0);
const lastCard = (d: FieldDunker): number => (d.cards.length ? d.cards[d.cards.length - 1] : 0);

/** The standings, best first: the total, then the best single dunk, then the later dunk, then the draw. A strict order. */
export function standings(field: readonly FieldDunker[]): FieldDunker[] {
  return [...field].sort((a, b) => fieldTotal(b) - fieldTotal(a) || fieldBest(b) - fieldBest(a) || lastCard(b) - lastCard(a) || a.order - b.order);
}

/** How a place was decided against the dunker just below it (for the cut banner): '' when the totals did it. */
export function cutTiebreak(field: readonly FieldDunker[], n: number = FINALISTS): string {
  const s = standings(field);
  const a = s[n - 1], b = s[n];
  if (!a || !b || fieldTotal(a) !== fieldTotal(b)) return '';
  return fieldBest(a) !== fieldBest(b) ? 'LEVEL AT THE LINE — THE BEST DUNK TAKES IT' : lastCard(a) !== lastCard(b) ? 'LEVEL AT THE LINE — THE LAST DUNK TAKES IT' : 'LEVEL AT THE LINE — THE DRAW TAKES IT';
}

/** THE CUT: the top `n` go through. */
export function cutField(field: readonly FieldDunker[], n: number = FINALISTS): { through: FieldDunker[]; out: FieldDunker[] } {
  const s = standings(field);
  return { through: s.slice(0, n), out: s.slice(n) };
}

/** 1-based place of `id` in the standings (0 when not in the field). */
export function placeOf(field: readonly FieldDunker[], id: string): number {
  return standings(field).findIndex((d) => d.id === id) + 1;
}

/** Book a judged dunk to a dunker (a new field — the caller's is never mutated). */
export function bookCard(field: readonly FieldDunker[], id: string, total: number): FieldDunker[] {
  return field.map((d) => (d.id === id ? { ...d, cards: [...d.cards, total] } : d));
}

/** What a HIGHLIGHT dunker's nerve reads in the first round: his total against the cut line among the others (the total he must pass
 *  to be in the top two), with his dunks left. Before anyone has dunked he is level. */
export function highlightSituation(field: readonly FieldDunker[], id: string, dunksLeft: number, playerPace: number): RivalSituation {
  const me = field.find((d) => d.id === id);
  const others = standings(field.filter((d) => d.id !== id));
  const line = others[FINALISTS - 1] ?? others[others.length - 1];
  return { deficit: (me ? fieldTotal(me) : 0) - (line ? fieldTotal(line) : 0), isFinalRound: false, attemptsLeft: Math.max(1, dunksLeft), playerPace };
}

/**
 * A final the player is not in, shown as highlights: each finalist dunks `dunks` times (in the draw's order), the night totals decide,
 * a level one goes to dunk-offs (one dunk each, never added to the totals) until somebody wins, and the safety cap (ContinuousNight's
 * DUNK_OFF_CAP) settles a dead-level one on the best dunk of the night, then the draw. `dunk(id)` is the injected judged dunk.
 */
export function simFinal(
  field: readonly FieldDunker[], ids: readonly [string, string], dunk: (id: string, situation: RivalSituation) => number, dunks = 2,
): { field: FieldDunker[]; winner: string; offs: number; offCards: [number, number] } {
  let f = [...field];
  const [a, b] = [...ids].sort((x, y) => (f.find((d) => d.id === x)?.order ?? 0) - (f.find((d) => d.id === y)?.order ?? 0)) as [string, string];
  const tot = (id: string): number => fieldTotal(f.find((d) => d.id === id) ?? { cards: [] });
  for (let k = 0; k < dunks; k++) {
    for (const id of [a, b]) {
      const other = id === a ? b : a;
      f = bookCard(f, id, dunk(id, { deficit: tot(id) - tot(other), isFinalRound: true, attemptsLeft: dunks - k, playerPace: 0 }));
    }
  }
  if (tot(a) !== tot(b)) return { field: f, winner: tot(a) > tot(b) ? a : b, offs: 0, offCards: [0, 0] };
  let offs = 0, ca = 0, cb = 0, bestA = fieldBest(f.find((d) => d.id === a)!), bestB = fieldBest(f.find((d) => d.id === b)!);
  while (offs < DUNK_OFF_CAP) {
    offs++;
    ca = dunk(a, { deficit: 0, isFinalRound: true, attemptsLeft: 1, playerPace: 0 });
    cb = dunk(b, { deficit: ca ? -ca : 0, isFinalRound: true, attemptsLeft: 1, playerPace: 0 });
    bestA = Math.max(bestA, ca); bestB = Math.max(bestB, cb);
    if (ca !== cb) return { field: f, winner: ca > cb ? a : b, offs, offCards: [ca, cb] };
  }
  return { field: f, winner: bestA !== bestB ? (bestA > bestB ? a : b) : a, offs, offCards: [ca, cb] };
}

// ── THE STANDINGS ON THE WIRE ───────────────────────────────────────────────────────────────────────────────────────────
// The HUD carries strings (ModeHarness.HudValue is another lane's shared type), so the standings ride as one string the host decodes.

export type FieldRowState = 'in' | 'through' | 'out' | 'champ';
export interface FieldRow { name: string; total: number; kind: FieldKind; state: FieldRowState }

/** `stage`: 'round1' (everyone in), 'cut' / 'final' (through and out marked), or 'done' with the champion's id. */
export function encodeField(field: readonly FieldDunker[], stage: 'round1' | 'cut' | 'final' | 'done', champ = ''): string {
  if (!field.length) return '';
  const through = new Set(stage === 'round1' ? [] : cutField(field.map((d) => ({ ...d, cards: d.cards.slice(0, 2) }))).through.map((d) => d.id));
  const rows = standings(field).map((d) => {
    const state: FieldRowState = d.id === champ ? 'champ' : stage === 'round1' ? 'in' : through.has(d.id) ? 'through' : 'out';
    return [d.name.replace(/[|;]/g, ''), fieldTotal(d), d.kind, state].join('|');
  });
  return `${stage};${rows.join(';')}`;
}

export function decodeField(v: unknown): { stage: string; rows: FieldRow[] } | null {
  if (typeof v !== 'string' || !v) return null;
  const [stage, ...parts] = v.split(';');
  const rows: FieldRow[] = [];
  for (const p of parts) {
    const [name, total, kind, state] = p.split('|');
    if (!name) continue;
    rows.push({ name, total: Number(total) || 0, kind: (kind === 'player' || kind === 'live' ? kind : 'highlight'), state: (state === 'through' || state === 'out' || state === 'champ' ? state : 'in') });
  }
  return rows.length ? { stage, rows } : null;
}
