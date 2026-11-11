// gameplay-clean-7: the hips' height step a frame (no browser). node hipStep.mjs <dir> <tagA> <tagB> [mode,...]
// Per mode and tag: the frames (playing, off reset frames) where the Hips' height above the root changes ≥ 4 cm in one frame, and the
// largest such step — the hip-height pop the rotation counter cannot see (anim.inertialHipsPos).
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
import { resetFrames } from './popCount.mjs';
const [DIR, A, B, MODES] = process.argv.slice(2);
const load = (m, t) => { const f = path.join(DIR, `${m}-${t}-raw.json.gz`); return fs.existsSync(f) ? JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()).rec : null; };
function steps(rec) {
  const F = rec.frames, skip = resetFrames(F); let n = 0, max = 0;
  for (let i = 1; i < F.length; i++) {
    if (F[i].ph !== 'playing' || skip.has(i) || !F[i].j?.[0] || !F[i - 1].j?.[0] || !F[i].r || !F[i - 1].r) continue;
    const h = F[i].j[0][1] - F[i].r[1], h0 = F[i - 1].j[0][1] - F[i - 1].r[1], d = Math.abs(h - h0);
    if (d >= 0.04) n++; max = Math.max(max, d);
  }
  return { n, max: Math.round(max * 1000) / 10 };
}
const modes = MODES ? MODES.split(',') : [...new Set(fs.readdirSync(DIR).filter((f) => f.endsWith(`-${A}-raw.json.gz`)).map((f) => f.replace(`-${A}-raw.json.gz`, '')))].sort();
for (const m of modes) { const a = load(m, A), b = load(m, B); if (!a || !b) continue; const x = steps(a), y = steps(b); console.log(`${m.padEnd(16)} hip steps ≥ 4 cm: ${x.n} → ${y.n}   largest ${x.max} → ${y.max} cm`); }
