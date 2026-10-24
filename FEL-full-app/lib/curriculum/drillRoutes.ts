// A drill names a mode key and links to its /play route. DERBY-KEY (2026-10-23): the alias that sent 'derby' to
// /play/baseball is gone — the derby has its own route, /play/derby, and /play/baseball is the three-inning game.
const DRILL_ROUTE_ALIASES: Record<string, string> = {};

export function drillPlayHref(modeKey: string): string {
  return `/play/${DRILL_ROUTE_ALIASES[modeKey] ?? modeKey}`;
}
