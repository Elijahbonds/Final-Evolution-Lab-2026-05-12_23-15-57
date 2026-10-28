'use client';

// RunResult — one camera run's numbers, every one an estimate with its ± (SPRINT-SPEED, 2026-10-25).
import type { RunResult } from '@/lib/sprint/session';
import { modelSpeed } from '@/lib/sprint/trace';
import type { SprintRecord } from '@/lib/sprint/store';
import { AGILITY_BETA_LINE, ESTIMATE_LINE, FV_SLOPE_LINE, MOVEMENT_LINE, REACTION_LINE, mph, speedWithBand, timeWithBand, RESULT_MEANS, RESULT_NEXT } from '@/lib/sprint/copy';
import { sprintView } from '@/lib/results/sprint';
import { RESULT_COPY } from '@/lib/results/copy';
import { ResultCard } from '@/components/result-card/result-card';
import { LOOK } from '@/components/result-card/look';

export function SpeedChart({ trace }: { trace: NonNullable<Extract<RunResult, { ok: true }>['trace']> }) {
  const pts = trace.curve;
  if (pts.length < 3) return null;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const vMax = Math.max(...pts.map((p) => p.v), trace.model?.vmax ?? 0) * 1.1 || 1;
  const X = (t: number) => 8 + ((t - t0) / Math.max(0.01, t1 - t0)) * 304;
  const Y = (v: number) => 110 - (Math.max(0, v) / vMax) * 100;
  const seen = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(' ');
  const model = trace.model;
  const fit = model ? Array.from({ length: 41 }, (_, i) => { const t = t0 + ((t1 - t0) * i) / 40; return `${i ? 'L' : 'M'}${X(t).toFixed(1)} ${Y(modelSpeed(model, t)).toFixed(1)}`; }).join(' ') : null;
  return (
    <figure className="space-y-1" data-sprint-chart>
      <svg viewBox="0 0 320 120" className="h-auto w-full" role="img" aria-label="Speed against time">
        <rect x={0} y={0} width={320} height={120} rx={8} fill="#ffffff08" />
        {[0.25, 0.5, 0.75].map((k) => <line key={k} x1={8} x2={312} y1={Y(vMax * k)} y2={Y(vMax * k)} stroke="#ffffff14" />)}
        <path d={seen} fill="none" stroke="#00FF9D" strokeWidth={1.5} strokeOpacity={0.85} />
        {fit && <path d={fit} fill="none" stroke="#00E5FF" strokeWidth={2} strokeDasharray="5 3" />}
        <text x={10} y={14} fill="#ffffff80" fontSize={9}>{(vMax / 1.1).toFixed(1)} m/s</text>
        <text x={312} y={116} fill="#ffffff80" fontSize={9} textAnchor="end">{(t1 - t0).toFixed(1)} s in view</text>
      </svg>
      <figcaption className="text-[11px] text-white/45">Green: the speed the camera saw. {fit ? 'Dashed: the smooth sprint curve that fits it best.' : ''}</figcaption>
    </figure>
  );
}

/**
 * One run's result (PLAT-P03, 2026-10-28): the result card (components/result-card) — the time (or the top speed), its ±,
 * "estimate", the arrow against the last comparable run on this phone (lib/results/sprint.ts: the two reads' own ±), what
 * it means and "Run it again". Everything else the run read — the splits, the speed chart, the sprint profile, the tips,
 * how it was started and timed, the estimate line and the next step — is under Details, unchanged.
 *
 * `onAgain` is the speed page's own (/train/speed). Without it (combine day's camera timer) the card is embedded: no
 * button, no "See all", no comparison unless `last` is given.
 */
