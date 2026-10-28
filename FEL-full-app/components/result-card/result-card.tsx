'use client';

// ResultCard — every measured result, read in one glance (PLAT-P03, 2026-10-28). The owner at the 2026-10-27 playtest:
// "People need to be able to understand and interpret the results and understand what they are doing."
//
//   1. ONE big number (64 px, the biggest thing on screen) with its unit, and "estimate" where the tool says so;
//   2. one arrow chip against last time: "about the same" inside the tool's own noise band (lib/results);
//   3. one line on what it means (the tool's own words, never reworded here);
//   4. one primary button: the next step.
// Then a quiet "See all" (the door to My progress) and "Details", collapsed: each attempt, the ±, the method, and every
// other sentence the tool says, moved here unchanged.
//
// MOTION: the card rises in (fel-enter) and the number counts up once on reveal; both are off under reduced motion
// (the device's setting or the app's own, lib/a11y/reducedMotion.ts). On reveal the card scrolls itself into view, so
// the result is what the first screen shows.
//
// The look is ./look.ts (one file for premium-ui to swap).
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { reducedMotion } from '@/lib/a11y/reducedMotion';
import { DURATION } from '@/lib/design/motion';
import { isBetter, type ResultView } from '@/lib/results/view';
import { RESULT_COPY } from '@/lib/results/copy';
import { LOOK } from './look';

export const PROGRESS_HREF = '/train/progress';
/** The longest paragraph the premium rule allows. */
export const MAX_PARAGRAPH_WORDS = 24;

/** A line over the paragraph limit, split at its sentence ends (every sentence kept, in order, unchanged). */
export function paragraphs(line: string): string[] {
  const t = line.trim();
  if (!t) return [];
  if (t.split(/\s+/).length <= MAX_PARAGRAPH_WORDS) return [t];
  // no regex lookbehind: Safari before 16.4 cannot parse one, and one bad regex breaks the whole bundle on that phone
  const out: string[] = [];
  let from = 0;
  const end = /[.!?]\s+(?=[A-Z0-9"'“(])/g;
  for (let m = end.exec(t); m; m = end.exec(t)) { out.push(t.slice(from, m.index + 1).trim()); from = m.index + m[0].length; }
  out.push(t.slice(from).trim());
  return out.filter(Boolean);
}

/** The number's decimals, from how the tool formatted it ("24.5" → 1, "5.12" → 2). */
const placesOf = (s: string) => (s.includes('.') ? s.split('.')[1].length : 0);

/** The number counts up once on reveal (off under reduced motion). The final value is in the markup from the start. */
function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    const target = Number(value);
    if (!el || !Number.isFinite(target) || target === 0) return;
    let reduce = true;
    try { reduce = reducedMotion(); } catch { /* no window: leave it */ }
    if (reduce || typeof requestAnimationFrame !== 'function') return;
    const places = placesOf(value);
    const ms = DURATION.slow * 2;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = (target * eased).toFixed(places);
      if (k < 1) raf = requestAnimationFrame(step); else el.textContent = value;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); if (el) el.textContent = value; };
  }, [value]);
  return <span ref={ref} data-result-value className={LOOK.number}>{value}</span>;
}

export function ResultCard({ view, onNext, primary = true, details, seeAll = true, reveal = true, fill, testId }: {
  view: ResultView;
  /** The next step as an in-page action (run again, next set); otherwise the button goes to `view.next.href`. */
  onNext?: () => void;
  /** False when the screen's one primary is elsewhere (the reader's docked "Next chapter"): the step is a quiet link. */
  primary?: boolean;
  /** Everything else the tool shows, behind "Details". */
  details?: ReactNode;
  seeAll?: boolean;
  /** Scroll the card into view when it appears (a result that arrives under the set-up). */
  reveal?: boolean;
  /** The result takes the screen: whatever follows the card starts below the fold (default: with `reveal`). */
  fill?: boolean;
  testId?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  useEffect(() => {
    if (!reveal) return;
    let reduce = true;
    try { reduce = reducedMotion(); } catch { /* leave it */ }
    try { ref.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }); } catch { /* old browser */ }
  }, [reveal]);

  const good = isBetter(view);
  const tone = view.vsLast === 'same' || good === null ? LOOK.chipTone.same : good ? LOOK.chipTone.better : LOOK.chipTone.worse;
  const Arrow = view.vsLast === 'up' ? ArrowUpRight : view.vsLast === 'down' ? ArrowDownRight : Minus;
  const spoken = view.value === null ? '' : `${view.estimate ? 'about ' : ''}${view.value}${view.pm ? ` plus or minus ${view.pm}` : ''} ${view.unit}`;
  const hasStep = !!onNext || !!view.next.href;
  const step = !hasStep ? null : primary ? (
    view.next.href && !onNext
      ? <PrimaryCta href={view.next.href} data-testid="result-next" prefetch={false}>{view.next.label}</PrimaryCta>
      : <PrimaryCta onClick={onNext} data-testid="result-next">{view.next.label}</PrimaryCta>
  ) : view.next.href && !onNext
    ? <Link href={view.next.href} prefetch={false} data-testid="result-next" className={LOOK.quiet}>{view.next.label}</Link>
    : <button type="button" onClick={onNext} data-testid="result-next" className={LOOK.quiet}>{view.next.label}</button>;
  const showSeeAll = seeAll && view.next.href !== PROGRESS_HREF;

  const card = (
    <section ref={ref} data-result-card data-testid={testId} data-vs={view.vsLast ?? 'none'} className={LOOK.card}>
      <p data-result-measure className={LOOK.label}>
        <span>{view.measure}</span>
        {view.estimate ? <span data-result-estimate className={LOOK.tag}>{RESULT_COPY.estimate}</span> : null}
      </p>
      {view.value !== null ? (
        <p data-result-number aria-label={spoken} className={LOOK.numberRow}>
          <CountUp value={view.value} />
          <span aria-hidden className={LOOK.unit}>{view.unit}{view.pm ? ` ±${view.pm}` : ''}</span>
        </p>
      ) : null}
      {view.vsLine ? (
        <p data-result-vs={view.vsLast ?? ''} className={`${LOOK.chip} ${tone}`}>
          <Arrow aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          <span>{view.vsLine}</span>
        </p>
      ) : null}
      {paragraphs(view.line).map((p) => <p key={p} data-result-line className={LOOK.line}>{p}</p>)}
      {step || showSeeAll ? (
        <div className={LOOK.actions}>
          {step}
          {showSeeAll ? <Link href={PROGRESS_HREF} prefetch={false} data-result-see-all className={LOOK.quiet}>{RESULT_COPY.seeAll}</Link> : null}
        </div>
      ) : null}
      {details ? (
        // a disclosure, not <details>: a closed <details> still lays its text out (chapter-reader's BookText found the
        // same), so a phone's first screen measured every hidden word. Closed, this body is display:none.
        <div data-result-details={open ? 'open' : 'closed'} className={LOOK.details}>
          <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)} className={`${LOOK.quiet} w-full`}>
            {RESULT_COPY.details}
          </button>
          <div id={bodyId} hidden={!open} className={LOOK.detailsBody}>{details}</div>
        </div>
      ) : null}
    </section>
  );
  // the result IS the screen: the card, then room to the tab bar, so the screen's first view is the card alone
  return (fill ?? reveal) ? <div data-result-fill className={LOOK.fill}>{card}</div> : card;
}
