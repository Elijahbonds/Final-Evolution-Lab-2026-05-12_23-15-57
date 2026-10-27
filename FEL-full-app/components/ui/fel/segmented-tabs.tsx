'use client';
// SEGMENTED TABS (lane/premium-ui P1): a few views of one thing (Today / Week / All). A real tablist: arrow keys, Home and
// End move between tabs (and a pad's d-pad, which lib/nav/focus.ts turns into arrows), the selected tab is the only Tab
// stop, and the lit segment is a soft white pill, so the one accent stays for the action.
import { useRef, type KeyboardEvent } from 'react';
import { TYPE } from '@/lib/design/type';
import { pressFeedback } from '@/lib/design/feedback';

export interface Segment { id: string; label: string }

export function nextSegment(ids: readonly string[], current: string, key: string): string | null {
  const i = ids.indexOf(current);
  if (i < 0) return null;
  if (key === 'ArrowRight' || key === 'ArrowDown') return ids[(i + 1) % ids.length];
  if (key === 'ArrowLeft' || key === 'ArrowUp') return ids[(i - 1 + ids.length) % ids.length];
  if (key === 'Home') return ids[0];
  if (key === 'End') return ids[ids.length - 1];
  return null;
}

export function SegmentedTabs({ items, value, onChange, label, idBase = 'fel-seg' }: {
  items: readonly Segment[]; value: string; onChange: (id: string) => void; label: string; idBase?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: KeyboardEvent) => {
    const n = nextSegment(items.map((i) => i.id), value, e.key);
    if (!n) return;
    e.preventDefault();
    onChange(n);
    refs.current[n]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey}
      className="inline-flex gap-1 rounded-full border border-[color:var(--fel-hairline)] bg-white/[0.03] p-1">
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button key={it.id} ref={(el) => { refs.current[it.id] = el; }} type="button" role="tab" id={`${idBase}-${it.id}`}
            aria-selected={on} tabIndex={on ? 0 : -1}
            onClick={() => { pressFeedback('tap'); onChange(it.id); }}
            className={`fel-press min-h-10 rounded-full px-4 ${TYPE.label} ${on ? 'bg-white/[0.14] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]' : 'text-fel-dim hover:text-white'}`}>
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
