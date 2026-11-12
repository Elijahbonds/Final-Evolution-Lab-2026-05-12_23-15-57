// device-perf (2026-11-12): does this box's headless Chromium expose WebGPU at all, and under which flags?
//   npx tsx scripts/probes/device-perf/webgpu-avail.mts
// The last line is BEST=<flags> (empty when no set gave an adapter).
// Tries a few launch-flag sets on about:blank and reports navigator.gpu, the adapter and its info. No server needed.
import { chromium } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';

const SETS: Record<string, string[]> = {
  plain: [],
  unsafe: ['--enable-unsafe-webgpu'],
  'unsafe+swiftshader-vulkan': ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader'],
  'unsafe+angle-swiftshader': ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan,WebGPUService'],
  'unsafe+dawn-swiftshader+headless-new': ['--headless=new', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface'],
};
let best: string | null = null;
for (const [name, args] of Object.entries(SETS)) {
  const b = await chromium.launch({ executablePath: chromiumExe(), args });
  try {
    const p = await b.newPage();
    await p.goto('about:blank');
    const r = await p.evaluate(async () => {
      const g = (navigator as unknown as { gpu?: { requestAdapter(o?: unknown): Promise<unknown> } }).gpu;
      if (!g) return { gpu: false };
      try {
        const a = await Promise.race([g.requestAdapter(), new Promise((r) => setTimeout(() => r(null), 15000))]) as { info?: Record<string, string>; features?: Set<string> } | null;
        if (!a) return { gpu: true, adapter: null };
        const info = a.info ? { vendor: a.info.vendor, architecture: a.info.architecture, device: a.info.device, description: a.info.description } : null;
        return { gpu: true, adapter: true, info, isFallback: (a as { isFallbackAdapter?: boolean }).isFallbackAdapter ?? null };
      } catch (e) { return { gpu: true, error: String(e) }; }
    });
    console.log(name.padEnd(40), JSON.stringify(r));
    if (best === null && (r as { adapter?: unknown }).adapter === true) best = args.join(' ');
  } finally { await b.close(); }
}
// the first set that gave an adapter, for ./run.sh to hand to ./readout-run.mts as CHROME_ARGS
console.log(`BEST=${best ?? ''}`);
