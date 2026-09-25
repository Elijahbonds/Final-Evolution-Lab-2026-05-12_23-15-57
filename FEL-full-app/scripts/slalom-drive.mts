// Snowboard slalom — proof the course can actually be RIDDEN.
//
// The generic capture bot holds forward and alternates a blind carve, which is
// useless here: a slalom is about aiming, so a bot that cannot see the gates
// scores 1 of 12 whether the course is fair or impossible. That ambiguity sent
// me off diagnosing gate placement when the real fault was propulsion (the mode
// passed a hard-coded 0 where the momentum model wanted the tuck).
//
// This drives the real mode through the real route, reads the rider's position
// from the agent bridge, and steers toward the next gate the way a player would.
// It imports the course definition from rideWorlds.ts rather than restating it,
// so the driver and the world cannot disagree about where the gates are.
//
//   npx tsx scripts/slalom-drive.mts

import { chromium } from 'playwright-core';
import { chromiumExe } from './probes/_chromium.mts';
// DYNAMIC import, not a static one: this file is .mts (ESM, for top-level
// await) while tsx transpiles the imported .ts as CJS, so a static named import
// fails to resolve at load time even though the exports exist. Awaiting the
// module gets the same names at runtime.
const course = await import('../lib/babylon/modes/rideWorlds');
const { SLALOM_GATES, SLOPE_PITCH, slalomGateDist, slalomGateX } = course;

// Aim with the course's OWN definition. This file used to mirror the formula,
// and its header warned the two would drift; now there is nothing to drift from.
const GATES = Array.from({ length: SLALOM_GATES }, (_, i) => ({
  x: slalomGateX(i),
  z: Math.cos(SLOPE_PITCH) * slalomGateDist(i),
}));

const b = await chromium.launch({
  executablePath: chromiumExe(),
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs: string[] = [];
p.on('console', (m) => { if (m.type() === 'error' || /FEL-FRAME|MISSING CLIP/.test(m.text())) errs.push(m.text().slice(0, 150)); });

await p.goto('http://localhost:3000/dev/mode/snowboard_slalom?agent=1', { waitUntil: 'load' });
await p.waitForSelector('canvas', { timeout: 30_000 });
await p.waitForTimeout(2500);
const head = async () => (await p.evaluate<string>('document.body.innerText')).split('\n')[0];
if (/·\s*(ready|loading)/i.test(await head())) {
  await p.getByText(/^START$/).first().click({ force: true }).catch(() => {});
}
await p.evaluate('document.activeElement && document.activeElement.blur()');
await p.waitForTimeout(2000);

const hero = async (): Promise<{ x: number; y: number; z: number } | null> => {
  const raw = await p.evaluate<string>("JSON.stringify(window.__NEXUS_AGENT__ ? window.__NEXUS_AGENT__.state().hero : null)");
  return JSON.parse(raw) as { x: number; y: number; z: number } | null;
};
const hudGates = async (): Promise<string> => {
  const t = await p.evaluate<string>('document.body.innerText');
  return /"gates"\s*:\s*"([^"]+)"/.exec(t)?.[1] ?? '?';
};

await p.keyboard.down(' ');                       // tuck: the accelerator
let lean: 'a' | 'd' | null = null;
const hold = async (want: 'a' | 'd' | null) => {
  if (want === lean) return;
  if (lean) await p.keyboard.up(lean);
  if (want) await p.keyboard.down(want);
  lean = want;
};

for (let step = 0; step < 700; step++) {
  const h = await hero();
  if (!h) break;
  // Land a spin every so often: it is the only thing that FILLS the boost
  // meter, and the tuck held below is what spends it. Without this the run
  // never exercises the mode's boost economy at all.
  if (step % 45 === 20) await p.keyboard.press('k');
  const gate = GATES.find((g) => g.z > h.z - 1);
  if (!gate) break;
  const dx = gate.x - h.x;
  // Steer toward the gate; release inside a deadband so the board settles
  // rather than sawing back and forth across the line.
  await hold(Math.abs(dx) < 0.6 ? null : dx > 0 ? 'd' : 'a');
  await p.waitForTimeout(30);
}
await hold(null);
await p.keyboard.up(' ');
await p.waitForTimeout(500);

const h = await hero();
const gates = await hudGates();
const hudOf = async (k: string): Promise<string> => {
  const t = await p.evaluate<string>('document.body.innerText');
  return new RegExp(`"${k}"\\s*:\\s*"?([^,"}]+)`).exec(t)?.[1] ?? '?';
};
console.log(`slalom-drive: gates ${gates}   score ${await hudOf('score')}   boost ${await hudOf('boost')}   final z ${h ? h.z.toFixed(1) : '?'}m of ${GATES[GATES.length - 1].z.toFixed(0)}m`);
const frame = errs.filter((e) => /FEL-FRAME/.test(e)).length;
const miss = errs.filter((e) => /MISSING CLIP/.test(e)).length;
console.log(`slalom-drive: FEL-FRAME ${frame} | MISSING CLIP ${miss} | errors ${errs.length - frame - miss}`);
await b.close();
