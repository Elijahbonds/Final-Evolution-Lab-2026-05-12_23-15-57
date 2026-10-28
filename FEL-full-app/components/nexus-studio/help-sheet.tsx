'use client';

// HELP (STUDIO-EASY, 2026-10-28): the Studio's "?" — every key in one list (lib/nexus-studio/shortcuts.ts), the first-court guide
// again, and where the work is kept. Before this the keys lived only in tooltips, which a touch screen never shows. Opened by the
// header's Help button or "?" anywhere; Esc or the close button shuts it, and focus goes back where it was.

import { useEffect, useRef } from 'react';
import { X, Sparkles, Keyboard } from 'lucide-react';
import { TYPE } from '@/lib/design/type';
import { SCOPE_LABEL, SHORTCUTS, shortcutLabel, type ShortcutScope } from '@/lib/nexus-studio/shortcuts';
import { C } from './ui';

export function HelpSheet({ onClose, onGuide }: { onClose(): void; onGuide(): void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); back?.focus?.(); };
  }, [onClose]);
  const scopes: ShortcutScope[] = ['everywhere', 'venue'];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose} data-own-input>
      <div role="dialog" aria-modal="true" aria-labelledby="studio-help-title" data-testid="studio-help"
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border p-5 sm:rounded-2xl"
        style={{ background: C.surface, borderColor: C.line }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="studio-help-title" className={`${TYPE.heading} text-white`}>Help</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close help" className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/5" style={{ color: C.dim }}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <button type="button" onClick={onGuide} data-testid="help-guide"
          className="fel-press mt-3 flex min-h-11 w-full items-center gap-2 rounded-xl border px-4 text-left font-sans text-[14px] font-semibold" style={{ borderColor: 'rgba(0,229,255,0.35)', color: C.cyan, background: 'rgba(0,229,255,0.08)' }}>
          <Sparkles className="h-4 w-4" aria-hidden /> Show me how: make your first court
        </button>
        <p className={`${TYPE.small} mt-3`} style={{ color: 'var(--fel-text-soft, #c3cad3)' }}>Your work saves on this device as you go. Undo takes back any step.</p>
        <h3 className={`${TYPE.label} mt-5 flex items-center gap-2`} style={{ color: C.dim }}><Keyboard className="h-4 w-4" aria-hidden /> Keys</h3>
        {scopes.map((scope) => (
          <section key={scope} className="mt-3" aria-label={SCOPE_LABEL[scope]}>
            <h4 className="font-sans text-[14px] font-semibold text-white">{SCOPE_LABEL[scope]}</h4>
            <dl className="mt-1 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1">
              {SHORTCUTS.filter((s) => s.scope === scope).map((s) => (
                <div key={`${s.keys}-${s.does}`} className="contents">
                  <dt><kbd className="rounded border px-1.5 py-0.5 font-sans text-[13px]" style={{ borderColor: C.line, color: C.text, background: C.surface2 }}>{shortcutLabel(s.keys, mac)}</kbd></dt>
                  <dd className="font-sans text-[14px]" style={{ color: 'var(--fel-text-soft, #c3cad3)' }}>{s.does}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