export function RunResultCard({ result, last = null, onAgain, note = null }: { result: RunResult; last?: SprintRecord | null; onAgain?: () => void; note?: string | null }) {
  if (!result.ok) {
    return <div role="alert" className="fel-card rounded-xl p-4 text-sm text-[#FFB020]" data-sprint-result="failed">{result.why}</div>;
  }
  const r = result;
  const tr = r.trace;
  // the card's line is the meaning's first sentence; the whole line (its estimate caveat too) is in Details, unchanged
  const view = sprintView(r, last, RESULT_MEANS.split('. ')[0] + '.', { label: RESULT_COPY.runAgain, href: null });
  return (
    <div data-sprint-result={r.test}>
      <ResultCard view={view} onNext={onAgain} seeAll={!!onAgain} reveal={!!onAgain} details={(
        <div className="space-y-3">
          <div className={LOOK.detail}>{r.label} · camera estimate</div>
          {r.timeS !== null && <div className={`${LOOK.detail} font-bold text-white`} data-sprint-time>{timeWithBand(r.timeS, r.sdS)}</div>}
          {tr && (
            <div className="space-y-1">
              <div className={`${LOOK.detail} font-bold text-white`} data-sprint-top>{speedWithBand(tr.topSpeed, tr.topSpeedSd)}</div>
              <div className={LOOK.detail}>Top speed seen ({mph(tr.topSpeed)} mph), over {Math.round(tr.seenM[1] - tr.seenM[0])} m in view.</div>
            </div>
          )}
          {r.splits.length > 0 && (
            <dl className="grid grid-cols-2 gap-2 text-center" data-sprint-splits>
              {r.splits.map((s) => (
                <div key={s.label} className="rounded-lg bg-white/5 p-2"><dt className={LOOK.detail}>{s.label}</dt><dd className="font-bold tabular-nums text-white">{r.test === 'flying' ? s.s.toFixed(s.label === 'mph' ? 1 : 2) : `${s.s.toFixed(2)} s`}</dd></div>
              ))}
            </dl>
          )}
          {tr && <SpeedChart trace={tr} />}
          {tr?.model && tr.profile && (
            <div className="space-y-1.5" data-sprint-profile>
              <div className={LOOK.detail}>Sprint profile · estimate</div>
              <dl className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-white/5 p-2"><dt className={LOOK.detail}>Top speed (curve)</dt><dd className="font-bold text-white" data-sprint-vmax>{speedWithBand(tr.model.vmax, tr.model.vmaxSd)}</dd></div>
                <div className="rounded-lg bg-white/5 p-2"><dt className={LOOK.detail}>Time to speed up</dt><dd className="font-bold text-white">{tr.model.tau.toFixed(2)} s ± {Math.max(0.01, 2 * tr.model.tauSd).toFixed(2)}</dd></div>
                <div className="rounded-lg bg-white/5 p-2"><dt className={LOOK.detail}>Starting push</dt><dd className="font-bold text-white">{tr.profile.f0PerKg.toFixed(1)} N/kg{tr.profile.f0N ? ` · ${Math.round(tr.profile.f0N)} N` : ''}</dd></div>
                <div className="rounded-lg bg-white/5 p-2"><dt className={LOOK.detail}>Max power</dt><dd className="font-bold text-white">{tr.profile.pmaxPerKg.toFixed(1)} W/kg{tr.profile.pmaxW ? ` · ${Math.round(tr.profile.pmaxW)} W` : ''}</dd></div>
              </dl>
              <p className={LOOK.detail}>{tr.profile.withAir ? 'Air resistance included (from height and body mass).' : 'Per kilogram, without air resistance (no body mass given).'} Strength-to-speed balance (force-velocity slope) {tr.profile.slopePerKg.toFixed(2)}. {FV_SLOPE_LINE}</p>
            </div>
          )}
          <ul className={`space-y-1 ${LOOK.detail}`}>
            {r.startKind === 'go' && <li data-sprint-reaction>{REACTION_LINE}</li>}
            {r.startKind === 'movement' && <li>{MOVEMENT_LINE}</li>}
            {r.test === 'agility' && <li>{AGILITY_BETA_LINE}</li>}
            {r.tips.map((t) => <li key={t} className="text-[#FFB020]">{t}</li>)}
            <li>Pose rate {r.poseHz} frames a second.</li>
            <li data-sprint-estimate>{ESTIMATE_LINE}</li>
          </ul>
          {/* CUE-REWRITE: what the number means and the one next step, word for word */}
          <p className={LOOK.detail} data-sprint-means>{RESULT_MEANS}</p>
          <p className={`${LOOK.detail} font-bold text-white`} data-sprint-next>{RESULT_NEXT}</p>
          {note ? <p className={LOOK.detail} data-sprint-note>{note}</p> : null}
        </div>
      )} />
    </div>
  );
}
