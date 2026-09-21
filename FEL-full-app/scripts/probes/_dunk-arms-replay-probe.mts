// DUNK ARMS + REPLAY diag (2026-09-20): four owner complaints in one readout — the opponent's arms, the replay,
// and whether the run and the dribble look like a basketball player.
//
// Measured in the BODY'S OWN FRAME, not world: a character is spawned at an arbitrary yaw, so a wrist's world x
// tells you nothing. Everything below is metres along the body's right / up / forward axes, taken off the root's
// world matrix, which is the mistake the posture passes kept making.
import { chromium } from 'playwright-core';

const PORT = process.env.PORT ?? '3011';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
p.on('pageerror', (e) => console.log('  pageerror:', String(e).slice(0, 160)));

await p.goto(`http://localhost:${PORT}/dev/mode/dunk`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 90000 });
await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
await p.waitForTimeout(3000);

// A fake pad, the way every other dunk probe drives this mode.
await p.evaluate(`(() => { const pad = { index: 0, id: 'fake (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0, buttons: Array.from({length:17},()=>({pressed:false,touched:false,value:0})) }; window.__PAD = pad; navigator.getGamepads = () => [pad]; })()`);
const padSet = async (js: string) => { await p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`); };

/** The measuring stick, installed once and called at each beat. */
await p.evaluate(`(() => {
  window.__ARM = (which) => {
    const dev = window.__FEL_DEV__, scene = dev.scene;
    const rootOf = (n) => { while (n && n.parent) n = n.parent; return n; };
    const hero = dev.hero();
    const roots = [...new Set(scene.meshes.filter(m => m.skeleton && m.isEnabled() && m.isVisible).map(m => rootOf(m)))];
    // THE NEAREST BODY IS THE RIVAL. An earlier version of this probe took the first non-hero root and measured
    // a SPECTATOR ten metres up in the stands — this scene has seven skinned bodies and only two of them are
    // playing the contest. "skeletons[0] is a spectator" is a trap this codebase has hit before.
    const hp = hero.getAbsolutePosition();
    const others = roots.filter(r => r !== hero).map(r => {
      const rp = r.getAbsolutePosition();
      return { r, d: Math.hypot(rp.x - hp.x, rp.z - hp.z) };
    }).sort((a, b) => a.d - b.d);
    const pick = which === 'hero' ? hero : which === 'crowd' ? (others[others.length - 1] || {}).r : (others[0] || {}).r;
    if (!pick) return { error: 'no ' + which };
    const mesh = scene.meshes.find(m => m.skeleton && rootOf(m) === pick);
    const skel = mesh && mesh.skeleton;
    if (!skel) return { error: 'no skeleton for ' + which };

    const bone = (n) => skel.bones.find(b => b.name === n || b.name.endsWith(':' + n) || b.name.endsWith('_' + n));
    const wpos = (bn) => { const t = bn && bn.getTransformNode && bn.getTransformNode(); if (t) return t.getAbsolutePosition(); return bn ? bn.getAbsolutePosition(mesh) : null; };

    // Plain arithmetic: the app imports Babylon as a module, so there is no BABYLON global in the page.
    const M = pick.getWorldMatrix().m;
    const norm = (v) => { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/L, v[1]/L, v[2]/L]; };
    const right = norm([M[0], M[1], M[2]]);
    const up    = norm([M[4], M[5], M[6]]);
    const fwd   = norm([M[8], M[9], M[10]]);
    const origin = pick.getAbsolutePosition();
    const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
    const local = (v) => {
      if (!v) return null;
      const d = [v.x - origin.x, v.y - origin.y, v.z - origin.z];
      return { r: +dot(d, right).toFixed(3), u: +dot(d, up).toFixed(3), f: +dot(d, fwd).toFixed(3) };
    };

    const names = ['LeftArm','RightArm','LeftForeArm','RightForeArm','LeftHand','RightHand','Hips','Spine'];
    const out = {};
    for (const n of names) out[n] = local(wpos(bone(n)));
    out.__root = { x: +origin.x.toFixed(2), y: +origin.y.toFixed(2), z: +origin.z.toFixed(2) };
    out.__name = pick.name;
    out.__bones = skel.bones.length;
    return out;
  };
  window.__HUD = () => document.body.innerText.replace(/\\s+/g,' ').slice(0, 260);
})()`);

const arm = async (which: string) => p.evaluate(`window.__ARM('${which}')`);
const hud = async () => p.evaluate(`window.__HUD()`);

const show = (tag: string, a: any) => {
  if (!a || a.error) { console.log(`  ${tag}: ${a?.error ?? 'null'}`); return; }
  const f = (p: any) => p ? `r${p.r >= 0 ? '+' : ''}${p.r} u${p.u >= 0 ? '+' : ''}${p.u} f${p.f >= 0 ? '+' : ''}${p.f}` : 'missing';
  console.log(`  ${tag}  ${a.__name} at ${a.__root?.x},${a.__root?.z}  bones=${a.__bones}`);
  console.log(`     L arm ${f(a.LeftArm)} | fore ${f(a.LeftForeArm)} | hand ${f(a.LeftHand)}`);
  console.log(`     R arm ${f(a.RightArm)} | fore ${f(a.RightForeArm)} | hand ${f(a.RightHand)}`);
};

console.log('\n=== 1. STANDING, before anything happens ===');
show('HERO ', await arm('hero'));
show('RIVAL', await arm('rival'));
show('CROWD', await arm('crowd'));

// START
await padSet('p.buttons[0].pressed = true; p.buttons[0].value = 1');
await p.waitForTimeout(90);
await padSet('p.buttons[0].pressed = false; p.buttons[0].value = 0');
await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 }).catch(() => console.log('  (no "playing" marker)'));
await p.waitForTimeout(2200);

console.log('\n=== 2. IN PLAY, idle at the top of the runway ===');
show('HERO ', await arm('hero'));
show('RIVAL', await arm('rival'));
console.log('  HUD:', await hud());

console.log('\n=== 3. RUNNING (stick forward, 700 ms) ===');
await padSet('p.axes[1] = -1');
await p.waitForTimeout(700);
show('HERO ', await arm('hero'));

console.log('\n=== 4. HOLD-RUN / dribble drive (R trigger held) ===');
await padSet('p.buttons[7].pressed = true; p.buttons[7].value = 1');
await p.waitForTimeout(700);
show('HERO ', await arm('hero'));
await padSet('p.buttons[7].pressed = false; p.buttons[7].value = 0; p.axes[1] = 0');

console.log('\n=== 5. A DUNK, then the replay ===');
await padSet('p.axes[1] = -1');
await p.waitForTimeout(900);
await padSet('p.buttons[0].pressed = true; p.buttons[0].value = 1');
await p.waitForTimeout(140);
await padSet('p.buttons[0].pressed = false; p.buttons[0].value = 0; p.axes[1] = 0');

for (let i = 0; i < 12; i++) {
  await p.waitForTimeout(600);
  const h = await hud();
  if (/replay|REPLAY/i.test(h)) { console.log(`  t+${(i + 1) * 0.6}s REPLAY: ${h.slice(0, 160)}`); break; }
  if (i % 3 === 0) console.log(`  t+${(i + 1) * 0.6}s ${h.slice(0, 130)}`);
}
console.log('\n  during/after the flight:');
show('HERO ', await arm('hero'));

await p.screenshot({ path: '/tmp/dunk-arms-probe.png' });
console.log('\n  shot: /tmp/dunk-arms-probe.png');
await b.close();
