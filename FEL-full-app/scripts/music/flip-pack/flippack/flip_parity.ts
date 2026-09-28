// flip_parity.ts — runs the REAL Flip.ts onset finder over float32 dumps and compares with onsets_check.py.
// Driven by `onsets_check.py --parity FILE ...` (it writes the dumps + manifest and calls this with tsx):
//   <repo>/node_modules/.bin/tsx flip_parity.ts <manifest.json>
// manifest: { flipTs: "<abs path to lib/babylon/music/Flip.ts>", cases: [{ name, f32, sr, want: number[] }] }
// Exit 0 = every slice start is identical (sample for sample).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

interface Case { name: string; f32: string; sr: number; want: number[] }

async function main() {
  const manifest = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { flipTs: string; cases: Case[] };
  const flip = await import(pathToFileURL(manifest.flipTs).href);
  let ok = true;
  for (const c of manifest.cases) {
    const b = readFileSync(c.f32);
    const a = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
    const got: number[] = flip.onsetSlices(a, c.sr).map((s: { start: number }) => s.start);
    const same = JSON.stringify(got) === JSON.stringify(c.want);
    ok &&= same;
    console.log(`${same ? 'SAME' : 'DIFF'} ${c.name} @${c.sr}: ${got.length} slices${same ? '' : ` ts=${JSON.stringify(got)} py=${JSON.stringify(c.want)}`}`);
  }
  console.log(ok ? 'PARITY OK' : 'PARITY FAIL');
  process.exit(ok ? 0 : 1);
}
void main();
