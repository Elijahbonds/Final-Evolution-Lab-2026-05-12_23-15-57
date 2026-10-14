'use client';

// The viewport: a canvas the StudioViewport (lib/nexus-studio/viewport.ts) mounts the mode's own look stack into. Babylon
// is imported on the client only, after mount. The document flows in (every change re-realises what it touched); the
// selection and gizmo drags flow out as callbacks the shell turns into commands.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { StudioReplayAngle, StudioTransform, StudioVenue, V3 } from '@/lib/nexus-studio/doc';
import type { BudgetSample } from '@/lib/nexus-studio/budget';
import type { SnapSettings } from '@/lib/nexus-studio/snap';
import type { CameraMode, StudioViewport, Tool } from '@/lib/nexus-studio/viewport';
import { DRAG_MIME } from './asset-browser';
import { C } from './ui';

export interface ViewportHandle {
  previewIntro(kind: 'establish' | 'walkIn'): boolean;
  previewReplay(angle: StudioReplayAngle): void;
  stopPreview(): void;
  frame(): void;
  focusPoint(): V3;
  nudge(id: string, dx: number, dz: number): StudioTransform | null;
}

export interface ViewportPanelProps {
  venue: StudioVenue;
  selected: string | null;
  tool: Tool;
  camera: CameraMode;
  snap: SnapSettings;
  grid: boolean;
  phone: boolean;
  onSelect(id: string | null): void;
  onTransform(id: string, t: StudioTransform): void;
  onDropItem(itemId: string, at: V3): void;
  onStats(s: BudgetSample): void;
  onPreviewEnd(): void;
}

export const ViewportPanel = forwardRef<ViewportHandle, ViewportPanelProps>(function ViewportPanel(p, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vpRef = useRef<StudioViewport | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const cbs = useRef(p); cbs.current = p;
  const venueRef = useRef(p.venue); venueRef.current = p.venue;

  // mount once (and again on the tier switch)
  useEffect(() => {
    let alive = true;
    const canvas = canvasRef.current; if (!canvas) return;
    setStatus('loading');
    void import('@/lib/nexus-studio/viewport').then(async ({ StudioViewport: VP }) => {
      if (!alive) return;
      const vp = new VP(canvas, {
        onSelect: (id) => cbs.current.onSelect(id),
        onTransform: (id, t) => cbs.current.onTransform(id, t),
        onStats: (s) => cbs.current.onStats(s),
        onPreviewEnd: () => cbs.current.onPreviewEnd(),
        onError: (m) => { setError(m); setStatus('error'); },
      });
      vpRef.current = vp;
      await vp.load(venueRef.current, p.phone ? 'mobile' : undefined);
      if (!alive) { vp.dispose(); return; }
      vp.setTool(cbs.current.tool); vp.setCamera(cbs.current.camera); vp.setSnap(cbs.current.snap); vp.setGrid(cbs.current.grid);
      vp.select(cbs.current.selected);
      setStatus((s) => (s === 'error' ? s : 'ready'));
      (window as unknown as { __NEXUS_STUDIO__?: unknown }).__NEXUS_STUDIO__ = vp;   // the capture rig and probes read the live viewport
    }).catch((e) => { setError(e instanceof Error ? e.message : String(e)); setStatus('error'); });
    const onResize = () => vpRef.current?.currentStage?.engine.resize();
    window.addEventListener('resize', onResize);
    return () => { alive = false; window.removeEventListener('resize', onResize); vpRef.current?.dispose(); vpRef.current = null; };
    // the tier is the only thing that rebuilds the engine; everything else is pushed below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.phone]);

  useEffect(() => { if (status === 'ready') void vpRef.current?.update(p.venue); }, [p.venue, status]);
  useEffect(() => { vpRef.current?.select(p.selected); }, [p.selected, status]);
  useEffect(() => { vpRef.current?.setTool(p.tool); }, [p.tool, status]);
  useEffect(() => { vpRef.current?.setCamera(p.camera); }, [p.camera, status]);
  useEffect(() => { vpRef.current?.setSnap(p.snap); }, [p.snap, status]);
  useEffect(() => { vpRef.current?.setGrid(p.grid); }, [p.grid, status]);

  useImperativeHandle(ref, () => ({
    previewIntro: (k) => vpRef.current?.previewIntro(k) ?? false,
    previewReplay: (a) => vpRef.current?.previewReplay(a),
    stopPreview: () => vpRef.current?.stopPreview(),
    frame: () => vpRef.current?.frame(),
    focusPoint: () => vpRef.current?.focusPoint() ?? [0, 0, 0],
    nudge: (id, dx, dz) => vpRef.current?.nudge(id, dx, dz) ?? null,
  }), []);

  return (
    <div className="relative min-h-0 flex-1" style={{ background: '#000' }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(DRAG_MIME); const vp = vpRef.current; const cv = canvasRef.current;
        if (!id || !vp || !cv) return;
        e.preventDefault();
        const r = cv.getBoundingClientRect();
        const at = vp.groundAt(e.clientX - r.left, e.clientY - r.top) ?? vp.focusPoint();
        cbs.current.onDropItem(id, at);
      }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full outline-none" style={{ touchAction: 'none' }} tabIndex={0} aria-label="Venue viewport: drag to orbit, right-drag to pan, wheel to zoom, click to select" data-testid="studio-canvas" />
      {status !== 'ready' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px]" style={{ color: status === 'error' ? C.crimson : C.dim }}>
          {status === 'error' ? `The viewport could not start: ${error}` : 'Building the venue on the mode’s own engine path…'}
        </div>
      )}
    </div>
  );
});
