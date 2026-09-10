'use client';

/**
 * components/mastery-ladder-view.tsx
 * =================================
 * The mastery ladder surface — the vision's "I can feel myself getting better"
 * read. Every number on this page comes from lib/mastery/mastery-ladder.ts,
 * which derives it from the same persisted snapshots MasteryCore ranks on, so
 * the page can never disagree with the badge the engine awarded.
 *
 * It is deliberately honest, per the "readable, honest systems" pillar:
 *   - progress is measured from the real band floor, so a fresh Gold reads as
 *     the start of Gold rather than as almost-Platinum;
 *   - an earned tier that outranks current form is labelled as held, with the
 *     dip stated rather than hidden;
 *   - the tier thresholds themselves are printed — nothing about the ladder is
 *     a secret from the player.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Award,
  Loader2,
  Minus,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { THRESHOLDS, TIERS } from '@/lib/mastery/mastery-core';
import { MIN_SAMPLES } from '@/lib/mastery/mastery-ladder';
import type { Ladder, LadderRung, MasteryTrend } from '@/lib/mastery/mastery-ladder';

const TIER_COLOR: Record<number, string> = {
  0: '#6B7280', // Unranked
  1: '#CD7F32', // Bronze
  2: '#C0C0C0', // Silver
  3: '#FFD700', // Gold
  4: '#00E5FF', // Platinum
  5: '#A855F7', // Venice Legend
};

const TREND_META: Record<MasteryTrend, { label: string; color: string; Icon: typeof TrendingUp }> = {
  rising: { label: 'Rising', color: '#00FF9D', Icon: TrendingUp },
  falling: { label: 'Dipping', color: '#FF3366', Icon: TrendingDown },
  steady: { label: 'Steady', color: '#00E5FF', Icon: Minus },
  new: { label: 'Too early to call', color: '#6B7280', Icon: Minus },
};

export function MasteryLadderView() {
  const [ladder, setLadder] = useState<Ladder | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/mastery')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live) return;
        if (j?.ladder) setLadder(j.ladder);
        else setFailed(true);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  if (failed) {
    return (
      <p className="mt-8 rounded-lg border border-[#FF3366]/30 bg-[#FF3366]/5 p-4 text-sm text-white/60">
        Could not load your ladder just now. Refresh to try again.
      </p>
    );
  }

  if (!ladder) {
    return (
      <div className="mt-16 flex justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#00E5FF]" />
      </div>
    );
  }

  return (
    <>
      <LadderSummary ladder={ladder} />
      <TierScale />

      {ladder.rungs.length === 0 ? (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center">
          <Award className="mx-auto h-8 w-8 text-white/25" />
          <p className="mt-3 text-sm text-white/60">
            No graded sessions yet. Play any mode three times and it appears here with a tier.
          </p>
          <Link
            href="/modes"
            className="fel-heading mt-4 inline-block rounded-md bg-[#00E5FF] px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-[#00E5FF]/85"
          >
            PICK A MODE
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {ladder.rungs.map((rung) => (
            <RungRow key={rung.mode} rung={rung} />
          ))}
        </div>
      )}
    </>
  );
}

function LadderSummary({ ladder }: { ladder: Ladder }) {
  const peakColor = TIER_COLOR[ladder.peakTierIndex] ?? TIER_COLOR[0];
  const peakName = ladder.peakTierIndex ? TIERS[ladder.peakTierIndex - 1] : 'Unranked';
  return (
    <section className="fel-panel mt-6 grid grid-cols-3 gap-3 rounded-xl p-5">
      <Stat label="Peak tier" value={peakName} color={peakColor} />
      <Stat label="Modes ranked" value={String(ladder.ranked)} color="#00E5FF" />
      <Stat
        label="Ladder points"
        value={String(ladder.totalTierPoints)}
        color="#FFD700"
        hint={ladder.inProgress > 0 ? `${ladder.inProgress} more in progress` : undefined}
      />
    </section>
  );
}

function Stat({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color: string;
  hint?: string;
}) {
  return (
    <div className="text-center">
      <div className="fel-heading text-xl font-bold leading-tight sm:text-2xl" style={{ color }}>
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      {hint && <div className="mt-0.5 font-mono text-[10px] text-white/30">{hint}</div>}
    </div>
  );
}

/** The ladder itself, printed. The thresholds are not a secret. */
function TierScale() {
  return (
    <section className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <h2 className="fel-heading text-sm font-bold uppercase tracking-wide text-white/70">The ladder</h2>
      <p className="mt-1 font-mono text-[11px] leading-relaxed text-white/40">
        Your last 10 graded sessions per mode set your tier — three minimum. Tiers never decay once
        earned, so a bad night costs you nothing you already banked.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {TIERS.map((tier, i) => (
          <span
            key={tier}
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[10px] font-bold"
            style={{
              background: `${TIER_COLOR[i + 1]}14`,
              color: TIER_COLOR[i + 1],
              border: `1px solid ${TIER_COLOR[i + 1]}55`,
            }}
          >
            {tier}
            <span className="text-white/35">{Math.round(THRESHOLDS[i] * 100)}+</span>
          </span>
        ))}
      </div>
    </section>
  );
}

