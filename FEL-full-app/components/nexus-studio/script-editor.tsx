'use client';

// TRACK 4, VISUAL SCRIPTING: the node editor. React + SVG, no graph library (no new dependency). Events (cyan) → conditions
// (gold) → actions (emerald). Drag a node to move it; drag from a node's right port to another's left port to connect;
// click a wire or a node and press Delete to remove it; drag the background to pan, wheel to zoom. Every change is a command
// on the Studio's undo stack (lib/nexus-studio/edits.ts); a drag is one step.
//
// What a script can do is closed (lib/nexus-studio/scripts.ts): it listens to the mode and does presentation. The graph is data;
// nothing in it is ever evaluated.

import { useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { Plus, Trash2, Workflow, Zap, Filter, Sparkles, Power } from 'lucide-react';
import {
  NODE_KINDS, NODE_SPECS, edgeAllowed, graphNotes, groupOf, wouldCycle,
  type NodeGroup, type NodeKind, type ParamSpec, type ScriptNode,
} from '@/lib/nexus-studio/scripts';
import { addScript, addScriptNode, connectNodes, deleteFromScript, editScript, moveScriptNode, removeScript, setNodeParam } from '@/lib/nexus-studio/edits';
import type { StudioScript } from '@/lib/nexus-studio/doc';
import type { StudioApi } from './use-studio';
import { C, NumberField, PanelTitle, Row, Select, TextField, Toggle } from './ui';

export const NODE_W = 196;
export const NODE_H = 64;
const GROUP_COLOUR: Record<NodeGroup, string> = { event: '#00E5FF', condition: '#FFD700', action: '#00FF9D' };
const GROUP_ICON = { event: Zap, condition: Filter, action: Sparkles } as const;
const GROUP_LABEL: Record<NodeGroup, string> = { event: 'When', condition: 'Only if', action: 'Do' };

/** Pure: a node's one-line summary of its parameters. */
export function paramSummary(n: Pick<ScriptNode, 'kind' | 'params'>): string {
  const p = n.params;
  switch (n.kind) {
    case 'onScore': return p.side === 'any' ? 'either side' : p.side === 'me' ? 'by you' : 'by the rival';
    case 'onMomentum': return p.kind === 'any' ? 'any play' : String(p.kind);
    case 'onTier': return `${p.tier} · ${p.dir}`;
    case 'onTimer': return `${p.repeat} ${p.seconds} s`;
    case 'onZone': return `(${p.x}, ${p.z}) r ${p.r}`;
    case 'compare': return `${p.value} ${p.op} ${p.to}`;
    case 'cooldown': return `${p.seconds} s`;
    case 'chance': return `${Math.round(Number(p.p) * 100)} %`;
    case 'crowd': return `${p.reaction} × ${p.strength}`;
    case 'burst': return `${p.kind} at ${p.at}`;
    case 'banner': return `“${p.text}”`;
    case 'camera': return String(p.shot);
    case 'lights': return `${p.color} · ${p.seconds} s`;
    case 'sound': return String(p.cue);
    default: return '';
  }
}

/** Pure: the wire between two nodes (output port on the right edge, input port on the left), as an SVG path. */
export function wirePath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2;
  const k = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + k} ${y1}, ${x2 - k} ${y2}, ${x2} ${y2}`;
}

export function ScriptsTrack({ studio }: { studio: StudioApi }) {
  const { doc, run, seal } = studio;
  const [activeId, setActiveId] = useState<string | null>(null);
  const script = doc.scripts.find((s) => s.id === activeId) ?? doc.scripts[0] ?? null;
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr_280px]" data-testid="scripts-track">
      <aside className="flex min-h-0 flex-col overflow-y-auto border-r" style={{ borderColor: C.line, background: C.surface }}>
        <PanelTitle right={<span className="text-[11px]" style={{ color: C.dim }}>{doc.scripts.length}</span>}>Scripts</PanelTitle>
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          <button type="button" onClick={() => { const r = addScript(doc, 'pointWon'); run(r.cmd); setActiveId(r.id); }} className="flex items-center gap-1 rounded-md border px-2 py-1 text-[12px]" style={{ borderColor: C.line, color: C.text }}><Plus className="h-3.5 w-3.5" aria-hidden /> Point won → cheer</button>
          <button type="button" onClick={() => { const r = addScript(doc, 'blank'); run(r.cmd); setActiveId(r.id); }} className="flex items-center gap-1 rounded-md border px-2 py-1 text-[12px]" style={{ borderColor: C.line, color: C.text }}><Plus className="h-3.5 w-3.5" aria-hidden /> Blank</button>
        </div>
        <ul>
          {doc.scripts.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => setActiveId(s.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px]" style={{ background: s.id === script?.id ? 'rgba(0,229,255,0.1)' : 'transparent', color: s.enabled ? C.text : C.dim }}>
                <Workflow className="h-3.5 w-3.5 shrink-0" style={{ color: s.id === script?.id ? C.cyan : C.dim }} aria-hidden />
                <span className="truncate">{s.name}</span>
                <span className="ml-auto text-[10px]" style={{ color: C.dim }}>{s.nodes.length}</span>
              </button>
            </li>
          ))}
          {!doc.scripts.length && <li className="px-3 py-2 text-[12px]" style={{ color: C.dim }}>No scripts yet. Start from “Point won → cheer”.</li>}
        </ul>
        <p className="mt-auto px-3 py-3 text-[11px]" style={{ color: C.dim }}>Scripts run in every venue this project play-tests. They only listen and put on a show: they never touch the score, the clock or the rules.</p>
      </aside>
      {script ? <GraphCanvas key={script.id} script={script} run={run} seal={seal} /> : <div className="flex items-center justify-center text-[13px]" style={{ color: C.dim }}>Make a script to start.</div>}
      {script ? <ScriptSide script={script} run={run} seal={seal} onDelete={() => { const c = removeScript(doc, script.id); if (c) { run(c); setActiveId(null); } }} /> : <aside style={{ background: C.surface }} />}
    </div>
  );
}

function GraphCanvas({ script, run, seal }: { script: StudioScript; run: StudioApi['run']; seal(): void }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState({ x: 20, y: 20, k: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<null | { kind: 'node'; id: string; dx: number; dy: number } | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number } | { kind: 'wire'; from: string; x: number; y: number }>(null);
  const byId = useMemo(() => new Map(script.nodes.map((n) => [n.id, n])), [script.nodes]);

  const toWorld = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current?.getBoundingClientRect();
    return { x: (e.clientX - (r?.left ?? 0) - view.x) / view.k, y: (e.clientY - (r?.top ?? 0) - view.y) / view.k };
  };
  const onMove = (e: RPointerEvent) => {
    if (!drag) return;
    if (drag.kind === 'pan') setView((v) => ({ ...v, x: drag.vx + e.clientX - drag.sx, y: drag.vy + e.clientY - drag.sy }));
    else if (drag.kind === 'node') { const w = toWorld(e); run(moveScriptNode(script, drag.id, w.x - drag.dx, w.y - drag.dy)); }
    else { const w = toWorld(e); setDrag({ ...drag, x: w.x, y: w.y }); }
  };
  const onUp = (e: RPointerEvent) => {
    if (drag?.kind === 'node') seal();
    if (drag?.kind === 'wire') {
      const w = toWorld(e);
      const target = script.nodes.find((n) => w.x >= n.x - 12 && w.x <= n.x + NODE_W && w.y >= n.y && w.y <= n.y + NODE_H && n.id !== drag.from);
      if (target) { const c = connectNodes(script, drag.from, target.id); if (c) run(c); }
    }
    setDrag(null);
  };
  const onKey = (e: RKeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); const c = deleteFromScript(script, [selected]); if (c) { run(c); setSelected(null); } }
  };
  const wireFrom = drag?.kind === 'wire' ? byId.get(drag.from) : null;

  return (
    <section className="relative min-h-0 overflow-hidden" style={{ background: '#07090d' }} aria-label="Script graph">
      <svg ref={svgRef} className="h-full w-full touch-none outline-none" tabIndex={0} onKeyDown={onKey} data-testid="script-canvas"
        onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setDrag(null)}
        onPointerDown={(e) => { if (e.target === svgRef.current) { setSelected(null); setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }); } }}
        onWheel={(e) => setView((v) => ({ ...v, k: Math.min(2, Math.max(0.4, v.k * (e.deltaY > 0 ? 0.9 : 1.1))) }))}>
        <defs>
          <pattern id="ns-grid" width={24 * view.k} height={24 * view.k} patternUnits="userSpaceOnUse" x={view.x} y={view.y}>
            <circle cx="1" cy="1" r="1" fill="#1b2330" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ns-grid)" pointerEvents="none" />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {script.edges.map((ed) => {
            const a = byId.get(ed.from), b = byId.get(ed.to);
            if (!a || !b) return null;
            const on = selected === ed.id;
            return (
              <g key={ed.id} onPointerDown={(e) => { e.stopPropagation(); setSelected(ed.id); }} style={{ cursor: 'pointer' }}>
                <path d={wirePath(a, b)} stroke="transparent" strokeWidth={14} fill="none" />
                <path d={wirePath(a, b)} stroke={on ? '#ffffff' : GROUP_COLOUR[groupOf(a.kind)]} strokeOpacity={on ? 1 : 0.7} strokeWidth={on ? 3 : 2} fill="none" data-testid="script-wire" />
              </g>
            );
          })}
          {wireFrom && drag?.kind === 'wire' && <path d={wirePath(wireFrom, { x: drag.x, y: drag.y - NODE_H / 2 })} stroke="#ffffff" strokeDasharray="5 4" strokeWidth={2} fill="none" pointerEvents="none" />}
          {script.nodes.map((n) => {
            const grp = groupOf(n.kind), col = GROUP_COLOUR[grp], on = selected === n.id;
            const accepts = drag?.kind === 'wire' && wireFrom && edgeAllowed(wireFrom.kind, n.kind) && !wouldCycle(script.edges, wireFrom.id, n.id);
            return (
              <g key={n.id} transform={`translate(${n.x} ${n.y})`} data-testid="script-node" data-kind={n.kind}
                onPointerDown={(e) => { e.stopPropagation(); setSelected(n.id); const w = toWorld(e); setDrag({ kind: 'node', id: n.id, dx: w.x - n.x, dy: w.y - n.y }); try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* a synthetic event has no live pointer */ } }}
                style={{ cursor: 'grab' }}>
                <rect width={NODE_W} height={NODE_H} rx={10} fill="#0f141c" stroke={on ? '#ffffff' : accepts ? col : '#263142'} strokeWidth={on || accepts ? 2 : 1} />
                <rect width={NODE_W} height={20} rx={10} fill={col} fillOpacity={0.16} />
                <text x={12} y={14} fontSize={10} fontWeight={700} letterSpacing={1.4} fill={col}>{GROUP_LABEL[grp].toUpperCase()}</text>
                <text x={12} y={36} fontSize={13} fontWeight={600} fill="#f2f5f9">{NODE_SPECS[n.kind].label}</text>
                <text x={12} y={53} fontSize={11} fill="#8b97a5">{paramSummary(n).slice(0, 30)}</text>
                {grp !== 'event' && <circle cx={0} cy={NODE_H / 2} r={6} fill="#0f141c" stroke={col} strokeWidth={2} />}
                {grp !== 'action' && (
                  <circle cx={NODE_W} cy={NODE_H / 2} r={7} fill={col} stroke="#0f141c" strokeWidth={2} style={{ cursor: 'crosshair' }} data-testid="script-port"
                    onPointerDown={(e) => { e.stopPropagation(); const w = toWorld(e); setDrag({ kind: 'wire', from: n.id, x: w.x, y: w.y }); }} />
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="pointer-events-none absolute bottom-2 left-3 text-[11px]" style={{ color: C.dim }}>Drag a node · drag from a node’s right dot to connect · Delete removes · drag empty space to pan · wheel to zoom</div>
      {selected && byId.get(selected) && <NodeInspector script={script} node={byId.get(selected)!} run={run} seal={seal} />}
    </section>
  );
}

function NodeInspector({ script, node, run, seal }: { script: StudioScript; node: ScriptNode; run: StudioApi['run']; seal(): void }) {
  const spec = NODE_SPECS[node.kind];
  return (
    <div className="absolute right-3 top-3 w-64 rounded-lg border pb-2" style={{ borderColor: C.line, background: 'rgba(12,12,17,0.94)' }} data-testid="node-inspector">
      <PanelTitle right={<button type="button" aria-label="Delete node" onClick={() => { const c = deleteFromScript(script, [node.id]); if (c) run(c); }} className="rounded p-0.5 hover:bg-white/5"><Trash2 className="h-3.5 w-3.5" style={{ color: C.dim }} /></button>}>{spec.label}</PanelTitle>
      <p className="px-3 pb-1 text-[11px]" style={{ color: C.dim }}>{spec.hint}</p>
      {(spec.params as readonly ParamSpec[]).map((p) => {
        const v = node.params[p.key];
        const set = (val: string | number) => run(setNodeParam(script, node.id, p.key, val));
        return (
          <Row key={p.key} label={p.label}>
            {p.type === 'enum' ? <Select label={p.label} value={String(v)} options={p.options.map((o) => ({ value: o, label: o }))} onChange={set} />
              : p.type === 'number' ? <NumberField label={p.label} value={Number(v)} step={p.step} min={p.min} max={p.max} onChange={set} onDone={seal} />
              : p.type === 'color' ? <input type="color" aria-label={p.label} value={String(v)} onChange={(e) => set(e.target.value)} onBlur={seal} className="h-6 w-12 rounded border bg-transparent" style={{ borderColor: C.line }} />
              : <TextField label={p.label} value={String(v)} maxLength={p.max} onChange={set} onDone={seal} />}
          </Row>
        );
      })}
    </div>
  );
}

function ScriptSide({ script, run, seal, onDelete }: { script: StudioScript; run: StudioApi['run']; seal(): void; onDelete(): void }) {
  const notes = graphNotes(script);
  const place = (kind: NodeKind) => {
    const col = { event: 40, condition: 280, action: 520 }[groupOf(kind)];
    const y = 40 + script.nodes.filter((n) => groupOf(n.kind) === groupOf(kind)).length * (NODE_H + 24);
    run(addScriptNode(script, kind, col, y).cmd);
  };
  return (
    <aside className="flex min-h-0 flex-col overflow-y-auto border-l" style={{ borderColor: C.line, background: C.surface }} aria-label="Script">
      <PanelTitle right={<button type="button" aria-label="Delete script" onClick={onDelete} className="rounded p-0.5 hover:bg-white/5"><Trash2 className="h-3.5 w-3.5" style={{ color: C.dim }} /></button>}>Script</PanelTitle>
      <Row label="Name"><TextField label="Script name" value={script.name} onChange={(n) => run(editScript(script.id, { name: n }, 'Rename script', `script:${script.id}:name`))} onDone={seal} /></Row>
      <Row label="On"><span className="flex items-center gap-2"><Toggle label="Script on" on={script.enabled} onChange={(on) => run(editScript(script.id, { enabled: on }, on ? 'Turn script on' : 'Turn script off'))} /><Power className="h-3.5 w-3.5" style={{ color: script.enabled ? C.emerald : C.dim }} aria-hidden /></span></Row>
      {(['event', 'condition', 'action'] as const).map((g) => {
        const Icon = GROUP_ICON[g];
        return (
          <div key={g}>
            <PanelTitle>{GROUP_LABEL[g]}</PanelTitle>
            <div className="flex flex-wrap gap-1 px-3">
              {NODE_KINDS.filter((k) => groupOf(k) === g).map((k) => (
                <button key={k} type="button" onClick={() => place(k)} title={NODE_SPECS[k].hint} className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]" style={{ borderColor: C.line, color: GROUP_COLOUR[g] }}>
                  <Icon className="h-3 w-3" aria-hidden /> {NODE_SPECS[k].label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {notes.length > 0 && (
        <ul className="mx-3 mt-3 list-disc space-y-0.5 rounded-md border p-2 pl-6 text-[11px]" style={{ borderColor: C.line, color: C.gold }} data-testid="script-notes">
          {notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </aside>
  );
}
