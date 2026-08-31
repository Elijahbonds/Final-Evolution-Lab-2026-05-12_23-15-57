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
// It mirrors the course formula in rideWorlds.ts -- if that changes, this needs
// to change with it, and the mismatch will show up as a low gate count.
//
//   npx tsx scripts/slalom-drive.mts

import { chromium } from 'playwright-core';

const PITCH = 0.22;
const GATES = Array.from({ length: 12 }, (_, i) => ({
  x: i === 0 ? 0 : (i % 2 === 0 ? -1 : 1) * (3.2 + (i / 11) * 1.8),
  z: Math.cos(PITCH) * (18 + i * 20),
}));

const b = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
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
console.log(`slalom-drive: gates ${gates}   final z ${h ? h.z.toFixed(1) : '?'}m of ${GATES[11].z.toFixed(0)}m`);
const frame = errs.filter((e) => /FEL-FRAME/.test(e)).length;
const miss = errs.filter((e) => /MISSING CLIP/.test(e)).length;
console.log(`slalom-drive: FEL-FRAME ${frame} | MISSING CLIP ${miss} | errors ${errs.length - frame - miss}`);
await b.close();
