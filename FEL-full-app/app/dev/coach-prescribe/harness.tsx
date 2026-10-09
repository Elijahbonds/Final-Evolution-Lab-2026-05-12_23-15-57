'use client';
// The dev harness's client half (MIRROR-COACH P3, 2026-09-26): the coach's panel pointed at ./api, the Prep section the
// adds land in (as a fresh load returns it), and the athlete's own view of the same screen.
import { useCallback, useEffect, useState } from 'react';
import { ScreenPrescriptions } from '@/components/coach/screen-prescriptions';
import { ScreenNextSteps } from '@/components/mirror/screen-next-steps';
import type { ProgramTree } from '@/lib/coach/loop';
import type { ScreenId } from '@/lib/mirror/screen';
import type { StationGrade } from '@/lib/mirror/stationGraders';

interface Loaded { tree: ProgramTree; sessions: { id: string; label: string }[]; screen: ScreenId; grades: StationGrade[] }

export function CoachPrescribeHarness({ devCase, reset, screenId }: { devCase: string; reset: boolean; screenId?: string }) {
  const api = `/dev/coach-prescribe/api?case=${encodeURIComponent(devCase)}${screenId ? `&screenId=${encodeURIComponent(screenId)}` : ''}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [missing, setMissing] = useState('');
  const load = useCallback(async () => {
    const r = await fetch(`${api}&op=load`);
    if (!r.ok) { setMissing(await r.text()); return; }
    setLoaded(await r.json());
  }, [api]);
  useEffect(() => {
    void (async () => { if (reset) await fetch(`${api}&op=reset`); await load(); })();
  }, [api, reset, load]);

  const add = async (_sessionId: string, body: Record<string, unknown>): Promise<boolean> => {
    const r = await fetch(`${api}&op=add`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) return false;
    await load();
    return true;
  };

  if (missing) return <div className="text-sm text-white/40">No screen to draft from: {missing}</div>;
  if (!loaded) return <div className="text-sm text-white/40">Loading…</div>;
  const prep = loaded.tree.blocks.flatMap((b) => b.sessions.flatMap((s) => s.exercises.filter((e) => e.section === 'prep').map((e) => ({ ...e, where: `${b.label} · ${s.label}` }))));
  return (
    <div className="space-y-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Dev harness · case {devCase} · fixture coach + client</p>
      <div className="fel-card space-y-3 rounded-xl p-4" data-testid="coach-side">
        <div className="text-[11px] uppercase tracking-wider text-white/40">Programs I coach · {loaded.tree.name}</div>
        <ScreenPrescriptions clientId="dev-client" sessions={loaded.sessions} onAdd={add} draftUrl={`${api}&op=draft`} />
        <div className="rounded-lg border border-white/6 p-3 text-xs" data-testid="prep">
          <div className="text-white/45">Prep, as a fresh load of the program returns it ({prep.length})</div>
          <ul className="mt-1 space-y-1">
            {prep.map((e) => (
              <li key={e.id} data-prep-exercise={e.exerciseId} className="text-white/80">
                {e.where}: {e.name} — {e.sets}×{e.reps}{e.load ? ` @ ${e.load}` : ''} · rest {e.restSeconds}s
                <span className="block text-white/40">{e.coachNote}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div data-testid="athlete-side">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">The athlete, after the same screen</p>
        <ScreenNextSteps screen={loaded.screen} grades={loaded.grades} />
      </div>
    </div>
  );
}
