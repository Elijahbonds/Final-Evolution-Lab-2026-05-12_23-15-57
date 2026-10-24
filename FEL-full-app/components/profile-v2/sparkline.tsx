// A history line in plain SVG (PROFILE V2): no chart library, no client JavaScript, nothing to hydrate. The owner asked
// for "a lightweight chart"; chart.js / recharts / plotly are in package.json, but each is tens of kB of script on a
// phone for a line of eight points. A week with no reading is a GAP in the line, never a zero.

export function Sparkline({
  values, color, height = 36, width = 160, label,
}: { values: readonly (number | null)[]; color: string; height?: number; width?: number; label: string }) {
  const real = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!real.length) return null;
  const lo = Math.min(...real), hi = Math.max(...real);
  const span = hi - lo || 1;
  const pad = 4;
  const x = (i: number) => (values.length <= 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (values.length - 1));
  const y = (v: number) => (hi === lo ? height / 2 : height - pad - ((v - lo) / span) * (height - 2 * pad));
  // runs of consecutive readings become one polyline each, so a gap stays a gap
  const runs: [number, number][][] = [];
  let cur: [number, number][] = [];
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) { if (cur.length) runs.push(cur); cur = []; return; }
    cur.push([x(i), y(v)]);
  });
  if (cur.length) runs.push(cur);
  const lastIdx = values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop()!;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" className="block overflow-visible">
      <line x1={pad} x2={width - pad} y1={height - 1} y2={height - 1} stroke="rgba(255,255,255,0.08)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {runs.map((r, k) => (r.length > 1
        ? <polyline key={k} points={r.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        : <Dot key={k} x={r[0][0]} y={r[0][1]} color={color} size={4} />))}
      <Dot x={x(lastIdx)} y={y(values[lastIdx] as number)} color={color} size={6} />
    </svg>
  );
}

/** A dot that stays round when the line stretches to its box: a zero-length stroke with a round cap, in screen pixels. */
function Dot({ x, y, color, size }: { x: number; y: number; color: string; size: number }) {
  return <line x1={x} y1={y} x2={x} y2={y} stroke={color} strokeWidth={size} strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
}
