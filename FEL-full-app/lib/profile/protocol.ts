// PROTOCOL + PRQ GATING — one unlock rule, one evaluator, everywhere (2026-09-13).
//
// The brief, §3.2: "Protocols unlock dynamically based on PRQ thresholds. Example: a depth-drop module stays
// locked until ankle compliance and readiness score clear a set bar. Implement as a declarative rule on the
// protocol object, not scattered conditionals." And §8: "PRQ gating is implemented once and reused
// everywhere."
//
// The audit found this genuinely absent. `lib/progression/upgradeGate.ts` exists but gates on SUBSCRIPTION,
// not on readiness — a different question with a different answer.
//
// WHY DECLARATIVE MATTERS HERE MORE THAN USUAL. This gate decides whether somebody is shown a depth drop.
// Scattered `if (prq > 70 && ankle > 60)` across a dozen call sites is not a style problem in that context:
// it is a dozen places where a threshold can be typo'd, drift apart, or be forgotten entirely on a new
// surface, and the failure mode is prescribing a maximal-effort plyometric to someone the system knew was
// under-recovered. One rule on the object, one function that reads it.
//
// THE GATE FAILS CLOSED. No profile, no snapshot, a missing axis, a stale scan — every one of those LOCKS.
// A readiness gate that opens when it cannot tell is not a gate, and "we have no data" is much closer to
// "not today" than it is to "go ahead".
//
// AND IT IS NOT MEDICAL. A locked protocol says what has not cleared and by how much — a threshold and a
// number. It never says why a body is where it is, never names a condition, and never claims the protocol
// would cause harm. Enforced by the same clinical-language sweep the rest of this layer uses.
//
// Pure: no Prisma, no DOM.

import type { SharedProfile, PRQSnapshot } from './sharedProfile';
import { currentPRQ } from './sharedProfile';

/** One condition. `axis` is a PRQ axis key, or COMPOSITE for the 0–100 overall. */
export const COMPOSITE = '__composite__';

export interface Threshold {
  axis: string;
  /** Minimum value that clears it, 0..100. */
  min: number;
  /** Shown when it has not cleared. Says what to work on, never why the body is as it is. */
  label: string;
}

/**
 * A protocol's unlock rule, as DATA.
 *
 * `all` is the whole rule — every threshold must clear. There is deliberately no `any`, no nesting and no
 * expression language: a rule somebody has to parse in their head is a rule nobody audits, and this is the
 * object that decides whether a person is told to jump off a box.
 */
export interface UnlockRule {
  all: Threshold[];
  /** A scan older than this is not evidence of today's readiness. Omit for rules that are not time-sensitive. */
  maxScanAgeDays?: number;
}

export interface Protocol {
  key: string;
  title: string;
  /** What it trains, in movement terms. */
  summary: string;
  /** Minutes. */
  minutes: number;
  /** Null means never gated — the basics are always available. */
  unlock: UnlockRule | null;
  /** Who authored it. Platform protocols have no coach. */
  coachId?: string;
  /** Private protocols are visible only to the coach's own clients. */
  visibility: 'private' | 'published';
}

export interface GateResult {
  unlocked: boolean;
  /** Every threshold that has not cleared, with how far off it is. Empty when unlocked. */
  blocking: { axis: string; label: string; need: number; have: number | null; short: number }[];
  /** One line for the UI. Never a reason, only a requirement. */
  message: string;
}

/** How old a scan may be before it stops counting, when a rule does not say. */
export const DEFAULT_MAX_SCAN_AGE_DAYS = 14;

/**
 * THE GATE. One function, every surface.
 *
 * `now` is injected so this is testable and so two surfaces evaluating the same protocol in the same request
 * cannot disagree because a clock ticked between them.
 */
export function evaluateUnlock(
  protocol: Protocol, profile: SharedProfile | null, now: number = Date.now(),
): GateResult {
  if (!protocol.unlock) {
    return { unlocked: true, blocking: [], message: 'Available.' };
  }
  const snap = profile ? currentPRQ(profile) : null;
  if (!snap) {
    // fails closed: no scan is not a pass
    return {
      unlocked: false,
      blocking: protocol.unlock.all.map((t) => ({ axis: t.axis, label: t.label, need: t.min, have: null, short: t.min })),
      message: 'Run a System Scan to see whether this is open to you.',
    };
  }

  const maxAge = protocol.unlock.maxScanAgeDays ?? DEFAULT_MAX_SCAN_AGE_DAYS;
  if (isStale(snap, now, maxAge)) {
    return {
      unlocked: false,
      blocking: [],
      message: `Your last scan is more than ${maxAge} days old — scan again to open this.`,
    };
  }

  const blocking = protocol.unlock.all
    .map((t) => {
      const have = valueOf(snap, t.axis);
      return { axis: t.axis, label: t.label, need: t.min, have, short: Math.max(0, t.min - (have ?? 0)) };
    })
    .filter((b) => b.have === null || b.have < b.need);

  if (!blocking.length) return { unlocked: true, blocking: [], message: 'Open.' };

  const worst = blocking.reduce((a, b) => (b.short > a.short ? b : a));
  return {
    unlocked: false,
    blocking,
    // a requirement and a distance. Never a cause.
    message: `${worst.label} needs ${worst.need}; you're at ${worst.have ?? 0}.`,
  };
}

