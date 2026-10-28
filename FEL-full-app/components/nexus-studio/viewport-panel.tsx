'use client';

// The viewport: a canvas the StudioViewport (lib/nexus-studio/viewport.ts) mounts the mode's own look stack into. Babylon
// is imported on the client only, after mount. The document flows in (every change re-realises what it touched); the
// selection and gizmo drags flow out as callbacks the shell turns into commands.
//
// §11 SELECTING MORE THAN ONE. Ctrl/⌘-click toggles (the viewport hears it: a Ctrl-drag still pans). Shift-click toggles and
// Shift-drag draws a box that ADDS what it frames; with the Select tool (Q) a drag from empty ground draws a box that REPLACES
// the selection. The box is drawn here, in the DOM: a capture-phase listener on this wrapper takes the pointer before the
// canvas (so the camera never starts an orbit under a box), and the viewport answers which objects the box framed.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { StudioReplayAngle, StudioTransform, StudioVenue, V3 } from '@/lib/nexus-studio/doc';
import type { BudgetSample } from '@/lib/nexus-studio/budget';
import type { SnapSettings } from '@/lib/nexus-studio/snap';
import type { GroupDelta } from '@/lib/nexus-studio/group';
import type { CameraMode, StudioViewport, Tool } from '@/lib/nexus-studio/viewport';
import type { ExportCast } from '@/lib/nexus-studio/cast';
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
  /** §11: the selection, in order (the last is the primary). */
  selection: readonly string[];
  tool: Tool;
  camera: CameraMode;
  snap: SnapSettings;
  grid: boolean;
  phone: boolean;
  /** A click: the object under it (null = empty ground) and whether it toggles (Ctrl / ⌘ / Shift). */
  onPick(id: string | null, mods: { toggle: boolean }): void;
  /** A box: the objects it framed; `add` keeps the selection (Shift), else they replace it (the Select tool). */
  onBox(ids: string[], mode: 'add' | 'replace'): void;
  onTransform(id: string, t: StudioTransform): void;
  /** A group drag's release (§11): one change for the whole selection. */
  onGroupTransform(ids: string[], d: GroupDelta, pivot: V3): void;
  onDropItem(itemId: string, at: V3): void;
  onStats(s: BudgetSample): void;
  onPreviewEnd(): void;
  /** Track 3: the venue's cast, decoded — the viewport stands it on the hero's spot on the real rig. */
  cast?: ExportCast | null;
  /** STUDIO-EASY: a card laid over the 3D view's top-left (the first-court guide), so it never covers a panel or a button. */
  overlay?: ReactNode;
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
        onSelect: (id) => cbs.current.onPick(id, { toggle: false }),
        onPick: (id, mods) => cbs.current.onPick(id, mods),
        onTransform: (id, t) => cbs.current.onTransform(id, t),
        onGroupTransform: (ids, d, pivot) => cbs.current.onGroupTransform(ids, d, pivot),
        onStats: (s) => cbs.current.onStats(s),
        onPreviewEnd: () => cbs.current.onPreviewEnd(),
        onError: (m) => { setError(m); setStatus('error'); },
      });
      vpRef.current = vp;
      await vp.load(venueRef.current, phoneRef.current ? 'mobile' : undefined);
      if (!alive) { vp.dispose(); return; }
      vp.setTool(cbs.current.tool); vp.setCamera(cbs.current.camera); vp.setSnap(cbs.current.snap); vp.setGrid(cbs.current.grid);
      vp.setSelection(cbs.current.selection);
      setStatus((s) => (s === 'error' ? s : 'ready'));
      (window as unknown as { __NEXUS_STUDIO__?: unknown }).__NEXUS_STUDIO__ = vp;   // the capture rig and probes read the live viewport
    }).catch((e) => { setError(e instanceof Error ? e.message : String(e)); setStatus('error'); });
    const onResize = () => vpRef.current?.currentStage?.engine.resize();
    window.addEventListener('resize', onResize);
    return () => { alive = false; window.removeEventListener('resize', onResize); vpRef.current?.dispose(); vpRef.current = null; };
  }, []);

  // the meter's tier switch re-mounts the stage on the SAME engine (a second engine on this canvas would never draw)
  const phoneRef = useRef(p.phone);
  useEffect(() => {
    if (phoneRef.current === p.phone) return;
    phoneRef.current = p.phone;
    const vp = vpRef.current; if (!vp) return;
    setStatus('loading');
    void vp.load(venueRef.current, p.phone ? 'mobile' : undefined).then(() => setStatus((s) => (s === 'error' ? s : 'ready')));
  }, [p.phone]);

  useEffect(() => { if (status === 'ready') void vpRef.current?.update(p.venue); }, [p.venue, status]);
  const selKey = p.selection.join(',');
  useEffect(() => { vpRef.current?.setSelection(cbs.current.selection); }, [selKey, status]);
  useEffect(() => { if (status === 'ready') vpRef.current?.setCast(p.cast ?? null); }, [p.cast, status]);
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

  // §11: the box. `pending` until the pointer travels 5 px (a Shift-click is a toggle, not a box)
  const [box, setBox] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
  const boxRef = useRef<{ a: { x: number; y: number }; b: { x: number; y: number }; drawing: boolean; mode: 'add' | 'replace'; id: number } | null>(null);
  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  };
  const onDownCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    const vp = vpRef.current;
    if (!vp || e.button !== 0 || e.target !== canvasRef.current || vp.previewing) return;
    const at = local(e);
    const shift = e.shiftKey;
    // the Select tool: a drag from empty ground boxes; from an object it is a click (the viewport selects it)
    if (!shift && !(cbs.current.tool === 'select' && !vp.pickAt(at.x, at.y))) return;
    e.stopPropagation(); e.preventDefault();
    boxRef.current = { a: at, b: at, drawing: false, mode: shift ? 'add' : 'replace', id: e.pointerId };
    const move = (ev: PointerEvent) => {
      const b = boxRef.current; if (!b || ev.pointerId !== b.id) return;
      b.b = local(ev);
      if (!b.drawing && Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y) > 5) b.drawing = true;
      if (b.drawing) setBox({ a: b.a, b: b.b });
    };
    const up = (ev: PointerEvent) => {
      const b = boxRef.current; if (!b || ev.pointerId !== b.id) return;
      window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true);
      boxRef.current = null; setBox(null);
      ev.stopPropagation();
      const v = vpRef.current; if (!v) return;
      if (b.drawing) cbs.current.onBox(v.idsInRect(b.a, b.b), b.mode);
      else cbs.current.onPick(v.pickAt(b.a.x, b.a.y), { toggle: shift });
    };
    window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true);
  };

  return (
    <div className="relative min-h-0 flex-1" style={{ background: '#000' }} onPointerDownCapture={onDownCapture}
      onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(DRAG_MIME); const vp = vpRef.current; const cv = canvasRef.current;
        if (!id || !vp || !cv) return;
        e.preventDefault();
        const r = cv.getBoundingClientRect();
        const at = vp.groundAt(e.clientX - r.left, e.clientY - r.top) ?? vp.focusPoint();
        cbs.current.onDropItem(id, at);
      }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full outline-none" style={{ touchAction: 'none' }} tabIndex={0} aria-label="Venue viewport: drag to orbit, right-drag to pan, wheel to zoom, click to select, Shift- or Ctrl-click to add, Shift-drag to box-select" data-testid="studio-canvas" />
      {p.overlay && <div className="pointer-events-none absolute inset-x-2 top-2 z-20 md:right-auto">{p.overlay}</div>}
      {box && (
        <div aria-hidden data-testid="select-box" className="pointer-events-none absolute border"
          style={{ left: Math.min(box.a.x, box.b.x), top: Math.min(box.a.y, box.b.y), width: Math.abs(box.b.x - box.a.x), height: Math.abs(box.b.y - box.a.y), borderColor: C.cyan, background: 'rgba(0,229,255,0.08)' }} />
      )}
      {status !== 'ready' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px]" style={{ color: status === 'error' ? C.crimson : C.dim }}>
          {status === 'error'
            ? <span className="max-w-sm px-4 text-center">The 3D view could not start. Reload the page to try again.<span className="mt-1 block text-[12px]" style={{ color: C.dim }}>{error}</span></span>
            : 'Loading the court…'}
        </div>
      )}
    </div>
  );
});
