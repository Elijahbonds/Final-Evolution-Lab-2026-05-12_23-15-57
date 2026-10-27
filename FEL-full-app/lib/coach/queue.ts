// lib/coach/queue.ts — PLATFORM PHASE 5 (2026-10-27): "Needs you today", the coach's one ordered list.
//
// It MERGES what the app already decides; it never re-decides it. Every source keeps its own rules and gates:
//   pain        GET /api/coach/attention painFlags (lib/health/pain.ts coachPainFlag: consent decides the detail)
//   red_flag    GET /api/coach/attention readiness, level 'low' (lib/health/readiness.ts: coach_view grants only)
//   draft       GET /api/coach/drafts (lib/coach/weeklyDraft: teen gate, safety classes, approvals behind the SQL)
//   review      lib/coach/formReview coachQueue (the unreviewed sets, flags and presets are cue-rewrite's words)
//   missed      GET /api/coach/attention alerts, 'stalled' or 'missed' (lib/coach/alerts.ts: 2 planned in 7 days)
//   checkin     lib/coach/checkins answers this week ("answered", never the answers: those stay on the form's page)
//   message     lib/coach/messageReads unreadCounts (threads where this user is the COACH)
//   join        CoachClient rows from the last 7 days
//
// THE ORDER (the brief's): safety first, then decisions waiting on the coach, then drift, then messages and joins.
// Ties go by age, oldest first (the one waiting longest). One card per athlete per kind (dedupe), keeping the oldest.
//
// Pure: source rows in, cards out. The reads, and the teen gate over every card, are lib/coach/queueServer.ts.

export type QueueKind = 'pain' | 'red_flag' | 'draft' | 'review' | 'missed' | 'checkin' | 'message' | 'join';

/** Safety, then decisions, then drift, then messages and joins. The index is the tier. */
export const QUEUE_ORDER: readonly QueueKind[] = ['pain', 'red_flag', 'draft', 'review', 'missed', 'checkin', 'message', 'join'];

/** Health data: these cards exist only for a verified adult (teens fail closed until OWN-03, and health stays adults-only). */
export const HEALTH_KINDS: ReadonlySet<QueueKind> = new Set<QueueKind>(['pain', 'red_flag']);

/**
 * What a card's buttons do, each through a route that already exists:
 *   approve     POST /api/coach/drafts/approve-safe { draftId }   (only the SAFE changes; a review change stays for the coach)
 *   reply       a preset (or, to an adult, a short text) posted to the program thread: POST /api/coach/messages
 *   cue         a form-review preset cue: POST /api/coach/form-reviews/[id]/reply { cueId }
 *   looks_good  the set marked reviewed with no message: POST /api/coach/form-reviews/[id]/reply { markOnly: true }
 *   nudge       the kind's one preset, sent in one tap: POST /api/coach/messages
 *   open        the athlete sheet (this week, numbers, thread, program)
 *   done        seen: hidden for today on this device (components/coach/coach-queue/done.ts), nothing sent
 */
export type QueueAction = 'approve' | 'reply' | 'cue' | 'looks_good' | 'nudge' | 'open' | 'done';

export interface QueuePreset { id: string; text: string }

export interface QueueCard {
  /** kind:athlete:stamp — the stamp changes when the source has something new, so "done" never hides a fresh event. */
  key: string;
  kind: QueueKind;
  athleteId: string;
  name: string;
  /** One line, a few words. Never a health detail beyond what the source already shows this coach. */
  line: string;
  /** When it happened (ms). Ties in a tier go oldest first. */
  at: number;
  /** The thread a reply or nudge goes to: the athlete's newest active program with this coach. */
  programId: string | null;
  /** The draft or the filmed set the card is about. */
  ref: string | null;
  /** At most two buttons: the one that resolves it, then a way in. */
  actions: [QueueAction] | [QueueAction, QueueAction];
  /** The presets the reply / cue sheet offers (the nudge sends presets[0]). */
  presets: QueuePreset[];
  /** Free text in the reply sheet: an adult only (no free text about minors; presets only to a teen's thread). */
  freeText: boolean;
}

// ── the source rows, as the sources already answer them ─────────────────────────────────────────────────────────

export interface PainSource { clientId: string; name: string; view: { present: boolean; detailed: boolean; label: string; items?: { createdAt: string }[] } }
export interface RedFlagSource { clientId: string; name: string; view: { date: string; level: string; label: string } | null }
export interface AlertSource { clientId: string; name: string; kind: string; line: string }
export interface DraftSource {
  draftId: string | null; clientId: string; name: string; status: string;
  changes: { id: string; safety: string }[]; decisions: Record<string, unknown>;
}
export interface ReviewSource {
  id: string; clientId: string; clientName: string; programId: string; exerciseName: string; status: string; createdAt: string;
  flags: readonly unknown[]; presets: QueuePreset[];
}
export interface CheckinSource { athleteId: string; name: string; formTitle: string; createdAt: string }
export interface MessageSource { programId: string; athleteId: string; name: string; unread: number; at: number }
export interface JoinSource { athleteId: string; name: string; joinedAt: number; hasProgram: boolean }

