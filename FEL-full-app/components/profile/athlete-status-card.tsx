// #337 ATHLETE STATUS CARD (cursor-bundle-2, 2026-10-24) — "What to do next", from the shared Profile.
//
// SELF-CONTAINED ON PURPOSE. lane/profile-v2 is redesigning /profile. The #337 draft wrote this card inline in
// app/profile/page.tsx; it is lifted out here so profile-v2 can place it (or fold lib/profile/athleteStatusServer.ts into
// its own server batch) without unpicking the page. Two ways in:
//   - <AthleteStatusCard status={...} /> : presentational, no data access;
//   - <AthleteStatusSection userId={...} /> : async server component, loads then renders the card or nothing.
// Read-only on the shared Profile. Copy and layout are the #337 draft's, unchanged.
import Link from 'next/link';
import { Activity, ArrowRight, Target } from 'lucide-react';
import { prisma } from '@/lib/db';
import { biggestMovers, type AthleteStatus } from '@/lib/profile/dashboard';
import { loadAthleteStatus } from '@/lib/profile/athleteStatusServer';

export async function AthleteStatusSection({ userId }: { userId: string | null | undefined }) {
  const status = await loadAthleteStatus(prisma, userId);
  return status ? <AthleteStatusCard status={status} /> : null;
}

export function AthleteStatusCard({ status }: { status: AthleteStatus }) {
  const movers = biggestMovers(status);
  const score = status.composite === null ? 'Scan needed' : Math.round(status.composite).toString();
  const scanAge = status.scanAgeDays === null ? 'No scan yet' : status.scanAgeDays === 0 ? 'Scanned today' : `${status.scanAgeDays}d since scan`;
  const nextBody = (
    <>
      <span>{status.next.text}</span>
      {status.next.href && <ArrowRight className="h-4 w-4" />}
    </>
  );

  return (
    <section className="mt-8 rounded-2xl border border-fel-cyan/20 bg-fel-cyan/[0.04] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-fel-cyan/70">Athlete status</p>
          <h2 className="fel-heading mt-1 text-[22px] font-black text-white">What to do next</h2>
          <p className="mt-1 text-sm text-white/55">A live read of your scan history, Academy progress, and open protocols.</p>
        </div>
        <div className="grid min-w-[220px] grid-cols-2 gap-2 text-right">
          <StatusMetric label="PRQ" value={score} />
          <StatusMetric label="Scan" value={scanAge} />
          <StatusMetric label="Academy" value={`${status.modulesCompleted} done`} />
          <StatusMetric label="Protocols" value={`${status.openProtocols}/${status.totalProtocols} open`} />
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1.35fr_1fr]">
        <div className="rounded-xl border border-white/10 bg-black/25 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Target className="h-4 w-4 text-fel-gold" /> Lead action
          </div>
          {status.next.href ? (
            <Link
              href={status.next.href}
              className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-xl bg-fel-gold px-4 py-2 text-sm font-black text-black transition-transform hover:scale-[1.01]"
            >
              {nextBody}
            </Link>
          ) : (
            <p className="mt-3 text-sm text-white/70">{status.next.text}</p>
          )}
          {status.nextUnlock && (
            <p className="mt-3 text-xs text-fel-dim">
              Closest unlock: <span className="text-white/65">{status.nextUnlock.title}</span> needs {status.nextUnlock.need}.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/25 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Activity className="h-4 w-4 text-fel-emerald" /> Movement
          </div>
          {movers.length ? (
            <div className="mt-3 space-y-2">
              {movers.map((m) => (
                <div key={m.axis} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
                  <span className="capitalize text-white/65">{m.axis}</span>
                  <span className={`font-mono font-bold ${m.delta > 0 ? 'text-fel-emerald' : 'text-fel-ember'}`}>
                    {m.delta > 0 ? '+' : ''}{m.delta}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-white/55">{status.shift.label}</p>
          )}
          {status.gaps.length > 0 && (
            <p className="mt-3 text-xs text-fel-dim">
              Missing measurements: {status.gaps.slice(0, 3).join(', ')}{status.gaps.length > 3 ? '...' : ''}.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-fel-quiet">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}
