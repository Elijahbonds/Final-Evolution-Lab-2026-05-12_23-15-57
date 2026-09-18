// _crop — magnify a region of a captured frame (x,y,w,h in the PNG's own pixels, scaled by Z).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const [file, X, Y, W, H, Z] = [process.env.FILE!, +(process.env.X ?? 0), +(process.env.Y ?? 0), +(process.env.W ?? 400), +(process.env.H ?? 400), +(process.env.Z ?? 2)];
const b = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const p = await b.newPage({ viewport: { width: Math.round(W * Z), height: Math.round(H * Z) } });
const img = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
await p.setContent(`<body style="margin:0;overflow:hidden"><img src="${img}" style="position:absolute;left:${-X * Z}px;top:${-Y * Z}px;transform-origin:0 0;transform:scale(${Z})"></body>`);
await p.screenshot({ path: process.env.OUT ?? '/tmp/crop.png' });
await b.close();
console.log(process.env.OUT ?? '/tmp/crop.png');
