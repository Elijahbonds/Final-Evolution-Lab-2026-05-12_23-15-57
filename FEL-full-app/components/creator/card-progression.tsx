// THE PROGRESSION PANEL ON A PUBLIC CARD (2026-09-13).
//
// Renders `CardProgression`. Everything it shows was already decided by the projection — what is measured,
// what has aged out, what was earned against a superseded curriculum — so this component's whole job is to
// not add claims the projection did not make.
//
// The one rule it enforces by construction: THE SHIELD COMES FROM `standing.verified`, never from the
// presence of a number. A stale reading still shows its composite and still prints its age, and it does not
// get a badge. `note` is rendered whenever it is not fresh, because the projection wrote that sentence
// precisely so a UI would not have to decide how to caveat it.

import { BadgeCheck, Clock, GraduationCap, Unlock, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { CardProgression } from '@/lib/creator/cardProgression';

function Delta({ delta }: { delta: number | null }) {
  // null is "not enough history", which is a different thing from zero and must not render as +0
  if (delta === null) return <span className="text-white/35">First measurement</span>;
  if (delta === 0) return <span className="inline-flex items-center gap-1 text-white/55"><Minus className="h-3 w-3" /> Level</span>;
  const up = delta > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 ${up ? 'text-emerald-400' : 'text-amber-400'}`}>
      <Icon className="h-3 w-3" />{up ? '+' : ''}{delta}
    </span>
  );
}

export function CardProgressionPanel({ progression, accent }: { progression: CardProgression; accent: string }) {
  const { standing, trajectory, credentials, unlocks } = progression;

  return (
    <section className="mt-6 w-full max-w-[380px] rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <h2 className="mb-3 font-mono text-[10px] uppercase tracking-widest text-white/40">Progression</h2>

      {standing && (
        <div className="mb-4">
          <div className="flex items-baseline gap-2">
            {standing.composite !== null ? (
              <span className="text-3xl font-semibold text-white">{standing.composite}</span>
            ) : (
              // expired: the projection withheld the number, so there is nothing to render here
              <span className="text-sm text-white/40">No current reading</span>
            )}
            {standing.verified && (
              <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: accent }}>
                <BadgeCheck className="h-3.5 w-3.5" /> Verified
              </span>
            )}
            {trajectory && <span className="ml-auto text-xs"><Delta delta={trajectory.delta} /></span>}
          </div>
          {/* the projection wrote this sentence so the UI would not have to invent a caveat */}
          {standing.freshness !== 'fresh' && (
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-white/40">
              <Clock className="h-3 w-3" /> {standing.note}
            </p>
          )}
        </div>
      )}

      {credentials.length > 0 && (
        <div className="mb-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/35">
            <GraduationCap className="h-3.5 w-3.5" /> Earned
          </div>
          <ul className="space-y-1">
            {credentials.slice(0, 6).map((c) => (
              <li key={`${c.trackKey}/${c.moduleKey}`} className="flex items-baseline gap-2 text-xs">
                <span className="text-white/75">{c.moduleKey}</span>
                {/* shown, not hidden: a credential against an old curriculum is still real, just not current */}
                {c.superseded && <span className="text-[10px] text-white/30">earlier curriculum</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {unlocks.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/35">
            <Unlock className="h-3.5 w-3.5" /> Cleared
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unlocks.map((u) => (
              <span key={u.key} className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-white/65">
                {u.title}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