function RungRow({ rung }: { rung: LadderRung }) {
  const color = TIER_COLOR[rung.tierIndex] ?? TIER_COLOR[0];
  const trend = TREND_META[rung.trend];
  const TrendIcon = trend.Icon;

  return (
    <article className="fel-card rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="fel-heading text-base font-bold text-white">{rung.label}</h3>

        <span
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold"
          style={{ background: `${color}1c`, color, border: `1px solid ${color}66` }}
        >
          <Award className="h-3 w-3" /> {rung.tierName}
        </span>

        {rung.holdingTier && (
          <span
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold"
            style={{ background: '#FFD70014', color: '#FFD700', border: '1px solid #FFD70055' }}
            title="Earned tiers never decay — your current form sits below this badge"
          >
            <ShieldCheck className="h-3 w-3" /> HELD · form {rung.liveTierName}
          </span>
        )}

        <span
          className="ml-auto inline-flex items-center gap-1 font-mono text-[10px]"
          style={{ color: trend.color }}
        >
          <TrendIcon className="h-3 w-3" /> {trend.label}
        </span>
      </div>

      {/*
        Below the 3-session gate the band position is not the honest bar to
        show: an average can already clear Bronze while the tier is still
        withheld, which would read as a full bar under an "Unranked" label.
        Until the gate is met the bar tracks the gate itself.
      */}
      {rung.samplesUntilRanked > 0 ? (
        <div className="mt-3">
          <div className="flex items-baseline justify-between font-mono text-[10px] text-white/40">
            <span>Unranked</span>
            <span>
              {rung.sampleCount}/{MIN_SAMPLES} sessions to rank
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white/30 transition-[width] duration-500"
              style={{ width: `${Math.round((rung.sampleCount / MIN_SAMPLES) * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex items-baseline justify-between font-mono text-[10px] text-white/40">
            <span>{rung.liveTierName}</span>
            <span>{rung.nextTierName ?? 'Top of the ladder'}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.round(rung.progressToNext * 100)}%`,
                background: rung.nextTierName ? '#00E5FF' : '#A855F7',
              }}
            />
          </div>
        </div>
      )}

      {/* The window itself — one dot per graded session that counts. */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: 10 }, (_, i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: i < rung.sampleCount ? color : 'rgba(255,255,255,0.12)' }}
            />
          ))}
        </div>
        <span className="font-mono text-[10px] text-white/40">
          {rung.sampleCount}/10 in window · grading {rung.metricLabel}
        </span>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-white/55">{rung.guidance}</p>
    </article>
  );
}
