'use client';
// components/coach/athlete-sheet/athlete-sheet.tsx — PLATFORM PHASE 5: one athlete, full screen, from a roster avatar or a
// queue card: this week, their numbers, the thread and the program. The shell only; the sections are the coach's
// existing panels, handed in by the Clients view (app/coach/_components/clients-view.tsx), so nothing is rebuilt here.
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { LOOK, initials } from '../coach-queue/look';

export type SheetTab = 'week' | 'numbers' | 'thread' | 'program';
const TABS: { key: SheetTab; label: string }[] = [{ key: 'week', label: 'Week' }, { key: 'numbers', label: 'Numbers' }, { key: 'thread', label: 'Thread' }, { key: 'program', label: 'Program' }];

export function AthleteSheet({ name, line, initial = 'week', onClose, children }: {
  name: string;
  line?: string | null;
  initial?: SheetTab;
  onClose: () => void;
  children: (tab: SheetTab) => ReactNode;
}) {
  const [tab, setTab] = useState<SheetTab>(initial);
  useEffect(() => { setTab(initial); }, [initial, name]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    document.documentElement.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', esc); document.documentElement.style.overflow = ''; };
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={name} className={LOOK.sheet} data-athlete-sheet>
      <div className={LOOK.sheetInner}>
        <div className={LOOK.sheetHead}>
          <button type="button" className={LOOK.outline} onClick={onClose} aria-label="Back"><ArrowLeft className="h-5 w-5" aria-hidden /></button>
          <span className={LOOK.avatar} aria-hidden>{initials(name)}</span>
          <span className="min-w-0">
            <span className={`${LOOK.name} block truncate`}>{name}</span>
            {line && <span className={`${LOOK.quiet} block truncate`}>{line}</span>}
          </span>
        </div>
        <div className={LOOK.tabs} role="tablist">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`${LOOK.tab} ${tab === t.key ? LOOK.tabOn : LOOK.tabOff}`} data-sheet-tab={t.key}>{t.label}</button>
          ))}
        </div>
        <div className="space-y-4" data-sheet-body={tab}>{children(tab)}</div>
      </div>
    </div>
  );
}

/** A full-screen page over the coach home: Setup, the builder, or one of the coach's tools. */
export function FullScreen({ title, onClose, children, testId }: { title: string; onClose: () => void; children: ReactNode; testId?: string }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    document.documentElement.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', esc); document.documentElement.style.overflow = ''; };
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className={LOOK.sheet} data-full-screen={testId ?? title}>
      <div className={LOOK.sheetInner}>
        <div className={LOOK.sheetHead}>
          <button type="button" className={LOOK.outline} onClick={onClose} aria-label="Back"><ArrowLeft className="h-5 w-5" aria-hidden /></button>
          <h2 className={`${LOOK.name} truncate`}>{title}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}
