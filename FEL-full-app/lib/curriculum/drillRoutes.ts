const DRILL_ROUTE_ALIASES: Record<string, string> = {
  derby: 'baseball',
};

export function drillPlayHref(modeKey: string): string {
  return `/play/${DRILL_ROUTE_ALIASES[modeKey] ?? modeKey}`;
}

