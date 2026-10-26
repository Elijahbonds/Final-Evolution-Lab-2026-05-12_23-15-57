// The bar-speed tool on a phone, with no server (VBT, 2026-10-25). Bundled by scripts/probes/_vbt-probe.mts with esbuild
// and loaded into headless Chromium at 390 px. Every number is a real read: the camera is the pose service's own feed
// (lib/pose/PoseService.ts beginFeed / pushFeed), pushed a set filmed in the page by the VBT bench (lib/vbt/bench.ts:
// a bar path with known speed); for a barbell the plate tracker reads a grey frame DRAWN at the bench's plate for each
// frame (lib/vbt/plate.ts drawPlateFrame), through the component's `grab` seam. The API is answered by the server's
// own pure reads where it matters (the kept set is validated by cleanSet).
//   barbell   an adult who saves: 6 squat reps slowing 0.80 → 0.62 m/s at 100 kg, read at the plate; the 20 % cue
//   profile   the same with two earlier loads on the phone: the load-velocity line, e1RM ±, loads for the coach's zone
//   warmup    a warm-up at 100 kg against five normal days: Low (the readiness rules)
//   body      push-ups, read at the shoulders (pose only)
//   teen      a 15-year-old: technique speed only, nothing kept, no med ball, no e1RM
//   slowmo    a 240 fps clip exported at 30 fps, read through the decoder seam (×8 clock)
//   coach     the coach's view: a client who shares, one who does not, a team, zone targets
//   refused   under 13: one line, no camera
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { VelocitySession } from '@/components/vbt/velocity-session';
import { CoachVelocity } from '@/components/vbt/coach-velocity';
import { poseService } from '@/lib/pose/PoseService';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { filmSet, type BenchRep } from '@/lib/vbt/bench';
import { LIFTS, type LiftId } from '@/lib/vbt/lifts';
import { drawPlateFrame, type Luma } from '@/lib/vbt/plate';
import { cleanSet, DEVICE_SETS_KEY, type KeptSet } from '@/lib/vbt/sets';
import { featuresFor } from '@/lib/vbt/gate';
import { UNDER_13_LINE } from '@/lib/vbt/copy';
import { localDayKey } from '@/lib/health/readiness';
import type { PlateObs } from '@/lib/vbt/track';

const scene = location.hash.slice(1) || 'barbell';
type W = Window & { __frames(): PoseFrame[]; __feedBegin(): void; __feedPush(f: PoseFrame, plate: PlateObs | null): void; __SENT__: { method: string; url: string; body: string }[]; __truth: number[] };
const w = window as unknown as W;
w.__SENT__ = [];
let plate: PlateObs | null = null;
w.__feedBegin = () => poseService().beginFeed();
w.__feedPush = (f, p) => { plate = p; poseService().pushFeed(f); };

const H = 240, ASPECT = 9 / 16, WPX = Math.round(H * ASPECT);
let n = 0;
const grab = (): Luma | null => (plate ? drawPlateFrame(WPX, H, { cx: plate.cx * H, cy: plate.cy * H, r: plate.r * H }, { seed: ++n, noise: 6, clutter: true }) : drawPlateFrame(WPX, H, null, { seed: ++n }));

const lift: LiftId = scene === 'body' ? 'push_up' : 'back_squat';
const speeds = scene === 'body' ? [0.9, 0.85, 0.8, 0.72, 0.66] : scene === 'warmup' ? [0.55, 0.54, 0.53] : scene === 'teen' ? [0.8, 0.78, 0.76, 0.74] : [0.8, 0.78, 0.74, 0.7, 0.66, 0.62];
const rom = scene === 'body' ? 0.3 : 0.5;
w.__frames = () => {
  const reps: BenchRep[] = speeds.map((v) => ({ romM: rom, concMs: (rom / v) * 1000 }));
  const f = filmSet(LIFTS[lift], { reps, leadMs: 1500 }, { fps: 60, seed: 7, plate: lift === 'back_squat' });
  w.__truth = f.truth.map((t) => Math.round(t.mcv * 1000) / 1000);
  return f.frames.map((fr) => ({ t: fr.t, present: true, image: fr.image as PoseFrame['image'], ...(fr.plate ? { plateTruth: fr.plate } : {}) }) as PoseFrame);
};

const TODAY = localDayKey(new Date());
const dayAgo = (k: number) => localDayKey(new Date(Date.now() - k * 86_400_000));
const set = (o: Partial<KeptSet>): KeptSet => cleanSet({ day: dayAgo(3), at: Date.now() - 3 * 86_400_000, lift: 'back_squat', loadKg: 60, source: 'plate', fps: 60, reps: 3, partials: 0, bestMcv: 1.0, meanMcv: 0.98, lastMcv: 0.96, bestPv: 1.6, lossPct: 4, stopPct: 20, repMcvs: [1.0, 0.98, 0.96], warmup: false, band: null, ...o })!;
const HISTORY: KeptSet[] = scene === 'profile' ? [set({ loadKg: 60, bestMcv: 1.02, repMcvs: [1.02, 1.0, 0.98] }), set({ loadKg: 80, bestMcv: 0.92, repMcvs: [0.92, 0.9, 0.88], day: dayAgo(2), at: Date.now() - 2 * 86_400_000 })]
  : scene === 'warmup' ? [1, 2, 3, 4, 5].map((k) => set({ day: dayAgo(k), at: Date.now() - k * 86_400_000, loadKg: 100, bestMcv: 0.62 + (k % 2) * 0.01, meanMcv: 0.6, repMcvs: [0.62 + (k % 2) * 0.01, 0.6, 0.59], warmup: true, band: 'normal' }))
  : [];
