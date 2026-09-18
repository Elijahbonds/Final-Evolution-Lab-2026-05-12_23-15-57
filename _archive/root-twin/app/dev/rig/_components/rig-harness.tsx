'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { RigValidationHandle } from '@/lib/babylon/scenes/RigValidationScene';
import { INSPECT_TARGETS } from '@/lib/babylon/avatar/RigValidator';

// Phase-0 harness UI. Loads a candidate rig into RigValidationScene and
// exposes the inspect / scrub / measure controls the M65 brief calls for.
// Everything logs to the console with the [FEL-RIG] prefix as well.
export function RigHarness() {
  const params = useSearchParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<RigValidationHandle | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [msg, setMsg] = useState<string>('');
  const [scrub, setScrub] = useState(0);

  const avatarUrl = params?.get('avatar') ?? '/models/candidate.glb';
  const animUrl = params?.get('anim') ?? '/anim/dunk.glb';

  useEffect(() => {
    let disposed = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setStatus('loading');
    setMsg(`Loading ${avatarUrl}…`);
    (async () => {
      try {
        const { createRigValidationScene } = await import('@/lib/babylon/scenes/RigValidationScene');
        const handle = await createRigValidationScene(canvas, avatarUrl, animUrl);
        if (disposed) { handle.dispose(); return; }
        handleRef.current = handle;
        setStatus('ready');
        const r = handle.report;
        setMsg(r
          ? `Bones: ${r.boneCount} · Tris: ${r.triangleCount} · Missing: ${r.missingRequired.length ? r.missingRequired.join(', ') : 'none'}${r.hasPrefixedNames ? ' · ⚠ mixamorig: PREFIX REJECTED' : ''}`
          : 'No skeleton found in asset.');
      } catch (e: any) {
        if (disposed) return;
        setStatus('error');
        setMsg(`[FEL-RIG] load failed: ${e?.message ?? e}. Provide a candidate GLB via ?avatar=/models/candidate.glb&anim=/anim/dunk.glb`);
        console.error('[FEL-RIG]', e);
      }
    })();
    return () => { disposed = true; handleRef.current?.dispose(); handleRef.current = null; };
  }, [avatarUrl, animUrl]);

  const h = () => handleRef.current;

  return (
    <div className="min-h-screen bg-[#050505] text-white p-4 space-y-3">
      <div>
        <h1 className="text-xl font-bold text-[#00E5FF]">Phase 0 — Rig Validation Gate</h1>
        <p className="text-sm text-white/70">Candidate: <code className="text-[#FFD700]">{avatarUrl}</code> · Anim: <code className="text-[#FFD700]">{animUrl}</code></p>
      </div>

      <div className="relative aspect-video w-full max-w-4xl rounded-lg overflow-hidden bg-[#0d0f14] border border-white/10">
        <canvas ref={canvasRef} className="h-full w-full block" />
      </div>

      <div className={`text-sm ${status === 'error' ? 'text-[#FF3366]' : 'text-[#00FF9D]'}`}>{msg}</div>

      <div className="flex flex-wrap gap-2">
        {INSPECT_TARGETS.map((t) => (
          <button key={t} onClick={() => h()?.inspect(t)} disabled={status !== 'ready'}
            className="px-3 py-1.5 rounded bg-[#1a1a20] hover:bg-[#26262e] disabled:opacity-40 text-sm">Inspect {t}</button>
        ))}
        <button onClick={() => h()?.inspect('full')} disabled={status !== 'ready'}
          className="px-3 py-1.5 rounded bg-[#1a1a20] hover:bg-[#26262e] disabled:opacity-40 text-sm">Full frame</button>
        <button onClick={() => h()?.measure()} disabled={status !== 'ready'}
          className="px-3 py-1.5 rounded bg-[#A855F7]/30 hover:bg-[#A855F7]/50 disabled:opacity-40 text-sm">measure()</button>
        <button onClick={() => h()?.toggleSkeleton()} disabled={status !== 'ready'}
          className="px-3 py-1.5 rounded bg-[#1a1a20] hover:bg-[#26262e] disabled:opacity-40 text-sm">Skeleton</button>
        <button onClick={() => h()?.toggleWireframe()} disabled={status !== 'ready'}
          className="px-3 py-1.5 rounded bg-[#1a1a20] hover:bg-[#26262e] disabled:opacity-40 text-sm">Wireframe</button>
        <button onClick={() => h()?.play()} disabled={status !== 'ready'}
          className="px-3 py-1.5 rounded bg-[#00FF9D]/20 hover:bg-[#00FF9D]/40 disabled:opacity-40 text-sm">Play</button>
        <button onClick={() => h()?.pause()} disabled={status !== 'ready'}
          className="px-3 py-1.5 rounded bg-[#1a1a20] hover:bg-[#26262e] disabled:opacity-40 text-sm">Pause</button>
      </div>

      <div className="flex items-center gap-3 max-w-xl">
        <span className="text-xs text-white/60">scrub</span>
        <input type="range" min={0} max={1} step={0.01} value={scrub} disabled={status !== 'ready'}
          onChange={(e) => { const v = parseFloat(e.target.value); setScrub(v); h()?.scrub(v); }}
          className="flex-1" />
        <span className="text-xs text-[#FFD700] w-10 text-right">{scrub.toFixed(2)}</span>
        <button onClick={() => h()?.step(1)} disabled={status !== 'ready'}
          className="px-2 py-1 rounded bg-[#1a1a20] hover:bg-[#26262e] disabled:opacity-40 text-xs">+1f</button>
        <button onClick={() => h()?.step(-1)} disabled={status !== 'ready'}
          className="px-2 py-1 rounded bg-[#1a1a20] hover:bg-[#26262e] disabled:opacity-40 text-xs">-1f</button>
      </div>
    </div>
  );
}
