// UX advice §3: the reading-quality badge. Two states from the visibility the runner already sees; never a percentage.
import { describe, expect, it } from 'vitest';
import { AssessRunner, QUICK_PARTS, type RunnerView } from './runner';
import { standFront } from './replay';
import { READ_CLEAR, READ_PARTIAL } from '@/lib/screen/copy';

const STAND = standFront(0.5);
const dim = (f: (typeof STAND.frames)[number]) => ({ ...f, image: f.image.map((l) => ({ ...l, v: 0.2 })) });

function run(map: (f: (typeof STAND.frames)[number]) => (typeof STAND.frames)[number]) {
  const r = new AssessRunner({ aspect: 4 / 3, painAsked: true, handsFree: true, takeoffLeg: null, cameraFps: () => 30, parts: QUICK_PARTS.filter((p) => p.view === 'front').slice(0, 1) });
  let t = 0;
  let v: RunnerView = r.tick({ t, present: false, image: [] }, t);
  const seen: RunnerView[] = [];
  for (let i = 0; i < 1500 && v.step !== 'done'; i++) {
    t += 33;
    const f = STAND.frames[i % STAND.frames.length];
    v = r.tick({ ...(['position', 'countdown', 'active'].includes(v.step) ? map(f) : f), t }, t);
    seen.push(v);
    if (v.step === 'painCheck') r.answerPain(false, t);
  }
  return seen;
}

describe('reading-quality badge (UX §3)', () => {
  it('pins the two words; no digits or percent', () => {
    expect(READ_CLEAR).toBe('Clear read');
    expect(READ_PARTIAL).toBe('Partial read');
    expect(`${READ_CLEAR}${READ_PARTIAL}`).not.toMatch(/[\d%]/);
  });

  it('is null off the test steps, and "clear" on a well-lit stand', () => {
    const seen = run((f) => f);
    expect(seen.filter((v) => !['position', 'countdown', 'active'].includes(v.step)).every((v) => !v.readQuality)).toBe(true);
    expect(seen.some((v) => v.step === 'active' && v.readQuality === 'clear')).toBe(true);
  });

  it('turns "partial" when the landmarks are barely visible', () => {
    const seen = run(dim);
    expect(seen.some((v) => ['position', 'countdown', 'active'].includes(v.step) && v.readQuality === 'partial')).toBe(true);
  });
});
