'use client';

// The upright phone's one-row game header and the tools it hands to the "⋯" menu (look-screens phase A1; the rule and the
// measurements are in lib/ui/compactHeader.ts).
import { useSyncExternalStore, type ReactNode } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { getFeelState, getServerFeelState, subscribeFeel } from '@/lib/feel-panel/feel';
import { COMPACT_HEADER_ATTR, COMPACT_HEADER_CSS, compactGameHeader, menuPrqLine, UPRIGHT_PHONE_QUERY } from '@/lib/ui/compactHeader';
import type { PrqDisplay } from '@/lib/prq-display';
import { useSlotRef } from './hud-zones';   // look-screens A2: the mode's folded pieces (MIX / MC / CC, the Dunk's board and chips)

const noSub = () => () => {};
function subscribeUpright(fn: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(UPRIGHT_PHONE_QUERY);
  mq.addEventListener?.('change', fn);
  return () => mq.removeEventListener?.('change', fn);
}
const uprightNow = () => (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(UPRIGHT_PHONE_QUERY).matches);

/**
 * `header`: the attribute to spread on the header (present while the knob is on, on every screen: the CSS media query
 * decides where it bites, so the server's first paint is already one row on a phone). `menu`: the tools go in the "⋯" menu
 * now — the knob is on AND the phone is upright (false on the server and in the first client render, so hydration matches).
 */
export function useCompactHeader(): { header: Record<string, string | undefined>; menu: boolean } {
  useSyncExternalStore(subscribeFeel, getFeelState, getServerFeelState);   // re-read the knob when the feel panel opens
  const on = compactGameHeader();
  const upright = useSyncExternalStore(on ? subscribeUpright : noSub, uprightNow, () => false);
  return { header: { [COMPACT_HEADER_ATTR]: on ? '' : undefined }, menu: on && upright };
}

/** The rules the attribute switches on. Rendered once by the shell; they match nothing while the attribute is absent. */
export function CompactHeaderStyle() {
  return <style data-fel-compact-rules="" dangerouslySetInnerHTML={{ __html: COMPACT_HEADER_CSS }} />;
}

const row = 'flex min-h-11 items-center justify-between gap-2';
const label = 'font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-white/50';

/**
 * The header's tools, as the "⋯" menu draws them on an upright phone: BODY, the PRQ line (never "NOT MEASURED" as a badge),
 * the graphics choice and full screen. The components are the header's own (same buttons, same behaviour).
 */
export function MenuGameTools({ body, graphics, prq, fullscreen }: {
  body: ReactNode;
  graphics: ReactNode;
  prq: PrqDisplay | null | undefined;
  fullscreen: { available: boolean; on: boolean; toggle: () => void } | null;
}) {
  const slot = useSlotRef('menu');
  return (
    <div data-testid="menu-game-tools" className="flex flex-col gap-1.5">
      {/* A2 (ui.hudZonesUpright): the mode's own pieces portal in here on an upright phone; empty, it takes no room */}
      <div ref={slot.ref} {...slot.attr} className="flex flex-col items-stretch gap-1.5 empty:hidden" />
      <p className={label}>Game</p>
      <div className={row}>{body}</div>
      <div className={row}>{graphics}</div>
      {fullscreen?.available ? (
        <button
          type="button"
          onClick={fullscreen.toggle}
          aria-label={fullscreen.on ? 'Leave full screen' : 'Full screen'}
          className="flex min-h-11 items-center gap-2 rounded-lg border border-white/12 px-2.5 font-mono text-[12px] font-bold
                     uppercase tracking-[0.12em] text-white/60 transition-colors hover:text-white"
        >
          {fullscreen.on ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          <span>{fullscreen.on ? 'Exit full screen' : 'Full screen'}</span>
        </button>
      ) : null}
      <p data-testid="menu-prq" className="pt-1 font-mono text-[12px] text-white/55" style={prq && prq.score !== null ? { color: prq.color } : undefined}>
        {menuPrqLine(prq)}
      </p>
    </div>
  );
}
