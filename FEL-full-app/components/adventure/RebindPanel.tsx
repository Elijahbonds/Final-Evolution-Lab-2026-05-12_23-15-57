'use client';

// The Adventure's rebinding screen (plan, "Default controls (A4's mapper; every one rebindable)"). On the pause screen,
// by pointer only: a pad press there would resume the game (the harness's pause rule), so each action's control is
// picked from a list. Stored per device (host/inputMap storeBindings: a convenience, never required); the mode reloads
// them into its mapper on the spot. Only the actions that differ from the defaults are stored.

import { useState } from 'react';
import {
  ADVENTURE_ACTIONS, DEFAULT_BINDINGS, loadBindings, storeBindings, type AdventureAction, type Bindings, type Control,
} from '@/lib/babylon/adventure/host/inputMap';

const OPTIONS: { key: string; label: string; control: Control }[] = [
  ...(['A', 'B', 'X', 'Y', 'L1', 'R1', 'LS', 'RS'] as const).map((b) => ({ key: `b:${b}`, label: b, control: { kind: 'button', btn: b } as Control })),
  { key: 't:L', label: 'L2', control: { kind: 'trigger', side: 'L' } },
  { key: 't:R', label: 'R2', control: { kind: 'trigger', side: 'R' } },
  ...(['up', 'down', 'left', 'right'] as const).map((d) => ({ key: `d:${d}`, label: `D-PAD ${d.toUpperCase()}`, control: { kind: 'dpad', dir: d } as Control })),
  { key: 'space', label: 'SPACE', control: { kind: 'space' } },
];

const keyOf = (c: Control | undefined): string =>
  !c ? '' : c.kind === 'button' ? `b:${c.btn}` : c.kind === 'trigger' ? `t:${c.side}` : c.kind === 'dpad' ? `d:${c.dir}` : 'space';

/** An action's first control (the one this screen changes; the defaults' keyboard copies stay with it). */
function primary(b: Partial<Bindings> | null, a: AdventureAction): string { return keyOf((b?.[a] ?? DEFAULT_BINDINGS[a])[0]); }

export function RebindPanel({ onSaved }: { onSaved: () => void }) {
  const [stored, setStored] = useState<Partial<Bindings> | null>(() => loadBindings());
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(ADVENTURE_ACTIONS.map((a) => [a, primary(loadBindings(), a)])));
  const save = () => {
    const out: Partial<Bindings> = {};
    for (const a of ADVENTURE_ACTIONS) {
      if (draft[a] === primary(null, a)) continue;
      const opt = OPTIONS.find((o) => o.key === draft[a]);
      if (opt) out[a] = [opt.control, ...DEFAULT_BINDINGS[a].slice(1)];
    }
    storeBindings(out);
    setStored(out);
    onSaved();
  };
  const reset = () => { storeBindings({}); setStored({}); setDraft(Object.fromEntries(ADVENTURE_ACTIONS.map((a) => [a, primary(null, a)]))); onSaved(); };
  return (
    <div className="w-full max-w-2xl rounded-lg border border-white/10 bg-black/60 p-3 text-[10px]" data-testid="adventure-rebind">
      <p className="mb-2 text-[9px] font-black tracking-[0.3em] text-white/45">REBIND (PAD)</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {ADVENTURE_ACTIONS.map((a) => (
          <label key={a} className="flex items-center justify-between gap-2">
            <span className="text-white/60">{a.toUpperCase()}</span>
            <select value={draft[a]} onChange={(e) => setDraft((d) => ({ ...d, [a]: e.target.value }))}
              className="rounded bg-white/10 px-1 py-0.5 text-white">
              {OPTIONS.map((o) => <option key={o.key} value={o.key} className="text-black">{o.label}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={(e) => { e.currentTarget.blur(); save(); }} className="rounded bg-white/15 px-3 py-1 font-bold">SAVE BINDINGS</button>
        <button type="button" onClick={(e) => { e.currentTarget.blur(); reset(); }} className="rounded px-3 py-1 text-white/60">DEFAULTS</button>
        {stored && Object.keys(stored).length > 0 && <span className="self-center text-white/40">{Object.keys(stored).length} CHANGED</span>}
      </div>
    </div>
  );
}
