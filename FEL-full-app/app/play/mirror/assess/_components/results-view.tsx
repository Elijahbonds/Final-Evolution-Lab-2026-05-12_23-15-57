'use client';

// The results page, in the spec's order (§8), minus the program: (1) MQS beside PRQ, (2) the test cards, each opening
// to its reasons and the frozen worst rep, (3) the top three findings, (4) "Your plan: coming soon", (5) the disclaimer
// and what a camera cannot measure. Every score carries "Provisional" while its thresholds are unsigned.
import { useEffect, useRef, useState } from 'react';
import { ASSESSMENT_DISCLAIMER } from '@/lib/mirror/assessment';
import { prqGrade } from '@/lib/prq';
import type { SessionResult } from '@/lib/assess/runner';
import type { FrozenRep, SideResult, TestResult } from '@/lib/assess/scoring';
import { PROTOCOL, NOT_BUILT_LINE, testDef, type Side } from '@/lib/assess/protocol';
import { PROVISIONAL_LABEL } from '@/lib/assess/thresholds';
import { PAIN_REFERRAL, inches, type Reason } from '@/lib/assess/why';
import { drawSkeleton, metricFocus, SKELETON_COLOURS } from './skeleton';

export type SaveState =
  | { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; body: Record<string, unknown> }
  | { kind: 'notSaved'; why: 'guest' | 'consent' | 'pain' } | { kind: 'error'; code: number };

const Tag = () => <span className="rounded-full border border-white/15 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/55">{PROVISIONAL_LABEL}</span>;
const AXIS: Record<string, string> = { power: 'Power', flexibility: 'Flexibility' };

export function ResultsView({ result, save, signedIn, onAgain }: { result: SessionResult; save: SaveState; signedIn: boolean; onAgain: () => void }) {
  const leg = result.takeoffLeg;
  if (result.pain) {
    return (
      <div className="space-y-4">
        <section className="rounded-3xl border border-[#FFB020]/40 bg-[#FFB020]/[0.06] p-5">
          <h2 className="text-[20px] font-black">Screen stopped</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-white/85">{PAIN_REFERRAL}</p>
        </section>
        <Tests result={result} leg={leg} />
        <Footer onAgain={onAgain} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <MqsCard result={result} />
        <PrqCard result={result} save={save} signedIn={signedIn} />
      </div>
      <Tests result={result} leg={leg} />
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-[16px] font-black">Your top findings</h2>
        {result.findings.length ? (
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-[14px] leading-relaxed text-white/85">
            {result.findings.map((f, i) => <li key={i}>{f.text}</li>)}
          </ol>
        ) : <p className="mt-2 text-[14px] text-white/70">Nothing flagged on this screen.</p>}
      </section>
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-[16px] font-black">Your plan</h2>
        <p className="mt-1 text-[14px] text-white/60">Coming soon. The drills named above are placeholders until they are approved.</p>
      </section>
      <Footer onAgain={onAgain} />
    </div>
  );
}

function MqsCard({ result }: { result: SessionResult }) {
  const m = result.mqs;
  const g = m ? prqGrade(m.value) : null;
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/55">Movement quality{m ? ` · ${m.label}` : ''}</p>
        <Tag />
      </div>
      {m ? (
        <>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-[56px] font-black leading-none tabular-nums">{m.value}</span>
            <span className="text-[15px] font-black" style={{ color: g!.color }}>{m.band}</span>
          </div>
          <p className="mt-1 text-[13px] text-white/60">{m.fmsTotal}/{m.fmsMax} on the 0–3 scores{m.asymmetryFlags ? ` · ${m.asymmetryFlags} asymmetry flag${m.asymmetryFlags > 1 ? 's' : ''}` : ''}</p>
        </>
      ) : <p className="mt-2 text-[14px] text-white/65">No movement quality score: fewer than three tests were scored.</p>}
      <p className="mt-3 text-[12px] leading-relaxed text-white/45">A safety check that sits beside PRQ. It is never part of the PRQ number.</p>
    </section>
  );
}

