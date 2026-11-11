'use client';
// Fold — EVERY-SCREEN P5: a set-up guide or other reading that is one tap away. A closed <details> still lays its text out
// (the rig's phone counted every hidden line as "words before scrolling"; phase 4 found it on the builder), so this is a
// button and a block that is not rendered until it is opened. The words inside are the screen's own, unchanged.
import { useState, type ReactNode } from 'react';
import { TYPE } from '@/lib/design/type';

export function Fold({ summary, children, className = '', testId }: { summary: string; children: ReactNode; className?: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className} data-fold={testId ?? ''} data-fold-open={open ? '1' : '0'}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`flex min-h-11 w-full items-center gap-2 text-left ${TYPE.small} font-semibold text-white/80`}>
        <span aria-hidden>{open ? '▾' : '▸'}</span>{summary}
      </button>
      {open ? <div className="pb-1">{children}</div> : null}
    </div>
  );
}
