// EMPTY STATE (lane/premium-ui P1): nothing here yet is a moment, not a blank. A figure (the player's avatar, or a soft
// ring), one line of what goes here, and the one action that fills it.
import type { ReactNode } from 'react';
import { TYPE } from '@/lib/design/type';

function Halo() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden>
      <defs>
        <radialGradient id="fel-halo" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#00E5FF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="48" cy="48" r="46" fill="url(#fel-halo)" />
      <circle cx="48" cy="48" r="30" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="6" />
      <path d="M48 18 A30 30 0 0 1 78 48" fill="none" stroke="#00E5FF" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyState({ art, title, line, action, testId }: {
  art?: ReactNode; title: string; line?: string; action?: ReactNode; testId?: string;
}) {
  return (
    <div data-testid={testId} data-fel-empty className="fel-surface flex flex-col items-center gap-3 px-6 py-8 text-center">
      <div className="mb-1">{art ?? <Halo />}</div>
      <p className={`${TYPE.heading} text-white`}>{title}</p>
      {line && <p className={`${TYPE.small} max-w-xs text-fel-dim`}>{line}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
