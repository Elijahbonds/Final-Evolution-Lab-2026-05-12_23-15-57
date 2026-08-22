'use client';

/**
 * components/story-map.tsx
 *
 * "The Nexus Initiative" hub screen — 2D board fallback for the
 * story-hub.glb scene (contract note: a 3D variant can consume the same
 * GET /api/story payload and the same `onLaunchNode` routing; zone
 * `position` percentages map 1:1 onto the glb hub's floor plane).
 *
 * Premium dark board: zones rendered as glowing waypoints connected by
 * neon-cyan trails, framer-motion unlock/clear animations, zone tap
 * opens a detail panel with the narrative beat, rail nodes, and boss.
 * Node launch routes to /play/<mode>?story=<nodeId> — GameShell reads
 * the `story` param and, after posting the session, calls
 * POST /api/story/complete with { nodeId, sessionId }.
 *
 * The client renders exactly what the API returns and never re-derives
 * unlock rules (server-authoritative).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Award, ChevronRight, Lock, Play, Star, Trophy, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CampaignStatus, NodeStatus, ZoneStatus } from '@/lib/progression';

// ---------------------------------------------------------------------------

interface StoryMapProps {
  /** Optional SSR-prefetched payload of GET /api/story. */
  initialData?: CampaignStatus;
  className?: string;
}

