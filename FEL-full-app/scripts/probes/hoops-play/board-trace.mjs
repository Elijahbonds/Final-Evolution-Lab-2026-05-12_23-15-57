// hoops-play: a top-down picture of one 1v1 board from flow-ext rows — the ball, the rival and the hero from the miss to the board's end —
// knob off beside knob on. Writes ImageMagick's drawing format (MVG); `convert mvg:out.mvg out.jpg` makes the JPG (this box has no SVG
// renderer).   node scripts/probes/hoops-play/board-trace.mjs <off.json> <f0> <f1> <on.json> <f0> <f1> <out.mvg>
import fs from 'node:fs';
const [offF, a0, a1, onF, b0, b1, out] = process.argv.slice(2);
const rows = (f, x0, x1) => JSON.parse(fs.readFileSync(f, 'utf8')).flowRows.filter((r) => r[0] >= +x0 && r[0] <= +x1);
const W = 560, H = 620, X0 = -9.5, X1 = 9.5, Z0 = -2.5, Z1 = 13;   // the court's ball bounds (core/LooseBall HOOPS_BALL_BOUNDS, cut at 13 m)
const P = (x, z) => [20 + (x - X0) / (X1 - X0) * (W - 40), 100 + (z - Z0) / (Z1 - Z0) * (H - 150)];
const esc = (s) => s.replace(/&/g, 'and').replace(/</g, '').replace(/>/g, '');
const q = (t) => `'${t.replace(/'/g, '’')}'`;
function panel(R, dx, title, sub) {
  const g = [];
  const [ax, az] = P(X0, Z0), [bx, bz] = P(X1, Z1);
  g.push(`fill '#14283c' stroke none rectangle ${dx},0 ${dx + W},${H}`);
  g.push(`fill '#1d4a6e' stroke '#7896b4' stroke-width 2 rectangle ${dx + ax},${az} ${dx + bx},${bz}`);
  const [cx, cz] = P(0, -0.6); const rx = 6.75 / (X1 - X0) * (W - 40), rz = 6.75 / (Z1 - Z0) * (H - 150);
  g.push(`fill none stroke '#7896b4' stroke-width 2 ellipse ${dx + cx},${cz} ${rx},${rz} 0,180`);
  g.push(`fill none stroke '#ff8c28' stroke-width 3 circle ${dx + cx},${cz} ${dx + cx + 7},${cz}`);
  const path = (ix, iz, col, w) => {
    const pts = R.filter((r) => Number.isFinite(r[ix]) && Number.isFinite(r[iz])).map((r) => P(r[ix], r[iz]));
    if (pts.length > 1) g.push(`fill none stroke '${col}' stroke-width ${w} stroke-linejoin round polyline ${pts.map(([x, y]) => `${(dx + x).toFixed(1)},${y.toFixed(1)}`).join(' ')}`);
    if (pts.length) { const [x, y] = pts[pts.length - 1]; g.push(`fill '${col}' stroke none circle ${dx + x},${y} ${dx + x + 7},${y}`); }
  };
  path(11, 13, '#ff9632', 3); path(3, 4, '#e650a0', 5); path(1, 2, '#3cc8dc', 5);
  g.push(`fill '#ffffff' stroke none font-size 20 text ${dx + 16},30 ${q(title)}`);
  sub.forEach((t, i) => g.push(`fill '#d2dce6' stroke none font-size 15 text ${dx + 16},${56 + i * 20} ${q(t)}`));
  g.push(`fill '#c8d2dc' stroke none font-size 14 text ${dx + 16},${H - 16} ${q('orange: the ball   pink: the rival   blue: you   (dot: where each ended)')}`);
  return g.join('\n');
}
const off = rows(offF, a0, a1), on = rows(onF, b0, b1);
const sec = (R) => ((R[R.length - 1][0] - R[0][0]) / 60).toFixed(1);
const mvg = `viewbox 0 0 ${W * 2 + 10} ${H}
fill '#000000' rectangle 0,0 ${W * 2 + 10},${H}
font 'DejaVu-Sans'
${panel(off, 0, 'BEFORE: nobody goes for the ball', [`${sec(off)} s after the miss the ball is still loose. The rival`, 'never moves toward it; the game gives up and resets.'])}
${panel(on, W + 10, 'AFTER: the rival runs it down', [`${sec(on)} s after the miss he has chased it and taken it.`, 'Play goes on from there.'])}
`;
fs.writeFileSync(out, mvg);
console.log('wrote', out, 'frames', off.length, on.length);
