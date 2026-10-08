// The "2 PLAYERS" chip a multiplayer game wears on the shelf and the catalogue (MULTIPLAYER lane, 2026-10-06).
// Nothing for a game that does not really seat more than one person (lib/party/catalog.ts says which do).
import { partyModeFor, playersBadge } from '@/lib/party/catalog';

export function PartyBadge({ modeKey, className = '' }: { modeKey: string; className?: string }) {
  const m = partyModeFor(modeKey);
  if (!m) return null;
  return (
    <span data-party-badge={m.id} className={`inline-block rounded px-1.5 py-0.5 align-middle font-mono text-[9px] font-bold tracking-wider ${className}`}
      style={{ background: '#00E5FF1f', color: '#00E5FF', border: '1px solid #00E5FF44' }}>
      {playersBadge(m)}
    </span>
  );
}