function PrqCard({ result, save, signedIn }: { result: SessionResult; save: SaveState; signedIn: boolean }) {
  const saved = save.kind === 'saved' ? save.body as { prqBefore?: { score: number; measured: number; total: number }; prqAfter?: { score: number; measured: number; total: number }; writes?: { axis: string; value: number; before: number | null; reason: string }[] } : null;
  const after = saved?.prqAfter;
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/55">PRQ</p>
        <Tag />
      </div>
      {after ? (
        <>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-[56px] font-black leading-none tabular-nums">{after.measured ? after.score : '—'}</span>
            {after.measured ? <span className="text-[15px] font-black" style={{ color: prqGrade(after.score).color }}>{prqGrade(after.score).key}</span> : null}
          </div>
          <p className="mt-1 text-[13px] text-white/60">{after.measured} of {after.total} axes measured</p>
          <ul className="mt-3 space-y-1.5 text-[13.5px] leading-snug text-white/85">
            {(saved?.writes ?? []).map((w) => (
              <li key={w.axis}><span className="font-bold">{AXIS[w.axis] ?? w.axis} {w.before ?? '—'} → {w.value}</span>: {w.reason} <span className="text-white/45">(camera estimate)</span></li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <ul className="mt-2 space-y-1.5 text-[13.5px] leading-snug text-white/80">
            {result.prqPreview.length ? result.prqPreview.map((w) => (
              <li key={w.axis}><span className="font-bold">{AXIS[w.axis]} {w.value}</span>: {w.reason} <span className="text-white/45">(camera estimate)</span></li>
            )) : <li>This screen measured no PRQ axis (a test that feeds one was not scored).</li>}
          </ul>
          <p className="mt-3 text-[12.5px] text-white/55">{saveLine(save, signedIn)}</p>
        </>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-white/45">This screen feeds power and flexibility only. Strength, speed, agility, endurance, recovery and mental need their own measurements.</p>
    </section>
  );
}

function saveLine(save: SaveState, signedIn: boolean): string {
  if (save.kind === 'saving') return 'Saving the scores to your profile…';
  if (save.kind === 'error') return `Not saved: the server answered ${save.code || 'nothing'}. Your scores are shown here.`;
  if (save.kind === 'notSaved') {
    if (save.why === 'consent') return 'Not saved: an athlete under 18, or with no birth year on file, needs an accepted guardian consent first. Your scores are shown here and kept nowhere.';
    if (save.why === 'guest' || !signedIn) return 'Not saved: sign in to keep scores and update your PRQ. They are shown here and kept nowhere.';
  }
  return '';
}

function Tests({ result, leg }: { result: SessionResult; leg: Side | null }) {
  const byId = new Map(result.tests.map((t) => [t.id, t]));
  return (
    <section className="space-y-2">
      <h2 className="px-1 font-mono text-[10px] uppercase tracking-[0.2em] text-white/55">The tests</h2>
      {PROTOCOL.map((p) => {
        const t = byId.get(p.id);
        if (!t) return p.notBuilt ? (
          <div key={p.id} className="flex items-center rounded-2xl border border-white/5 bg-white/[0.015] px-4 py-3 text-[14px] text-white/35">
            <span className="font-mono text-[11px]">{p.id}</span><span className="ml-2">{p.name}</span>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em]">{NOT_BUILT_LINE}</span>
          </div>
        ) : null;
        return <TestCard key={p.id} test={t} reasons={result.reasons[p.id] ?? []} leg={leg} />;
      })}
    </section>
  );
}

function sideScore(s: SideResult | undefined, name: string) {
  if (!s) return null;
  return <span className="tabular-nums">{name}{name ? ' ' : ''}<b className="text-white">{s.score03}/3</b> <span className="text-white/50">· {s.score100 ?? '—'}/100</span></span>;
}

function TestCard({ test, reasons, leg }: { test: TestResult; reasons: Reason[]; leg: Side | null }) {
  const [open, setOpen] = useState(false);
  const d = testDef(test.id);
  const scored = test.status === 'scored';
  const legName = (s: Side) => `${s === 'left' ? 'L' : 'R'}${leg === s ? ' (jumping leg)' : ''}`;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left">
        <span className="font-mono text-[11px] text-[#00E5FF]">{test.id}</span>
        <span className="text-[15px] font-black">{d.name}</span>
        {scored ? <Tag /> : null}
        <span className="ml-auto flex flex-wrap items-center gap-3 text-[13.5px] text-white/75">
          {test.status === 'notScored' ? <span className="text-white/55">not scored</span> : null}
          {test.status === 'painStop' ? <span className="text-[#FFB020]">0/3 · pain reported</span> : null}
          {test.status === 'skipped' ? <span className="text-white/40">not run</span> : null}
          {scored && test.sides.both ? sideScore(test.sides.both, '') : null}
          {scored && test.sides.left ? sideScore(test.sides.left, legName('left')) : null}
          {scored && test.sides.right ? sideScore(test.sides.right, legName('right')) : null}
          {scored && test.id === 'T5' && test.t5?.bestHeightCm != null ? <span>jump <b className="text-white">{inches(test.t5.bestHeightCm)} in</b></span> : null}
          {test.asymmetry?.flagged ? <span className="rounded-full bg-[#FFB020]/15 px-2 py-0.5 text-[11.5px] font-bold text-[#FFB020]">asymmetry</span> : null}
          {test.status !== 'skipped' ? <span className="font-mono text-[11px] text-white/40">{Math.round(test.confidence * 100)}% read</span> : null}
        </span>
      </button>
      {open ? (
        <div className="border-t border-white/10 px-4 py-3">
          <ul className="space-y-2 text-[13.5px] leading-relaxed text-white/85">
            {reasons.map((r, i) => <li key={i} className={r.kind === 'fault' ? 'text-white' : r.kind === 'clean' ? 'text-white/65' : ''}>{r.text}</li>)}
          </ul>
          {test.frozen.length ? (
            <div className="mt-3 flex flex-wrap gap-3">
              {test.frozen.map((f, i) => <Frozen key={i} f={f} />)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The worst rep, from its landmarks on a blank canvas: never a camera frame. Held in this page's memory only. */
function Frozen({ f }: { f: FrozenRep }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const w = 180, h = Math.round(w / (f.aspect || 4 / 3));
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.fillStyle = '#0b0b0b';
    ctx.fillRect(0, 0, c.width, c.height);
    const focus = metricFocus(f.metric, f.side, f.image);
    drawSkeleton(ctx, f.image, { colour: SKELETON_COLOURS.tracking, mirror: true, highlight: focus.highlight, guides: focus.guides });
  }, [f]);
  return (
    <figure className="w-[180px]">
      <canvas ref={ref} width={w * 2} height={h * 2} style={{ width: w, height: h }} className="rounded-xl border border-white/10" />
      <figcaption className="mt-1 text-[11.5px] text-white/55">Rep {f.rep}{f.side ? `, ${f.side}` : ''}: {f.metric.replace(/([A-Z])/g, ' $1').toLowerCase()}</figcaption>
    </figure>
  );
}

function Footer({ onAgain }: { onAgain: () => void }) {
  return (
    <section className="space-y-3">
      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 text-[12.5px] leading-relaxed text-white/55">
        <p>{ASSESSMENT_DISCLAIMER}</p>
        <p className="mt-2">What a camera cannot measure: the curve of your spine, how strong you are, or where any pain comes from.</p>
        <p className="mt-2">Every score is provisional: the thresholds behind it have not been signed off yet.</p>
      </div>
      <button type="button" onClick={onAgain} className="w-full rounded-full border border-white/20 px-6 py-3 text-[15px] font-bold">Run it again</button>
    </section>
  );
}
