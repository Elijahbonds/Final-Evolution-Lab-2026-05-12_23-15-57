'use client';
// The dev harness's client half (MIRROR-COACH P2, 2026-09-25): load the program from ./api (the same loadProgram the
// real GET runs), render the real ProgramBuilder pointed at ./api?op=action, and show what a fresh load returns so a
// probe — or a person — can compare the screen with the stored tree.
import { useCallback, useEffect, useState } from 'react';
import { ProgramBuilder, type BuilderCatalogueItem } from '@/components/coach/program-builder';
import type { ProgramTree } from '@/lib/coach/loop';

interface Loaded { program: { tree: ProgramTree; role: string }; warnings: Record<string, unknown[]> }

export function BuilderHarness({ reset }: { reset: boolean }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [catalogue, setCatalogue] = useState<BuilderCatalogueItem[]>([]);
  const [stored, setStored] = useState<Loaded | null>(null);

  const load = useCallback(async () => {
    const [l, c] = await Promise.all([fetch('/dev/program-builder/api?op=load').then((r) => r.json()), fetch('/dev/program-builder/api?op=catalogue').then((r) => r.json())]);
    setLoaded(l); setCatalogue(c); setStored(l);
  }, []);
  useEffect(() => {
    void (async () => { if (reset) await fetch('/dev/program-builder/api?op=reset'); await load(); })();
  }, [reset, load]);

  if (!loaded) return <div className="text-white/40 text-sm">Loading…</div>;
  return (
    <div className="space-y-4">
      <div className="fel-card rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wider text-white/40">Programs I coach · {loaded.program.tree.name}</div>
          <button data-testid="reload" onClick={() => void load()} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/60">Reload from server</button>
        </div>
        <ProgramBuilder
          tree={loaded.program.tree}
          completedSessionIds={[]}
          catalogue={catalogue}
          endpoint="/dev/program-builder/api?op=action"
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
