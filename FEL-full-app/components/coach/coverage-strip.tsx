// The six-pattern strip on a roster row (MIRROR-COACH P2, 2026-09-25): squat, hinge, lunge, push, pull, carry, each
// done in the last seven days or not, read from the program's pattern tags and the coached sessions completed
// (lib/coach/coverage.ts decides every cell; this file only draws them).
//
// Four looks, never a red one. `done` is filled; `open` (in the program, not done this week) is an outline; `not in
// program` is dashed and dim, because leaving a pattern out is the coach's call, not the athlete's miss; `untagged`
// carries a "?" and the line underneath says how many exercises need a tag. There is no "missed" state to draw.
import { Check } from 'lucide-react';
import { coverageLine, type CoverageState, type CoverageStrip as Strip } from '@/lib/coach/coverage';

const LOOK: Record<CoverageState, string> = {
  done: 'border-[#7BD389]/60 bg-[#7BD389]/15 text-[#7BD389]',
  open: 'border-white/25 text-white/70',
  notProgrammed: 'border-dashed border-white/15 text-white/30',
  untagged: 'border-white/10 text-white/40',
};

export function CoverageStrip({ strip }: { strip: Strip }) {
  return (
    <div className="mt-1 space-y-0.5" data-testid="coverage-strip">
      <ul className="flex flex-wrap gap-1" aria-label={`Pattern coverage, last ${strip.windowDays} days`}>
        {strip.cells.map((c) => (
          <li
            key={c.pattern}
            data-pattern={c.pattern}
            data-state={c.state}
            title={c.note}
            className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] leading-none ${LOOK[c.state]}`}
          >
            {c.state === 'done' && <Check className="h-2.5 w-2.5" aria-hidden="true" />}
            <span aria-hidden="true">{c.label}{c.state === 'untagged' ? ' ?' : ''}</span>
            <span className="sr-only">{c.note}</span>
          </li>
        ))}
      </ul>
      <div className="text-[10px] text-white/40">{coverageLine(strip)}</div>
    </div>
  );
}

/** Once per roster, above the rows: what the four looks mean, for a phone that has no hover. */
export function CoverageLegend() {
  const item = (state: CoverageState, text: string) => (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2.5 w-4 rounded-sm border ${LOOK[state]}`} aria-hidden="true" />{text}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/45" data-testid="coverage-legend">
      {item('done', 'done in the last 7 days')}{item('open', 'in the program, not yet')}{item('notProgrammed', 'not in the program')}{item('untagged', '? untagged')}
    </div>
  );
}