export default function StoryMap({ initialData, className }: StoryMapProps) {
  const router = useRouter();
  const [data, setData] = useState<CampaignStatus | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    fetch('/api/story', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Story load failed (${res.status})`);
        return (await res.json()) as CampaignStatus;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Story load failed');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initialData]);

  const selectedZone = useMemo(
    () => data?.zones.find((z) => z.id === selectedZoneId) ?? null,
    [data, selectedZoneId],
  );

  const nextNodeZoneId = useMemo(() => {
    if (!data?.nextRecommendedNodeId) return null;
    return (
      data.zones.find((z) =>
        z.nodes.some((n) => n.id === data.nextRecommendedNodeId),
      )?.id ?? null
    );
  }, [data]);

  const launchNode = useCallback(
    (node: NodeStatus) => {
      router.push(`/play/${node.mode}?story=${encodeURIComponent(node.id)}`);
    },
    [router],
  );

  if (error) {
    return (
      <div className={cn('flex h-full items-center justify-center', className)}>
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={cn('flex h-full items-center justify-center', className)}>
        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          className="text-sm tracking-[0.3em] text-cyan-400/80"
        >
          SYNCING INITIATIVE
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative flex h-full min-h-[640px] flex-col overflow-hidden bg-[#05070d]',
        className,
      )}
    >
      {/* Header */}
      <header className="relative z-10 flex items-end justify-between px-5 pb-3 pt-5">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.35em] text-cyan-400/70">
            Story Mode
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-white">
            {data.campaign.title}
          </h1>
          <p className="mt-0.5 text-xs text-slate-400">{data.campaign.tagline}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-slate-500">
            Progress
          </p>
          <p className="text-lg font-semibold tabular-nums text-cyan-300">
            {data.completionPct}%
          </p>
          <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-slate-400">
            <Trophy className="h-3 w-3 text-amber-400" aria-hidden />
            {data.badgesEarned.length}/13
          </div>
        </div>
      </header>

      {/* Progress bar */}
      <div className="relative z-10 mx-5 h-1 overflow-hidden rounded-full bg-slate-800">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
          initial={{ width: 0 }}
          animate={{ width: `${data.completionPct}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </div>

      {/* Board */}
      <div className="relative z-0 flex-1">
        <TrailLayer zones={data.zones} />
        {data.zones.map((zone, i) => (
          <ZoneWaypoint
            key={zone.id}
            zone={zone}
            index={i}
            isNext={zone.id === nextNodeZoneId}
            onSelect={() => setSelectedZoneId(zone.id)}
          />
        ))}
      </div>

      {/* Zone detail panel */}
      <AnimatePresence>
        {selectedZone ? (
          <ZonePanel
            key={selectedZone.id}
            zone={selectedZone}
            nextRecommendedNodeId={data.nextRecommendedNodeId}
            onClose={() => setSelectedZoneId(null)}
            onLaunch={launchNode}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trail layer — neon-cyan paths between zones, dim past the frontier
// ---------------------------------------------------------------------------

function TrailLayer({ zones }: { zones: ZoneStatus[] }) {
  const byId = useMemo(
    () => new Map(zones.map((z) => [z.id as string, z])),
    [zones],
  );

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <filter id="trail-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {zones.map((zone) => {
        if (zone.unlock.requiresZone === null) return null;
        const from = byId.get(zone.unlock.requiresZone);
        if (!from) return null;
        const lit = zone.unlocked;
        const d = trailPath(from.position, zone.position);
        return (
          <g key={`trail-${zone.id}`}>
            <path
              d={d}
              fill="none"
              stroke={lit ? '#22d3ee' : '#1e293b'}
              strokeWidth={lit ? 0.45 : 0.35}
              strokeDasharray={lit ? undefined : '1.2 1.4'}
              strokeLinecap="round"
              opacity={lit ? 0.9 : 0.55}
              filter={lit ? 'url(#trail-glow)' : undefined}
              vectorEffect="non-scaling-stroke"
            />
            {lit ? (
              <motion.circle
                r={0.7}
                fill="#a5f3fc"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
              >
                <animateMotion dur="2.4s" repeatCount="indefinite" path={d} />
              </motion.circle>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function trailPath(
  a: { x: number; y: number },
  b: { x: number; y: number },
): string {
  // Gentle curve: control point offset perpendicular to the segment.
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.max(Math.hypot(dx, dy), 0.001);
  const cx = mx - (dy / len) * 6;
  const cy = my + (dx / len) * 6;
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
}

// ---------------------------------------------------------------------------
// Zone waypoint
// ---------------------------------------------------------------------------

function ZoneWaypoint({
  zone,
  index,
  isNext,
  onSelect,
}: {
  zone: ZoneStatus;
  index: number;
  isNext: boolean;
  onSelect: () => void;
}) {
  const state: 'locked' | 'open' | 'cleared' = zone.cleared
    ? 'cleared'
    : zone.unlocked
      ? 'open'
      : 'locked';

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      className="group absolute z-10 -translate-x-1/2 -translate-y-1/2 outline-none"
      style={{ left: `${zone.position.x}%`, top: `${zone.position.y}%` }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 260, damping: 20 }}
      whileHover={{ scale: 1.12 }}
      whileTap={{ scale: 0.94 }}
      aria-label={`${zone.title} — ${
        state === 'cleared' ? 'cleared' : state === 'open' ? 'open' : `locked: ${zone.unlockLabel}`
      }`}
    >
      {/* Frontier pulse */}
      {isNext && state === 'open' ? (
        <motion.span
          className="absolute inset-0 -m-3 rounded-full"
          style={{ boxShadow: `0 0 0 2px ${zone.accent}55` }}
          animate={{ scale: [1, 1.35], opacity: [0.8, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
          aria-hidden
        />
      ) : null}

      <span
        className={cn(
          'relative flex h-12 w-12 items-center justify-center rounded-full border-2 transition-colors',
          state === 'locked' &&
            'border-slate-700 bg-slate-900/90 text-slate-600',
          state === 'open' &&
            'border-cyan-400/80 bg-slate-900 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.45)]',
          state === 'cleared' &&
            'border-amber-400/80 bg-slate-900 text-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.35)]',
        )}
        style={
          state === 'open'
            ? { borderColor: zone.accent, boxShadow: `0 0 18px ${zone.accent}66` }
            : undefined
        }
      >
        {state === 'locked' ? (
          <Lock className="h-4 w-4" aria-hidden />
        ) : state === 'cleared' ? (
          <Trophy className="h-4 w-4" aria-hidden />
        ) : (
          <Play className="h-4 w-4" aria-hidden />
        )}
        {/* Rail progress dots */}
        <span className="absolute -bottom-2 flex gap-0.5" aria-hidden>
          {zone.nodes
            .filter((n) => n.kind === 'rail')
            .map((n) => (
              <span
                key={n.id}
                className={cn(
                  'h-1 w-1 rounded-full',
                  n.completed ? 'bg-cyan-300' : 'bg-slate-700',
                )}
              />
            ))}
        </span>
      </span>

      <span
        className={cn(
          'mt-3 block max-w-[7.5rem] text-center text-[10px] font-semibold uppercase tracking-wider',
          state === 'locked' ? 'text-slate-600' : 'text-slate-200',
        )}
      >
        {zone.title}
      </span>
      {state === 'locked' ? (
        <span className="mt-0.5 block max-w-[8.5rem] text-center text-[9px] leading-tight text-slate-600 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          {zone.unlockLabel}
        </span>
      ) : null}
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Zone detail panel (bottom sheet)
// ---------------------------------------------------------------------------

function ZonePanel({
  zone,
  nextRecommendedNodeId,
  onClose,
  onLaunch,
}: {
  zone: ZoneStatus;
  nextRecommendedNodeId: string | null;
  onClose: () => void;
  onLaunch: (node: NodeStatus) => void;
}) {
  return (
    <>
      <motion.div
        className="absolute inset-0 z-20 bg-black/60 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden
      />
      <motion.section
        className="absolute inset-x-0 bottom-0 z-30 max-h-[72%] overflow-y-auto rounded-t-2xl border-t border-slate-800 bg-[#0a0f1a] p-5 pb-8"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        role="dialog"
        aria-modal="true"
        aria-label={zone.title}
      >
        <div className="mx-auto max-w-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p
                className="text-[10px] font-medium uppercase tracking-[0.3em]"
                style={{ color: zone.accent }}
              >
                Act {zone.act} · {zone.mode}
              </p>
              <h2 className="mt-1 text-lg font-bold text-white">{zone.title}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              aria-label="Close zone details"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            {zone.narrative}
          </p>

          {!zone.unlocked ? (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-xs text-slate-400">
              <Lock className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
              Unlock: {zone.unlockLabel}
            </div>
          ) : null}

          <ul className="mt-5 space-y-2">
            {zone.nodes.map((node) => (
              <NodeRow
                key={node.id}
                node={node}
                accent={zone.accent}
                isRecommended={node.id === nextRecommendedNodeId}
                onLaunch={onLaunch}
              />
            ))}
          </ul>
        </div>
      </motion.section>
    </>
  );
}

function NodeRow({
  node,
  accent,
  isRecommended,
  onLaunch,
}: {
  node: NodeStatus;
  accent: string;
  isRecommended: boolean;
  onLaunch: (node: NodeStatus) => void;
}) {
  const playable = node.unlocked && !node.completed;
  const isBoss = node.kind === 'boss';

  return (
    <li>
      <button
        type="button"
        disabled={!playable}
        onClick={() => onLaunch(node)}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors',
          node.completed &&
            'border-slate-800 bg-slate-900/40 opacity-70',
          playable &&
            'border-cyan-500/40 bg-slate-900/80 hover:border-cyan-400 hover:bg-slate-800/80',
          !node.unlocked &&
            !node.completed &&
            'border-slate-800/70 bg-slate-900/30 opacity-50',
          isBoss && playable && 'border-amber-500/50 hover:border-amber-400',
        )}
      >
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
            node.completed
              ? 'border-cyan-400/50 text-cyan-300'
              : playable
                ? 'border-slate-600 text-slate-200'
                : 'border-slate-800 text-slate-600',
          )}
          style={playable ? { borderColor: isBoss ? '#f59e0b' : accent } : undefined}
          aria-hidden
        >
          {node.completed ? (
            <Star className="h-3.5 w-3.5 fill-current" />
          ) : isBoss ? (
            <Award className="h-4 w-4" />
          ) : !node.unlocked ? (
            <Lock className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                'truncate text-sm font-semibold',
                node.completed || playable ? 'text-white' : 'text-slate-500',
              )}
            >
              {node.title}
            </span>
            {isBoss ? (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400">
                Boss
              </span>
            ) : null}
            {isRecommended && playable ? (
              <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-300">
                Next
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-400">
            {node.description}
          </span>
          <span className="mt-1 flex items-center gap-3 text-[11px] tabular-nums text-slate-500">
            <span>Target {node.targetScore.toLocaleString()}</span>
            <span className="text-cyan-400/80">+{node.rewardLC} LC</span>
            {node.badge ? (
              <span className="text-amber-400/80">{node.badge.name}</span>
            ) : null}
          </span>
        </span>

        {playable ? (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        ) : null}
      </button>
    </li>
  );
}