/** A missing axis reads as null, which the gate treats as "cannot tell", which locks. */
function valueOf(snap: PRQSnapshot, axis: string): number | null {
  if (axis === COMPOSITE) return snap.composite;
  const v = snap.axes[axis];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function isStale(snap: PRQSnapshot, now: number, maxAgeDays: number): boolean {
  const t = Date.parse(snap.at);
  if (!Number.isFinite(t)) return true;                   // an unreadable date is stale, not fresh
  return now - t > maxAgeDays * 24 * 60 * 60 * 1000;
}

/** Split a catalogue into what this athlete can do today and what they cannot. */
export function partition(
  protocols: readonly Protocol[], profile: SharedProfile | null, now: number = Date.now(),
): { open: Protocol[]; locked: { protocol: Protocol; gate: GateResult }[] } {
  const open: Protocol[] = [];
  const locked: { protocol: Protocol; gate: GateResult }[] = [];
  for (const p of protocols) {
    const gate = evaluateUnlock(p, profile, now);
    if (gate.unlocked) open.push(p); else locked.push({ protocol: p, gate });
  }
  return { open, locked };
}

/** Protocols a coach may assign to a client: their own private ones, plus everything published. */
export function assignable(protocols: readonly Protocol[], coachId: string): Protocol[] {
  return protocols.filter((p) => p.visibility === 'published' || p.coachId === coachId);
}

// ── the platform catalogue ───────────────────────────────────────────────────────────────────────────────
//
// The brief's own example is the depth drop, and it is the reason the gate exists: it is the highest-impact,
// highest-load thing in the catalogue and the one nobody should meet on a bad day.

export const PLATFORM_PROTOCOLS: readonly Protocol[] = [
  {
    key: 'breath_reset', title: 'Breathing reset', visibility: 'published', minutes: 6,
    summary: 'Rib position and a full exhale, before anything else asks for force.',
    unlock: null,                                    // never gated: the basics are always available
  },
  {
    key: 'ankle_prep', title: 'Ankle preparation', visibility: 'published', minutes: 8,
    summary: 'Loaded dorsiflexion and slow calf work — the ankle doing its own job before it is asked to absorb.',
    unlock: null,
  },
  {
    key: 'hinge_pattern', title: 'Hinge pattern', visibility: 'published', minutes: 10,
    summary: 'Hips leading, ribs stacked, under light load.',
    unlock: { all: [{ axis: COMPOSITE, min: 40, label: 'Overall readiness' }] },
  },
  {
    key: 'penultimate_step', title: 'Penultimate step', visibility: 'published', minutes: 12,
    summary: 'The second-to-last step that sets the plant — timing before height.',
    unlock: {
      all: [
        { axis: COMPOSITE, min: 55, label: 'Overall readiness' },
        { axis: 'agility', min: 50, label: 'Agility' },
      ],
    },
  },
  {
    key: 'depth_drop', title: 'Depth drop', visibility: 'published', minutes: 14,
    summary: 'Landing from height and absorbing it — the highest-load thing in the catalogue.',
    // the brief's worked example, and the strictest rule here. A week-old scan is not evidence for this one.
    unlock: {
      all: [
        { axis: COMPOSITE, min: 70, label: 'Overall readiness' },
        { axis: 'flexibility', min: 60, label: 'Ankle compliance' },
        { axis: 'recovery', min: 65, label: 'Recovery' },
      ],
      maxScanAgeDays: 7,
    },
  },
  {
    key: 'oscillatory_jump', title: 'Oscillatory jump series', visibility: 'published', minutes: 12,
    summary: 'Short, repeated ground contacts — elasticity rather than effort.',
    unlock: {
      all: [
        { axis: COMPOSITE, min: 65, label: 'Overall readiness' },
        { axis: 'power', min: 60, label: 'Power' },
      ],
      maxScanAgeDays: 10,
    },
  },
];
