// _reel-frames — full-size frames out of a reel's .webm at given times (no ffmpeg on this machine): the video in a page, seeked, drawn
// to a canvas, the canvas saved. H3d (the shot meter, D9: readable) — the reel strips are too small to read a 1.1 m bar beside a head.
//   npx tsx scripts/probes/_reel-frames.mts <file.webm> <out-prefix> <ms,ms,...> [crop: x,y,w,h in the video's pixels]
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

const [file, prefix, msList, crop] = process.argv.slice(2);
const times = msList.split(',').map(Number);
const EXE = process.env.CHROMIUM_EXE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b64 = readFileSync(file).toString('base64');
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage();
await page.setContent('<video id="v" muted></video><canvas id="c"></canvas>');
await page.evaluate(`(async () => { const v = document.getElementById('v'); v.src = 'data:video/webm;base64,${b64}'; await new Promise((r) => { v.onloadeddata = r; }); })()`);
for (const ms of times) {
  const png = await page.evaluate(`(async () => {
    const v = document.getElementById('v'), c = document.getElementById('c');
    // a MediaRecorder webm has no duration index: seek past the end once so the browser learns it, then seek for real
    if (!isFinite(v.duration)) { v.currentTime = 1e6; await new Promise((r) => { v.onseeked = r; }); }
    v.currentTime = ${ms} / 1000; await new Promise((r) => { v.onseeked = r; });
    const cr = ${crop ? `[${crop}]` : 'null'};
    const sx = cr ? cr[0] : 0, sy = cr ? cr[1] : 0, sw = cr ? cr[2] : v.videoWidth, sh = cr ? cr[3] : v.videoHeight;
    c.width = sw; c.height = sh; c.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, sw, sh);
    return c.toDataURL('image/png').split(',')[1];
  })()`) as string;
  writeFileSync(`${prefix}-${ms}.png`, Buffer.from(png, 'base64'));
}
await browser.close();
console.log(`${times.length} frames → ${prefix}-*.png`);