export interface QueueSources {
  pain?: readonly PainSource[];
  redFlags?: readonly RedFlagSource[];
  alerts?: readonly AlertSource[];
  drafts?: readonly DraftSource[];
  reviews?: readonly ReviewSource[];
  checkins?: readonly CheckinSource[];
  messages?: readonly MessageSource[];
  joins?: readonly JoinSource[];
}

export interface QueueContext {
  now: number;
  /** The athlete's newest active program with this coach (the thread), or null. */
  programOf: (athleteId: string) => string | null;
  /** True only for a verified adult: free text, and the health kinds. */
  adult: (athleteId: string) => boolean;
}

// ── the words (draft copy: the owner reviews it; none is a movement cue — those come from the form-review presets) ─

export const QUEUE_PRESETS: Record<'pain' | 'red_flag' | 'missed' | 'checkin' | 'message' | 'join', QueuePreset[]> = {
  pain: [{ id: 'pain:how', text: 'How is it feeling today?' }, { id: 'pain:swap', text: "Let's swap that one. I'll update your plan." }],
  red_flag: [{ id: 'red:easy', text: 'Take it easy today. Lighter is fine.' }, { id: 'red:sleep', text: 'Thanks for checking in. How did you sleep?' }],
  missed: [{ id: 'missed:fit', text: 'Missed you this week. Can you fit a session in?' }],
  checkin: [{ id: 'checkin:thanks', text: 'Thanks, got it.' }, { id: 'checkin:talk', text: "Thanks. Let's talk at your next session." }],
  message: [{ id: 'message:got', text: 'Got it, thanks!' }, { id: 'message:soon', text: "On it. I'll reply properly soon." }],
  join: [{ id: 'join:welcome', text: 'Welcome aboard! Your first plan is on the way.' }],
};

/** The words for a preset id, looked up — a request names a preset, the words come from here. */
export function queuePresetText(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  for (const list of Object.values(QUEUE_PRESETS)) { const p = list.find((x) => x.id === id); if (p) return p.text; }
  return null;
}

const DAY = 86_400_000;
const ms = (iso: string | null | undefined, fallback: number) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t : fallback; };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The card's buttons, given whether there is a thread to write to. */
function threadActions(primary: 'reply' | 'nudge', programId: string | null): QueueCard['actions'] {
  return programId ? [primary, 'open'] : ['open', 'done'];
}

