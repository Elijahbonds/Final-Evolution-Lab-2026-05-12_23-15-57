'use client';

// Track 1, the venue / level editor: the scene tree and the asset browser on the left, the viewport (the mode's own
// engine path) in the middle with its toolbar and the budget meter, the inspector on the right.
//
// KEYBOARD (ignored while typing in a field): Ctrl/⌘+Z undo · Ctrl/⌘+Shift+Z or Ctrl+Y redo · Ctrl/⌘+S save ·
// Q select · W move · E rotate · R scale · 1 orbit · 2 pan · 3 fly (WASD, Q/E down/up) · F frame · G grid · N snap ·
// Del / Backspace delete · Ctrl/⌘+D duplicate · arrows nudge a grid step · Esc deselect / stop a preview.

import { useCallback, useEffect, useRef, useState } from 'react';
import { MousePointer2, Move3d, Rotate3d, Scale3d, Orbit, Hand, Plane, Grid3x3, Magnet, Focus } from 'lucide-react';
import { catalogItem, type CatalogItem } from '@/lib/nexus-studio/catalog';
import { deleteObjects, duplicate, moveObject, placeItem, toggleFlag, addVenue, switchVenue } from '@/lib/nexus-studio/edits';
import { DEFAULT_SNAP, SNAP_MOVES, snapTransform, type SnapSettings } from '@/lib/nexus-studio/snap';
import { targetOf, PLAYTEST_TARGETS, DEFAULT_TARGET } from '@/lib/nexus-studio/targets';
import type { BudgetSample } from '@/lib/nexus-studio/budget';
import type { CameraMode, Tool } from '@/lib/nexus-studio/viewport';
import type { StudioTransform, V3 } from '@/lib/nexus-studio/doc';
import type { StudioApi } from './use-studio';
import { AssetBrowser } from './asset-browser';
import { SceneTree } from './scene-tree';
import { Inspector } from './inspector';
import { ViewportPanel, type ViewportHandle } from './viewport-panel';
import { BudgetMeter } from './budget-meter';
import { C, ToolButton } from './ui';

/** Pure: is this key event aimed at a text field (where the editor's shortcuts must not fire)? */
export function typingTarget(t: EventTarget | null): boolean {
  const el = t as { tagName?: string; isContentEditable?: boolean; type?: string } | null;
  if (!el?.tagName) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  return el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'color', 'range'].includes(el.type ?? 'text');
}

