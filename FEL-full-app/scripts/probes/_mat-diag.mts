// _mat-diag — the PBR values behind every material the athletes and the venue carry (MODE=dunk): class, albedo, metallic,
// roughness, env intensity, emissive, textures. Pass 7 phase 7 (materials) starts from these numbers.
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'dunk';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(12000);
console.log(await p.evaluate(`(() => { const s = window.__FEL_DEV__?.scene; if (!s) return 'no scene'; const rows = [];
  const used = new Map(); for (const m of s.meshes) { if (!m.material || !m.isVisible || !m.isEnabled()) continue; const k = m.material.uniqueId; used.set(k, (used.get(k) ?? 0) + 1); }
  for (const mat of s.materials) { if (!used.has(mat.uniqueId)) continue; const a = mat.albedoColor ?? mat.diffuseColor; rows.push({ name: mat.name.slice(0, 30), cls: mat.getClassName().replace('Material',''), n: used.get(mat.uniqueId),
    albedo: a?.toHexString?.(), metal: mat.metallic, rough: mat.roughness ?? (mat.specularPower != null ? 'sp' + mat.specularPower : undefined), env: mat.environmentIntensity, emis: mat.emissiveColor?.toHexString?.(),
    tex: [mat.albedoTexture && 'A', mat.bumpTexture && 'N', mat.metallicTexture && 'M', mat.emissiveTexture && 'E', mat.detailMap?.isEnabled && 'D'].filter(Boolean).join(''), unlit: mat.unlit || mat.disableLighting || undefined, alpha: mat.alpha < 1 ? mat.alpha : undefined }); }
  rows.sort((x, y) => y.n - x.n); return JSON.stringify(rows); })()`));
await b.close();
