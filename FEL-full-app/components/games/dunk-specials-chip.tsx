// HUD-SEASONPASS-LABEL (2026-10-20): the dunk HUD's SEASON SPECIALS chip, pulled out of dunk-babylon.tsx so its guest rule can be
// rendered in a test. The kangaroo, the sky tap, the board-top flip and the backboard run are the PRO lane's — named and locked for a
// signed-in player, never missing. A guest on /try (no account, nothing to buy) is not shown the pass label at all.
import { HudChip } from './tv-hud';
import type { HudValue } from '@/lib/babylon';

export function DunkSpecialsChip({ specials, guest = false }: { specials: HudValue | undefined; guest?: boolean }) {
  if (guest || specials !== 'LOCKED') return null;
  return <HudChip tone="score" alpha={0.8} size="caption" style={{ fontWeight: 700 }}>SPECIALS · SEASON PASS</HudChip>;
}
