'use client';
// The coach-loop harness's client half (MIRROR-COACH P2 live proof, 2026-09-26): ?view=builder renders the real
// ProgramBuilder as the coach, ?view=today the real TodayView as the client, ?view=training the real /training
// step-through — all three over ONE store (./api), so the client screen shows what the coach's saves stored.
import { useCallback, useEffect, useState } from 'react';
import { ProgramBuilder, type BuilderCatalogueItem } from '@/components/coach/program-builder';
import { TodayView } from '@/app/coach/_components/today-view';
import { ClientSessionView } from '@/components/training/client-view/ClientSessionView';
import type { ProgramTree } from '@/lib/coach/loop';

const API = '/dev/coach-loop/api';
const TODAY_API = { today: `${API}?op=today`, log: `${API}?op=log`, messages: null };

interface Loaded { program: { tree: ProgramTree; role: string }; warnings: Record<string, unknown[]> }

function Builder() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [catalogue, setCatalogue] = useState<BuilderCatalogueItem[]>([]);
  const [stored, setStored] = useState<Loaded | null>(null);
  const load = useCallback(async () => {
    const [l, c] = await Promise.all([fetch(`${API}?op=load`).then((r) => r.json()), fetch(`${API}?op=catalogue`).then((r) => r.json())]);
    setLoaded(l); setCatalogue(c); setStored(l);
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!loaded) return <div className="text-white/40 text-sm">Loading…</div>;
  return (
    <div className="space-y-4">
      <div className="fel-card rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-wider text-white/40">Coach · Programs I coach · {loaded.program.tree.name}</div>
          <button data-testid="reload" onClick={() => void load()} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/60">Reload from server</button>
        </div>
        <ProgramBuilder
          tree={loaded.program.tree}
          completedSessionIds={[]}
          catalogue={catalogue}
          endpoint={`${API}?op=action`}
          onTree={(tree) => setLoaded((l) => (l ? { ...l, program: { ...l.program, tree } } : l))}
        />
      </div>
      <details className="fel-card rounded-xl p-4 text-xs text-white/60">
        <summary>Stored tree (last load)</summary>
        <pre data-testid="stored" className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap">{JSON.stringify(stored, null, 1)}</pre>
      </details>
    </div>
  );
}

export function CoachLoopHarness({ reset, view }: { reset: boolean; view: 'builder' | 'today' | 'training' }) {
  const [ready, setReady] = useState(!reset);
  useEffect(() => { if (reset) void fetch(`${API}?op=reset`).then(() => setReady(true)); }, [reset]);
  if (!ready) return <div className="text-white/40 text-sm">Resetting…</div>;
  if (view === 'builder') return <Builder />;
  if (view === 'training') return <div data-testid="training"><ClientSessionView api={TODAY_API} /></div>;
  return <TodayView api={TODAY_API} />;
}
