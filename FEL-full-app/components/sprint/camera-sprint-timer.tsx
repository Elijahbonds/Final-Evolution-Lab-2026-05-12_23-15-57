'use client';

// CameraSprintTimer — the camera timing source for combine day's sprint and 5-10-5 stations (SPRINT-SPEED, 2026-10-25).
//
// Same contract as combine's <HandTimer kind onTime={(seconds) => …} /> (components/combine/hand-timer.tsx on PR #453),
// so a station the coach sets to "camera" swaps one for the other; onTime's second argument carries `method: 'camera'`
// and the ± for the report's "camera" mark. Mount it ONLY for an athlete whose combine access says `camera` (a verified
// adult); everyone else is hand-timed. lib/sprint/cameraSprint.ts is the adapter and says what the wiring takes.
//
// It runs one gate (finish-line phone) run for a sprint station, or a 5-10-5, through the same runner /train/speed uses,
// and offers the time to record. Nothing but the seconds leaves it.
import { useCallback, useMemo, useState } from 'react';
import { Video } from 'lucide-react';
import { cameraAttempt, cameraSprint, type CameraTimeMeta } from '@/lib/sprint/cameraSprint';
import type { RunResult } from '@/lib/sprint/session';
import { ESTIMATE_LINE, timeWithBand } from '@/lib/sprint/copy';
import { SprintRunner, type RunBase } from './sprint-runner';
import { RunResultCard } from './run-result';

export function CameraSprintTimer({ kind, variant, onTime }: {
  kind: 'sprint' | 'agility'; variant: string; onTime: (seconds: number, meta: CameraTimeMeta) => void;
}) {
  const [last, setLast] = useState<RunResult | null>(null);
  const base: RunBase | null = useMemo(() => {
    if (!cameraSprint.supports(kind, variant)) return null;
    if (kind === 'agility') return { test: 'agility', label: '5-10-5', start: 'movement' };
    const m = cameraSprint.distanceM(variant);
    return m === null ? null : { test: 'gate', label: variant.replace(/(\d)(yd|m)$/, '$1 $2'), distanceM: m, start: 'go', point: 'torso' };
  }, [kind, variant]);
  const onResult = useCallback((r: RunResult) => setLast(r), []);
  if (!base) return <p className="text-sm text-white/60" data-camera-timer="unsupported">The camera does not time this drill. Hand-time it.</p>;
  const ok = last?.ok && last.timeS !== null ? last : null;
  return (
    <div className="space-y-3" data-camera-timer={ok ? 'read' : 'ready'}>
      <SprintRunner base={base} onResult={onResult} />
      {last && <RunResultCard result={last} />}
      {ok && ok.timeS !== null && (
        <button type="button" data-camera-keep-time
          onClick={() => { const a = cameraAttempt({ timeS: ok.timeS as number, sdS: ok.sdS ?? 0, startKind: ok.startKind ?? 'movement', reactionIncluded: ok.reactionIncluded }); onTime(a.seconds, a.meta); setLast(null); }}
          className="min-h-12 w-full rounded-xl bg-white font-black text-black">
          Record {timeWithBand(ok.timeS, ok.sdS)} (camera)
        </button>
      )}
      <p className="flex items-center gap-1.5 text-[11px] text-white/45"><Video className="h-3.5 w-3.5" /> {ESTIMATE_LINE}</p>
    </div>
  );
}
