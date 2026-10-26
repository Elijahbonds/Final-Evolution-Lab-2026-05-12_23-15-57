'use client';

// Track 1, the venue / level editor: the scene tree and the asset browser on the left, the viewport (the mode's own
// engine path) in the middle with its toolbar and the budget meter, the inspector on the right.
//
// KEYBOARD (ignored while typing in a field): Ctrl/⌘+Z undo · Ctrl/⌘+Shift+Z or Ctrl+Y redo · Ctrl/⌘+S save ·
// Q select · W move · E rotate · R scale · 1 orbit · 2 pan · 3 fly (WASD, Q/E down/up) · F frame · G grid · N snap ·
// Del / Backspace delete · Ctrl/⌘+D duplicate · Ctrl/⌘+C copy · Ctrl/⌘+V paste (at the view's centre, any venue) ·
// Ctrl/⌘+A select all · H hide / show · L lock / unlock · arrows nudge a grid step · Esc deselect / stop a preview.
// §11: every one of these takes the whole selection, as one undo step.

import { useCallback, useEffect, useRef, useState } from 'react';
import { MousePointer2, Move3d, Rotate3d, Scale3d, Orbit, Hand, Plane, Grid3x3, Magnet, Focus, ClipboardPaste } from 'lucide-react';
import { catalogItem, type CatalogItem } from '@/lib/nexus-studio/catalog';
import { moveObject, placeItem, addVenue, switchVenue } from '@/lib/nexus-studio/edits';
import { boxSelect, clickSelect, groupDeleteCommand, groupFlagCommand, groupTransformCommand, selectedObjects, treeSelect, type GroupDelta } from '@/lib/nexus-studio/group';
import { copySelection, duplicateSelection, pasteClip } from '@/lib/nexus-studio/clipboard';
import { allStamps, placeStamp, removeStampCommand, renameStampCommand, stampFromSelection } from '@/lib/nexus-studio/stamps';
import type { StudioStamp } from '@/lib/nexus-studio/doc';
import { DEFAULT_SNAP, SNAP_MOVES, snapTransform, type SnapSettings } from '@/lib/nexus-studio/snap';
import { targetOf, PLAYTEST_TARGETS, DEFAULT_TARGET } from '@/lib/nexus-studio/targets';
import type { BudgetSample } from '@/lib/nexus-studio/budget';
import type { CameraMode, Tool } from '@/lib/nexus-studio/viewport';
import type { StudioTransform, V3 } from '@/lib/nexus-studio/doc';
import { useResolvedCast, type StudioApi } from './use-studio';
import { AssetBrowser } from './asset-browser';
import { SceneTree, treeOrder } from './scene-tree';
import { StampShelf, STAMP_DRAG_PREFIX } from './stamp-shelf';
import { Inspector } from './inspector';
import { ViewportPanel, type ViewportHandle } from './viewport-panel';
import { BudgetMeter } from './budget-meter';
import { PublishPanel } from './publish-panel';
import { PhoneBar } from './phone-bar';
import { worstPhone, type PhoneSample } from '@/lib/nexus-studio/publishGate';
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
  const { venue, doc, selected, setSelected, selection, setSelection, clip, setClip, run, seal } = studio;
  const vp = useRef<ViewportHandle | null>(null);
  const [tool, setTool] = useState<Tool>('move');
  const [camera, setCamera] = useState<CameraMode>('orbit');
  const [snap, setSnap] = useState<SnapSettings>(DEFAULT_SNAP);
  const [grid, setGrid] = useState(true);
  const [phone, setPhone] = useState(false);
  const [left, setLeft] = useState<'scene' | 'assets' | 'stamps'>('assets');
  const [stats, setStats] = useState<BudgetSample | null>(null);
  // NEX-04: the worst phone-tier sample since the venue last changed — what Publish's budget gate reads
  const [phoneSample, setPhoneSample] = useState<PhoneSample | null>(null);
  const [publishing, setPublishing] = useState(false);
  // NEX-05 (phone): which sheet is open under the viewport on a narrow screen, and multi-select (a tap toggles, as Ctrl-click does)
  const [sheet, setSheet] = useState<'left' | 'inspect' | null>('left');
  const [multi, setMulti] = useState(false);
  const onStats = useCallback((s: BudgetSample) => { setStats(s); setPhoneSample((p) => worstPhone(p, s)); }, []);
  useEffect(() => { setPhoneSample(null); }, [venue]);   // an edit asks for a fresh measurement
  const [note, setNote] = useState<string | null>(null);

  const object = venue?.objects.find((o) => o.id === selected) ?? null;
  const group = venue && selection.length > 1 ? selectedObjects(venue, selection) : undefined;
  const cast = useResolvedCast(doc, venue);   // track 3: the cast, decoded, stood on the hero's spot

  const place = useCallback((item: CatalogItem, at?: V3) => {
    if (!venue) return;
    const p = at ?? vp.current?.focusPoint() ?? [0, 0, 0];
    const t = snapTransform({ p, ry: 0, s: 1 }, snap);
    const r = placeItem(venue, item, t.p);
    run(r.cmd); setSelected(r.id);
  }, [venue, snap, run, setSelected]);

  const onTransform = useCallback((id: string, t: StudioTransform) => { if (venue) run(moveObject(venue, id, t)); }, [venue, run]);
  // §11: a group drag's release is ONE command (the viewport hands up the snapped delta about the drag's pivot)
  const onGroupTransform = useCallback((ids: string[], d: GroupDelta, pivot: V3) => {
    if (!venue) return;
    const c = groupTransformCommand(venue, ids, d, { pivot });
    if (c) run(c);
  }, [venue, run]);
  // every selection action takes the whole selection, in one step; `ids` defaults to it
  const del = useCallback((ids: readonly string[] = selection) => { if (!venue) return; const c = groupDeleteCommand(venue, ids); if (c) { run(c); setSelection(ids.filter((id) => venue.objects.find((o) => o.id === id)?.locked)); } }, [venue, run, selection, setSelection]);
  const dup = useCallback((ids: readonly string[] = selection) => { if (!venue) return; const r = duplicateSelection(venue, ids); if (r) { run(r.cmd); setSelection(r.ids); } }, [venue, run, selection, setSelection]);
  const copy = useCallback(() => {
    if (!venue) return;
    const c = copySelection(venue, selection);
    if (c) { setClip(c); setNote(`Copied ${c.objects.length === 1 ? c.objects[0].name : `${c.objects.length} objects`} — Ctrl+V pastes into any venue`); }
  }, [venue, selection, setClip]);
  const paste = useCallback(() => {
    if (!venue || !clip) return;
    const r = pasteClip(venue, clip, vp.current?.focusPoint() ?? clip.centre);
    if (!r) { setNote(`This venue holds ${venue.objects.length} objects; the paste would pass the limit`); return; }
    run(r.cmd); setClip(r.clip); setSelection(r.ids);
  }, [venue, clip, run, setClip, setSelection]);
  const flag = useCallback((key: 'hidden' | 'locked', ids: readonly string[] = selection) => { if (!venue) return; const c = groupFlagCommand(venue, ids, key); if (c) run(c); }, [venue, run, selection]);
  const turn = useCallback((deg: number) => { if (!venue) return; const c = groupTransformCommand(venue, selection, { move: [0, 0, 0], turn: (deg * Math.PI) / 180, scale: 1 }); if (c) run(c); }, [venue, run, selection]);
  const stampPlace = useCallback((st: StudioStamp, at?: V3) => {
    if (!venue) return;
    const r = placeStamp(venue, st, at ?? vp.current?.focusPoint() ?? [0, 0, 0], snap);
    if (!r) { setNote(`No room for ${st.name} (a venue holds ${venue.objects.length} objects)`); return; }
    run(r.cmd); setSelection(r.ids);
  }, [venue, snap, run, setSelection]);
  const saveStamp = useCallback((name?: string) => {
    if (!venue) return;
    const r = stampFromSelection(venue, selection, name ?? '', doc);
    if (r) { run(r.cmd); setLeft('stamps'); setNote('Saved as a stamp — it is in the Stamps tab and the project'); }
  }, [venue, selection, doc, run]);

  // the arrows' nudge, shared with the phone bar's (NEX-05): one grid step; a group steps together, coalesced per run of nudges
  const nudge = useCallback((dx: number, dz: number) => {
    if (!selected || !venue) return;
    if (selection.length > 1) {
      // §11: the group steps together (one coalesced step per run of nudges)
      const step = snap.on ? snap.move : 0.1;
      const c = groupTransformCommand(venue, selection, { move: [dx * step, 0, dz * step], turn: 0, scale: 1 }, { label: 'Nudge', group: `nudge:${selection.join(',')}` });
      if (c) run(c);
      return;
    }
    const t = vp.current?.nudge(selected, dx, dz);
    if (t) run({ ...moveObject(venue, selected, t, 'Nudge'), group: `nudge:${selected}` });
  }, [selected, selection, venue, snap, run]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) studio.redo(); else studio.undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); studio.redo(); return; }
      if (mod && k === 's') { e.preventDefault(); studio.save(); return; }
      if (mod && k === 'd') { e.preventDefault(); dup(); return; }
      if (mod && k === 'c') { if (selection.length) { e.preventDefault(); copy(); } return; }
      if (mod && k === 'v') { if (clip) { e.preventDefault(); paste(); } return; }
      if (mod && k === 'a') { e.preventDefault(); if (venue) setSelection(venue.objects.filter((o) => !o.hidden).map((o) => o.id)); return; }
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
        case 'delete': case 'backspace': if (selection.length) { e.preventDefault(); del(); } break;
        case 'h': if (selection.length) flag('hidden'); break;
        case 'l': if (selection.length) flag('locked'); break;
        case 'arrowleft': case 'arrowright': case 'arrowup': case 'arrowdown': {
          if (!selected || !venue) break;
          e.preventDefault();
          nudge(k === 'arrowleft' ? -1 : k === 'arrowright' ? 1 : 0, k === 'arrowup' ? -1 : k === 'arrowdown' ? 1 : 0);
          break;
        }
        default: return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [studio, selected, selection, venue, camera, del, dup, copy, paste, flag, clip, nudge, run, setSelected, setSelection]);

  if (!venue) return null;
  const target = targetOf(venue.base.target) ?? PLAYTEST_TARGETS[DEFAULT_TARGET];

  return (
    // NEX-05: on a phone the viewport comes first, then a sheet (assets / stamps / scene, or the inspector) chosen by the tabs under
    // it; from md up, the three columns as before
    <div className="flex min-h-0 min-w-0 flex-1 flex-col md:grid md:grid-cols-[260px_minmax(0,1fr)_300px]" data-testid="venue-editor">
      <aside className={`${sheet === 'left' ? 'flex' : 'hidden'} order-3 min-h-0 flex-1 flex-col overflow-y-auto border-r md:order-none md:flex md:flex-none md:overflow-visible`} style={{ borderColor: C.line, background: C.surface }} aria-label="Scene and assets">
        <div className="hidden gap-1 px-2 pt-2 md:flex" role="tablist">
          {(['assets', 'stamps', 'scene'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={left === t} onClick={() => setLeft(t)} className="flex-1 rounded-md py-1 text-[12px] capitalize"
              style={{ background: left === t ? 'rgba(0,229,255,0.12)' : 'transparent', color: left === t ? C.cyan : C.dim }}>{t === 'scene' ? `Scene · ${venue.objects.length}` : t === 'stamps' ? 'Stamps' : 'Assets'}</button>
          ))}
        </div>
        {left === 'assets' && <AssetBrowser onPlace={(i) => place(i)} />}
        {left === 'stamps' && (
          <StampShelf project={doc} selectionCount={selection.length} onPlace={(st) => stampPlace(st)} onSave={(n) => saveStamp(n)}
            onRename={(id, n) => run(renameStampCommand(id, n))} onDone={seal}
            onRemove={(id) => { const c = removeStampCommand(doc, id); if (c) run(c); }} />
        )}
        {left === 'scene' && (
          <SceneTree venues={doc.venues} activeId={doc.activeVenueId} venue={venue} selection={selection}
            onSelectRow={(id, mods, anchor) => setSelection(treeSelect(treeOrder(venue.objects), selection, id, mods, anchor))}
            onClear={() => setSelection([])}
            onToggle={(ids, key) => flag(key, ids)}
            onSwitchVenue={(id) => { if (id !== doc.activeVenueId) { run(switchVenue(id)); setSelection([]); } }}
            onAddVenue={() => { const r = addVenue(doc, target); run(r.cmd); setSelection([]); }} />
        )}
      </aside>

      <section className="order-1 flex h-[62dvh] min-h-0 min-w-0 shrink-0 flex-col md:order-none md:h-auto" aria-label="Viewport">
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
          <ToolButton title={clip ? `Paste ${clip.objects.length === 1 ? clip.objects[0].name : `${clip.objects.length} objects`} at the view's centre` : 'Paste (copy something first)'} shortcut="Ctrl+V" disabled={!clip} onClick={paste}><ClipboardPaste className="h-4 w-4" /></ToolButton>
          {selection.length > 1 && <span className="ml-1 rounded px-1.5 py-0.5 text-[11px]" style={{ color: C.cyan, background: 'rgba(0,229,255,0.10)' }} data-testid="selection-count">{selection.length} selected</span>}
          {note && <span className="ml-2 text-[11px]" style={{ color: C.gold }}>{note}</span>}
        </div>
        <PhoneBar count={selection.length} multi={multi} onMulti={setMulti}
          onSelectAll={() => setSelection(venue.objects.filter((o) => !o.hidden).map((o) => o.id))}
          onDeselect={() => { vp.current?.stopPreview(); setSelected(null); }}
          onDelete={() => del()} onDuplicate={() => dup()} onCopy={copy}
          onHide={() => flag('hidden')} onLock={() => flag('locked')} onNudge={nudge} onTurn={turn} />
        <ViewportPanel ref={vp} venue={venue} cast={cast} selection={selection} tool={tool} camera={camera} snap={snap} grid={grid} phone={phone}
          onPick={(id, mods) => setSelection(clickSelect(selection, id, mods.toggle || (multi && id !== null) ? 'toggle' : 'replace'))}
          onBox={(ids, mode) => setSelection(boxSelect(selection, ids, mode))}
          onTransform={onTransform} onGroupTransform={onGroupTransform} onStats={onStats} onPreviewEnd={() => setNote(null)}
          onDropItem={(id, at) => {
            if (id.startsWith(STAMP_DRAG_PREFIX)) { const st = allStamps(doc).find((x) => x.id === id.slice(STAMP_DRAG_PREFIX.length)); if (st) stampPlace(st, at); return; }
            const item = catalogItem(id); if (item) place(item, at);
          }} />
        <div className="border-t" style={{ borderColor: C.line, background: C.surface }}>
          <BudgetMeter sample={stats} budgetKey={target.budgetKey} phone={phone} onPhone={(v) => { setStats(null); setPhone(v); }}
            onPublish={() => setPublishing((x) => !x)} publishing={publishing} />
          {publishing && (
            <PublishPanel venue={venue} project={doc} phoneSample={phoneSample} onMeasurePhone={() => { setStats(null); setPhone(true); }} onClose={() => setPublishing(false)} />
          )}
        </div>
      </section>

      {/* NEX-05: the phone's sheet tabs (the left panel's three, and the inspector) */}
      <nav className="order-2 flex gap-1 border-y px-2 py-1 md:hidden" style={{ borderColor: C.line, background: C.surface }} role="tablist" aria-label="Panels">
        {([['assets', 'Add'], ['stamps', 'Stamps'], ['scene', 'Scene'], ['inspect', 'Inspect']] as const).map(([id, label]) => {
          const on = id === 'inspect' ? sheet === 'inspect' : sheet === 'left' && left === id;
          return (
            <button key={id} type="button" role="tab" aria-selected={on} data-testid={`sheet-${id}`}
              onClick={() => { if (id === 'inspect') setSheet(on ? null : 'inspect'); else { setLeft(id); setSheet(on ? null : 'left'); } }}
              className="h-10 flex-1 rounded-md text-[12px]" style={{ background: on ? 'rgba(0,229,255,0.12)' : 'transparent', color: on ? C.cyan : C.dim }}>{label}</button>
          );
        })}
      </nav>
      <aside className={`${sheet === 'inspect' ? 'flex' : 'hidden'} order-3 min-h-0 flex-1 flex-col overflow-y-auto border-l md:order-none md:flex md:flex-none md:overflow-visible`} style={{ borderColor: C.line, background: C.surface }} aria-label="Inspector">
        <Inspector venue={venue} project={doc} object={object} run={run} seal={seal} onDelete={(id) => del([id])} onDuplicate={(id) => dup([id])}
          group={group} groupActions={{ duplicate: () => dup(), copy, remove: () => del(), flag: (k) => flag(k), turn, saveStamp: () => saveStamp() }}
          onPreviewIntro={(k) => { const ok = vp.current?.previewIntro(k); setNote(ok ? 'Previewing the intro — Esc to stop' : 'Reduced motion is on: the intro is skipped, as in the mode'); }}
          onPreviewReplay={(a) => { vp.current?.previewReplay(a); setNote(`Looking through the ${a} angle — Esc or a camera button to leave`); }} />
      </aside>
    </div>
  );
}