export function VenueEditor({ studio }: { studio: StudioApi }) {
  const { venue, doc, selected, setSelected, run, seal } = studio;
  const vp = useRef<ViewportHandle | null>(null);
  const [tool, setTool] = useState<Tool>('move');
  const [camera, setCamera] = useState<CameraMode>('orbit');
  const [snap, setSnap] = useState<SnapSettings>(DEFAULT_SNAP);
  const [grid, setGrid] = useState(true);
  const [phone, setPhone] = useState(false);
  const [left, setLeft] = useState<'scene' | 'assets'>('assets');
  const [stats, setStats] = useState<BudgetSample | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const object = venue?.objects.find((o) => o.id === selected) ?? null;

  const place = useCallback((item: CatalogItem, at?: V3) => {
    if (!venue) return;
    const p = at ?? vp.current?.focusPoint() ?? [0, 0, 0];
    const t = snapTransform({ p, ry: 0, s: 1 }, snap);
    const r = placeItem(venue, item, t.p);
    run(r.cmd); setSelected(r.id);
  }, [venue, snap, run, setSelected]);

  const onTransform = useCallback((id: string, t: StudioTransform) => { if (venue) run(moveObject(venue, id, t)); }, [venue, run]);
  const del = useCallback((id: string) => { if (!venue) return; const c = deleteObjects(venue, [id]); if (c) { run(c); setSelected(null); } }, [venue, run, setSelected]);
  const dup = useCallback((id: string) => { if (!venue) return; const r = duplicate(venue, id); if (r) { run(r.cmd); setSelected(r.id); } }, [venue, run, setSelected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) studio.redo(); else studio.undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); studio.redo(); return; }
      if (mod && k === 's') { e.preventDefault(); studio.save(); return; }
      if (mod && k === 'd') { e.preventDefault(); if (selected) dup(selected); return; }
      if (mod || e.altKey) return;
      if (camera === 'fly' && ['w', 'a', 's', 'd', 'q', 'e'].includes(k)) return;   // the fly camera's keys
      switch (k) {
        case 'q': setTool('select'); break;
        case 'w': setTool('move'); break;
        case 'e': setTool('rotate'); break;
        case 'r': setTool('scale'); break;
        case '1': setCamera('orbit'); break;
        case '2': setCamera('pan'); break;
        case '3': setCamera('fly'); break;
        case 'f': vp.current?.frame(); break;
        case 'g': setGrid((g) => !g); break;
        case 'n': setSnap((s) => ({ ...s, on: !s.on })); break;
        case 'escape': vp.current?.stopPreview(); setSelected(null); break;
        case 'delete': case 'backspace': if (selected) { e.preventDefault(); del(selected); } break;
        case 'arrowleft': case 'arrowright': case 'arrowup': case 'arrowdown': {
          if (!selected || !venue) break;
          e.preventDefault();
          const dx = k === 'arrowleft' ? -1 : k === 'arrowright' ? 1 : 0, dz = k === 'arrowup' ? -1 : k === 'arrowdown' ? 1 : 0;
          const t = vp.current?.nudge(selected, dx, dz);
          if (t) run({ ...moveObject(venue, selected, t, 'Nudge'), group: `nudge:${selected}` });
          break;
        }
        default: return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [studio, selected, venue, camera, del, dup, run, setSelected]);

  if (!venue) return null;
  const target = targetOf(venue.base.target) ?? PLAYTEST_TARGETS[DEFAULT_TARGET];

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr_300px]">
      <aside className="flex min-h-0 flex-col border-r" style={{ borderColor: C.line, background: C.surface }} aria-label="Scene and assets">
        <div className="flex gap-1 px-2 pt-2" role="tablist">
          {(['assets', 'scene'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={left === t} onClick={() => setLeft(t)} className="flex-1 rounded-md py-1 text-[12px] capitalize"
              style={{ background: left === t ? 'rgba(0,229,255,0.12)' : 'transparent', color: left === t ? C.cyan : C.dim }}>{t === 'scene' ? `Scene · ${venue.objects.length}` : 'Assets'}</button>
          ))}
        </div>
        {left === 'assets'
          ? <AssetBrowser onPlace={(i) => place(i)} />
          : <SceneTree venues={doc.venues} activeId={doc.activeVenueId} venue={venue} selected={selected} onSelect={setSelected}
              onToggle={(id, key) => { const o = venue.objects.find((x) => x.id === id); if (o) run(toggleFlag(venue, o, key)); }}
              onSwitchVenue={(id) => { if (id !== doc.activeVenueId) { run(switchVenue(id)); setSelected(null); } }}
              onAddVenue={() => { const r = addVenue(doc, target); run(r.cmd); setSelected(null); }} />}
      </aside>

      <section className="flex min-h-0 flex-col" aria-label="Viewport">
        <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1" style={{ borderColor: C.line, background: C.surface }} role="toolbar" aria-label="Viewport tools">
          <ToolButton title="Select" shortcut="Q" active={tool === 'select'} onClick={() => setTool('select')}><MousePointer2 className="h-4 w-4" /></ToolButton>
          <ToolButton title="Move" shortcut="W" active={tool === 'move'} onClick={() => setTool('move')}><Move3d className="h-4 w-4" /></ToolButton>
          <ToolButton title="Rotate" shortcut="E" active={tool === 'rotate'} onClick={() => setTool('rotate')}><Rotate3d className="h-4 w-4" /></ToolButton>
          <ToolButton title="Scale" shortcut="R" active={tool === 'scale'} onClick={() => setTool('scale')}><Scale3d className="h-4 w-4" /></ToolButton>
          <span className="mx-1 h-5 w-px" style={{ background: C.line }} />
          <ToolButton title="Orbit camera" shortcut="1" active={camera === 'orbit'} onClick={() => setCamera('orbit')}><Orbit className="h-4 w-4" /></ToolButton>
          <ToolButton title="Pan camera" shortcut="2" active={camera === 'pan'} onClick={() => setCamera('pan')}><Hand className="h-4 w-4" /></ToolButton>
          <ToolButton title="Fly camera (WASD, Q/E)" shortcut="3" active={camera === 'fly'} onClick={() => setCamera('fly')}><Plane className="h-4 w-4" /></ToolButton>
          <ToolButton title="Frame selection" shortcut="F" onClick={() => vp.current?.frame()}><Focus className="h-4 w-4" /></ToolButton>
          <span className="mx-1 h-5 w-px" style={{ background: C.line }} />
          <ToolButton title="Grid" shortcut="G" active={grid} onClick={() => setGrid((g) => !g)}><Grid3x3 className="h-4 w-4" /></ToolButton>
          <ToolButton title="Snap" shortcut="N" active={snap.on} onClick={() => setSnap((s) => ({ ...s, on: !s.on }))}><Magnet className="h-4 w-4" /></ToolButton>
          <select aria-label="Snap step" value={snap.move} onChange={(e) => setSnap((s) => ({ ...s, move: Number(e.target.value) }))} className="rounded border bg-transparent px-1 py-0.5 text-[12px]" style={{ borderColor: C.line, color: C.text, background: C.surface }}>
            {SNAP_MOVES.map((m) => <option key={m} value={m}>{m} m · {snap.turn}°</option>)}
          </select>
          {note && <span className="ml-2 text-[11px]" style={{ color: C.gold }}>{note}</span>}
        </div>
        <ViewportPanel ref={vp} venue={venue} selected={selected} tool={tool} camera={camera} snap={snap} grid={grid} phone={phone}
          onSelect={setSelected} onTransform={onTransform} onStats={setStats} onPreviewEnd={() => setNote(null)}
          onDropItem={(id, at) => { const item = catalogItem(id); if (item) place(item, at); }} />
        <div className="border-t" style={{ borderColor: C.line, background: C.surface }}>
          <BudgetMeter sample={stats} budgetKey={target.budgetKey} phone={phone} onPhone={(v) => { setStats(null); setPhone(v); }} />
        </div>
      </section>

      <aside className="flex min-h-0 flex-col border-l" style={{ borderColor: C.line, background: C.surface }} aria-label="Inspector">
        <Inspector venue={venue} object={object} run={run} seal={seal} onDelete={del} onDuplicate={dup}
          onPreviewIntro={(k) => { const ok = vp.current?.previewIntro(k); setNote(ok ? 'Previewing the intro — Esc to stop' : 'Reduced motion is on: the intro is skipped, as in the mode'); }}
          onPreviewReplay={(a) => { vp.current?.previewReplay(a); setNote(`Looking through the ${a} angle — Esc or a camera button to leave`); }} />
      </aside>
    </div>
  );
}