if (HISTORY.length) { try { localStorage.setItem(DEVICE_SETS_KEY, JSON.stringify(HISTORY)); } catch { /* none */ } }

const tier = scene === 'teen' ? 'teen' : 'adult';
const CTX = {
  ok: true, tier, features: featuresFor(tier), canSave: scene === 'barbell', ready: true, kept: tier === 'teen' ? 'none' : scene === 'barbell' ? 'server' : 'device',
  history: scene === 'barbell' ? [] : null,
  coaches: scene === 'warmup' ? [{ coachId: 'c1', coachName: 'Coach Dee', rule: { kind: 'drop_pct', dropPct: 5, action: 'ease', source: 'default' }, shared: true }] : [],
  targets: scene === 'profile' || scene === 'barbell' ? [{ sessionExerciseId: 'se1', name: 'Back Squat', lift: 'back_squat', zone: 'accelerative_strength', lossStopPct: 20 }] : [],
};
const sets = (name: string, mcvs: number[], o: Record<string, unknown> = {}) => ({ day: TODAY, lift: 'back_squat', liftName: 'Back squat', loadKg: 100, reps: mcvs.length, partials: 0, bestMcv: Math.max(...mcvs), lastMcv: mcvs[mcvs.length - 1], bestPv: 1.2, lossPct: Math.round((1 - mcvs[mcvs.length - 1] / Math.max(...mcvs)) * 1000) / 10, stopPct: 20, repMcvs: mcvs, source: 'plate', fps: 60, warmup: false, band: null, name, ...o });
const BOARD = {
  available: true,
  athletes: [
    { id: 'a1', name: 'Maya Okafor', adult: true, shares: true, sets: [sets('', [0.81, 0.79, 0.75, 0.71, 0.66, 0.62]), sets('', [0.62, 0.61, 0.6], { warmup: true, band: 'normal', day: dayAgo(1) })] },
    { id: 'a2', name: 'Jordan Reyes', adult: true, shares: false, sets: [] },
    { id: 'a3', name: 'Riley Chen', adult: false, shares: false, sets: [] },
  ],
  teams: [{ id: 't1', name: 'Varsity' }],
  slots: [
    { sessionExerciseId: 'se1', client: 'Maya Okafor', session: 'Lower A', name: 'Back Squat', dose: '4 × 3 @ 80%', target: { zone: 'accelerative_strength', lossStopPct: 20 } },
    { sessionExerciseId: 'se2', client: 'Maya Okafor', session: 'Upper A', name: 'Bench Press', dose: '5 × 3 @ 75%', target: null },
  ],
};
const TEAM = { team: { id: 't1', name: 'Varsity' }, hidden: 3, members: [{ id: 'a1', name: 'Maya', latest: [sets('', [0.81, 0.79, 0.75, 0.71, 0.66, 0.62])], lowDays: 0 }, { id: 'a5', name: 'Sam', latest: [sets('', [0.58, 0.55, 0.53], { warmup: true, band: 'low' })], lowDays: 1 }] };

async function answer(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET') w.__SENT__.push({ method, url: path, body: typeof init?.body === 'string' ? init.body : '' });
  if (path === '/api/vbt/sets' && method === 'GET') return Response.json(CTX);
  if (path === '/api/vbt/sets' && method === 'POST') { const ok = !!cleanSet(JSON.parse(String(init?.body ?? '{}'))); return Response.json(ok ? { saved: true, id: 's1' } : { error: 'bad_set' }, { status: ok ? 200 : 400 }); }
  if (path === '/api/coach/vbt') return method === 'GET' ? Response.json(url.includes('team=') ? TEAM : BOARD) : Response.json({ ok: true });
  return Response.json({ error: 'not_found' }, { status: 404 });
}
window.fetch = answer as typeof fetch;

// the slow-mo seam: a 240 fps take, exported at 30 fps (each real frame shown for 1/30 s: 8× slower on the file's clock)
const decoder = async () => {
  const reps = [0.95, 0.9, 0.84].map((v) => ({ romM: 0.5, concMs: (0.5 / v) * 1000 }));
  const f = filmSet(LIFTS.back_squat, { reps, leadMs: 600 }, { fps: 240, seed: 3 });
  w.__truth = f.truth.map((t) => Math.round(t.mcv * 1000) / 1000);
  return { frames: f.frames.map((fr) => ({ t: fr.t * 8, present: true, image: fr.image as PoseFrame['image'] })), aspect: f.aspect, fileFps: 30 };
};

const shell = (child: unknown) => h('main', { className: 'mx-auto min-h-screen max-w-md bg-[#050505] px-4 py-6 pb-20' }, child as never);
const root = createRoot(document.getElementById('root')!);
if (scene === 'coach') root.render(shell(h(CoachVelocity)));
else if (scene === 'refused') root.render(shell(h('div', { className: 'fel-card rounded-xl p-5 text-sm text-white/75', 'data-vbt-refused': 'under_13' }, UNDER_13_LINE)));
else root.render(shell(h(VelocitySession, { grab, decoder: decoder as never })));