/** Every source row as a card (before dedupe and order). */
export function cardsFrom(src: QueueSources, ctx: QueueContext): QueueCard[] {
  const out: QueueCard[] = [];
  const add = (c: Omit<QueueCard, 'key'> & { stamp: string | number }) => {
    const { stamp, ...card } = c;
    out.push({ ...card, key: `${card.kind}:${card.athleteId}:${stamp}` });
  };

  for (const p of src.pain ?? []) {
    if (!p.view.present) continue;
    const at = ms(p.view.items?.[0]?.createdAt, ctx.now);
    const programId = ctx.programOf(p.clientId);
    add({ kind: 'pain', athleteId: p.clientId, name: p.name, line: p.view.label, at, programId, ref: null, stamp: p.view.items?.[0]?.createdAt ?? p.view.label,
      actions: threadActions('reply', programId), presets: QUEUE_PRESETS.pain, freeText: ctx.adult(p.clientId) });
  }
  for (const r of src.redFlags ?? []) {
    if (!r.view || r.view.level !== 'low') continue;
    const programId = ctx.programOf(r.clientId);
    add({ kind: 'red_flag', athleteId: r.clientId, name: r.name, line: 'Running low today', at: ms(r.view.date, ctx.now), programId, ref: null, stamp: r.view.date,
      actions: threadActions('reply', programId), presets: QUEUE_PRESETS.red_flag, freeText: ctx.adult(r.clientId) });
  }
  for (const d of src.drafts ?? []) {
    if (!d.draftId) continue;   // the drafts tables are not there: nothing can be approved, so nothing waits on the coach
    const open = d.changes.filter((c) => !(c.id in d.decisions));
    if (!open.length) continue;
    const safe = open.filter((c) => c.safety === 'safe').length;
    add({ kind: 'draft', athleteId: d.clientId, name: d.name, line: safe === open.length ? `${plural(open.length, 'change')} to approve` : `${plural(open.length, 'change')} to check`,
      at: ctx.now, programId: ctx.programOf(d.clientId), ref: d.draftId, stamp: `${d.draftId}:${open.length}`,
      actions: safe ? ['approve', 'open'] : ['open', 'done'], presets: [], freeText: false });
  }
  for (const r of src.reviews ?? []) {
    if (r.status !== 'unreviewed') continue;
    add({ kind: 'review', athleteId: r.clientId, name: r.clientName, line: r.flags.length ? `${r.exerciseName}: ${plural(r.flags.length, 'flagged rep')}` : `${r.exerciseName}: a filmed set`,
      at: ms(r.createdAt, ctx.now), programId: r.programId, ref: r.id, stamp: r.id,
      actions: r.presets.length ? ['cue', 'looks_good'] : ['looks_good', 'open'], presets: r.presets.slice(0, 3), freeText: false });
  }
  for (const a of src.alerts ?? []) {
    if (a.kind !== 'missed' && a.kind !== 'stalled') continue;
    const programId = ctx.programOf(a.clientId);
    add({ kind: 'missed', athleteId: a.clientId, name: a.name, line: a.kind === 'stalled' ? 'No session in a while' : 'Missed 2 sessions this week',
      at: ctx.now, programId, ref: null, stamp: `${a.kind}:${Math.floor(ctx.now / DAY)}`,
      actions: threadActions('nudge', programId), presets: QUEUE_PRESETS.missed, freeText: ctx.adult(a.clientId) });
  }
  for (const c of src.checkins ?? []) {
    const programId = ctx.programOf(c.athleteId);
    add({ kind: 'checkin', athleteId: c.athleteId, name: c.name, line: `Answered ${c.formTitle}`, at: ms(c.createdAt, ctx.now), programId, ref: null, stamp: c.createdAt,
      actions: threadActions('reply', programId), presets: QUEUE_PRESETS.checkin, freeText: ctx.adult(c.athleteId) });
  }
  for (const m of src.messages ?? []) {
    if (m.unread <= 0) continue;
    add({ kind: 'message', athleteId: m.athleteId, name: m.name, line: plural(m.unread, 'new message'), at: m.at, programId: m.programId, ref: null, stamp: `${m.programId}:${m.at}`,
      actions: ['reply', 'open'], presets: QUEUE_PRESETS.message, freeText: ctx.adult(m.athleteId) });
  }
  for (const j of src.joins ?? []) {
    const programId = ctx.programOf(j.athleteId);
    add({ kind: 'join', athleteId: j.athleteId, name: j.name, line: j.hasProgram ? 'Joined your roster' : 'Joined: needs a program',
      at: j.joinedAt, programId, ref: null, stamp: j.joinedAt,
      actions: programId ? ['nudge', 'open'] : ['open', 'done'], presets: QUEUE_PRESETS.join, freeText: ctx.adult(j.athleteId) });
  }
  return out;
}

/** One card per athlete per kind: the oldest stays (it has waited longest); a review card keeps its own set. */
export function dedupeQueue(cards: readonly QueueCard[]): QueueCard[] {
  const best = new Map<string, QueueCard>();
  for (const c of cards) {
    const k = `${c.kind}:${c.athleteId}`;
    const have = best.get(k);
    if (!have || c.at < have.at) best.set(k, c);
  }
  return [...best.values()];
}

/** Safety first, then decisions, drift, messages and joins; ties oldest first, then by name (stable for a test). */
export function orderQueue(cards: readonly QueueCard[]): QueueCard[] {
  const tier = (k: QueueKind) => QUEUE_ORDER.indexOf(k);
  return [...cards].sort((a, b) => tier(a.kind) - tier(b.kind) || a.at - b.at || a.name.localeCompare(b.name));
}

/** The list a coach sees: every source's cards, deduped and ordered. */
export function buildQueue(src: QueueSources, ctx: QueueContext): QueueCard[] {
  return orderQueue(dedupeQueue(cardsFrom(src, ctx)));
}

/** The cards one gate result leaves: a teen who fails it is never on the list; a health card needs a verified adult. */
export function gateQueue(cards: readonly QueueCard[], gate: (athleteId: string) => 'adult' | 'teen' | null): QueueCard[] {
  return cards.filter((c) => {
    const band = gate(c.athleteId);
    if (!band) return false;
    if (HEALTH_KINDS.has(c.kind) && band !== 'adult') return false;
    return true;
  }).map((c) => (gate(c.athleteId) === 'adult' ? c : { ...c, freeText: false }));
}

/** The sources that are dark until the owner applies their SQL (OWN-01): named on one line, never "not set up yet". */
export type QueueSourceKey = 'drafts' | 'reviews' | 'checkins' | 'messages';
export const SOURCE_LABEL: Record<QueueSourceKey, string> = { drafts: 'drafts', reviews: 'form review', checkins: 'check-ins', messages: 'read receipts' };
