// The feel panel's view (feel-panel lane, owner 2026-10-20: "a small, phone-friendly sheet"). PURE: state and callbacks in, markup out —
// feel-panel.tsx owns the store and the server check, so this renders the same on the server (the tests' first paint) and in the game.
//
//   closed:  a slim "FEEL" tab on the left edge (mid-height: clear of the touch stick, the action buttons and the score bug), and while
//            overrides apply, a "FEEL OVERRIDES ON" chip pinned at the top centre.
//   open:    a bottom sheet — per knob its name, default, current value, a slider inside the knob's safe min/max and "reset";
//            "reset all" and "copy values" at the foot; the status line says whether this run applies the overrides, and why not.
import { stepDecimals, type FeelKnob } from '@/lib/feel-panel/knobs';
import type { FeelState } from '@/lib/feel-panel/feel';
import { FEEL_BLOCK_COPY } from '@/lib/feel-panel/sessionGate';

export interface FeelSheetProps {
  knobs: readonly FeelKnob[];
  state: FeelState;
  open: boolean;
  /** "Restart as a playtest run" (sessionGate.playtestHref), shown when this run is a normal paying one. */
  playtestHref: string | null;
  copied: boolean;
  onOpen: (open: boolean) => void;
  onSet: (id: string, value: number) => void;
  onReset: (id: string) => void;
  onResetAll: () => void;
  onCopy: () => void;
}

const fmt = (k: FeelKnob, v: number) => `${v.toFixed(stepDecimals(k.step))}${k.unit ? ` ${k.unit}` : ''}`;

/** Keys pressed inside the sheet stay in the sheet (arrow keys on a slider must not also move the player). */
const keep = (e: { stopPropagation: () => void }) => e.stopPropagation();

export function FeelSheet(p: FeelSheetProps) {
  const { state, knobs } = p;
  const count = Object.keys(state.values).length;
  const chip = state.active ? (
    <div data-testid="feel-on-chip" role="status" aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+6px)] z-[95] -translate-x-1/2 rounded-full border border-amber-300/70 bg-amber-400/90 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-black shadow-lg">
      FEEL OVERRIDES ON · {count}
    </div>
  ) : null;

  if (!p.open) {
    return (
      <>
        {chip}
        <button type="button" data-testid="feel-tab" onClick={() => p.onOpen(true)} aria-label="Open the feel panel"
          className={`fixed left-0 top-1/2 z-[95] -translate-y-1/2 rounded-r-lg border border-l-0 px-1.5 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] [writing-mode:vertical-rl] ${state.active ? 'border-amber-300/70 bg-amber-400/90 text-black' : 'border-white/25 bg-black/70 text-white/80'}`}>
          FEEL
        </button>
      </>
    );
  }

  const groups: string[] = [];
  for (const k of knobs) if (!groups.includes(k.group)) groups.push(k.group);
  const status = state.active
    ? 'FEEL OVERRIDES ON — this device, this playtest run only. Not paid, not shareable.'
    : count === 0
      ? 'No overrides: everything plays at its default.'
      : `Saved on this device, NOT applied here. ${state.block ? FEEL_BLOCK_COPY[state.block] : ''}`;

  return (
    <>
      {chip}
      <div data-testid="feel-sheet" role="dialog" aria-modal="false" aria-label="Feel panel" onKeyDown={keep} onKeyUp={keep}
        onPointerDown={keep} onTouchStart={keep}
        className="fixed inset-x-0 bottom-0 z-[96] mx-auto flex max-h-[72vh] w-full max-w-[520px] flex-col rounded-t-2xl border border-white/15 bg-[#0B0F17]/95 pb-[env(safe-area-inset-bottom)] text-white shadow-2xl backdrop-blur">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-white/90">Feel panel</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">{knobs.length} knobs · {count} changed</span>
          <button type="button" data-testid="feel-close" onClick={() => p.onOpen(false)} aria-label="Close the feel panel"
            className="ml-auto rounded-full border border-white/20 px-3 py-1 text-xs text-white/80">Close</button>
        </div>
        <p data-testid="feel-status" className={`px-4 py-2 text-[12px] leading-snug ${state.active ? 'bg-amber-400/15 text-amber-200' : 'text-white/60'}`}>
          {status}
          {!state.active && p.playtestHref && (
            <> <a data-testid="feel-playtest-link" href={p.playtestHref} className="font-semibold text-[#00E5FF] underline">Restart as a playtest run</a></>
          )}
        </p>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
          {groups.map((g) => (
            <section key={g} className="pt-2">
              <h3 className="pb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">{g}</h3>
              {knobs.filter((k) => k.group === g).map((k) => {
                const has = Object.prototype.hasOwnProperty.call(state.values, k.id);
                const cur = has ? state.values[k.id] : k.def;
                return (
                  <div key={k.id} data-testid={`feel-row-${k.id}`} className="border-b border-white/5 py-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[13px] font-semibold text-white/90">{k.label}</span>
                      <span data-testid={`feel-cur-${k.id}`} className={`ml-auto font-mono text-[13px] ${has ? 'text-amber-300' : 'text-white/80'}`}>{fmt(k, cur)}</span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="font-mono text-[10px] text-white/40">{k.id}</span>
                      <span data-testid={`feel-def-${k.id}`} className="ml-auto font-mono text-[10px] text-white/50">default {fmt(k, k.def)}</span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="w-10 text-right font-mono text-[10px] text-white/40">{k.min}</span>
                      <input type="range" aria-label={k.label} data-testid={`feel-slider-${k.id}`}
                        min={k.min} max={k.max} step={k.step} value={cur}
                        onChange={(e) => p.onSet(k.id, Number(e.currentTarget.value))}
                        className="h-8 flex-1 accent-amber-400" />
                      <span className="w-10 font-mono text-[10px] text-white/40">{k.max}</span>
                      <button type="button" data-testid={`feel-reset-${k.id}`} onClick={() => p.onReset(k.id)} disabled={!has}
                        className="rounded-md border border-white/20 px-2 py-1 text-[11px] text-white/80 disabled:opacity-30">Reset</button>
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
        <div className="flex gap-2 border-t border-white/10 px-4 py-3">
          <button type="button" data-testid="feel-reset-all" onClick={p.onResetAll} disabled={count === 0}
            className="flex-1 rounded-lg border border-white/20 py-2 text-sm text-white/85 disabled:opacity-30">Reset all</button>
          <button type="button" data-testid="feel-copy" onClick={p.onCopy}
            className="flex-1 rounded-lg border border-[#00E5FF]/50 bg-[#00E5FF]/10 py-2 text-sm font-semibold text-[#00E5FF]">
            {p.copied ? 'Copied' : 'Copy values'}
          </button>
        </div>
      </div>
    </>
  );
}
