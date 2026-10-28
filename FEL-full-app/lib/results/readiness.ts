// lib/results/readiness — the daily readiness check as a ResultView (PLAT-P03, 2026-10-28).
//
// BAND (read-only): the readiness check's own facts (lib/coach/readiness/rules.ts measure): today's best against the
// athlete's normal through the jump tool's realChange, best AND average past the noise. The arrow follows the band's own
// reason, so the chip and the band never disagree: up = 'up' / 'feel_caps' (above the normal, past the noise); down =
// belowReal; everything else on a normal = "about the same as your normal"; still building a normal = no arrow.
//
// The number is today's best jump (the check measures it); "what it means" is the band's next line (lib/coach/readiness/
// next.ts nextLineFor, unchanged), and the reason line sits in the detail.
//
// Pure.
import type { ReadinessView } from '@/lib/coach/readiness/view';
import { vsLineOf, type ResultNextStep, type ResultView, type VsLast } from './view';
import { RESULT_COPY } from './copy';

const IN = 2.54;

/** The arrow from the read's own reason. */
export function readinessVs(v: Pick<ReadinessView, 'band' | 'reason' | 'belowReal' | 'baselineCm'>): VsLast {
  if (v.band === 'building' || v.baselineCm == null) return null;
  if (v.belowReal) return 'down';
  if (v.reason === 'up' || v.reason === 'feel_caps') return 'up';
  return 'same';
}

export function readinessView(v: ReadinessView, next: ResultNextStep): ResultView {
  const vsLast = readinessVs(v);
  const delta = v.baselineCm == null ? null : v.bestCm - v.baselineCm;
  return {
    measure: `Readiness · ${v.label}`,
    value: (v.bestCm / IN).toFixed(1), unit: 'in', estimate: true, pm: null,
    vsLast, better: 'up',
    vsLine: vsLineOf({ vsLast, delta }, { against: RESULT_COPY.yourNormal, up: 'higher', down: 'lower', fmt: (x) => `${(x / IN).toFixed(1)} in` }),
    line: v.next ?? v.line, next,
  };
}
