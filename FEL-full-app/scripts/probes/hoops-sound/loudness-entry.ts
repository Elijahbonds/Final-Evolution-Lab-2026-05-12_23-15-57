// hoops-sound (phase 11a): the page side of ./loudness.mts. Renders SoundKit cues through SoundKit's OWN graph (buses, glue, limiter)
// into an OfflineAudioContext, once as the synth and once per recorded variation, and measures each at the limiter's output.
import { SoundKit } from '@/lib/babylon/audio/SoundKit';

const RATE = 44100;
class Offline extends OfflineAudioContext { constructor() { super(2, RATE * 4, RATE); } }
(window as unknown as { AudioContext: unknown }).AudioContext = Offline;
type Kit = { ctx: unknown; play: (n: string, o?: { volume?: number }) => void; graph: () => unknown; useSampleBank: (n: 'hoops' | null) => Promise<void>; sampleState: () => unknown };
const K = SoundKit as unknown as Kit;

/** Short-term loudness: the loudest 50 ms RMS (dBFS), the peak (dBFS), and how long it sounds above -50 dBFS. */
function measure(buf: AudioBuffer): { st50: number; peak: number; sec: number } {
  const a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
  const w = Math.round(RATE * 0.05); let best = 0, peak = 0, last = 0;
  for (let i = 0; i < a.length; i++) { const m = Math.max(Math.abs(a[i]), Math.abs(b[i])); if (m > peak) peak = m; if (m > 0.00316) last = i; }
  for (let s = 0; s + w <= a.length; s += Math.floor(w / 2)) { let e = 0; for (let i = s; i < s + w; i++) e += (a[i] * a[i] + b[i] * b[i]) / 2; best = Math.max(best, Math.sqrt(e / w)); }
  const db = (x: number) => +(20 * Math.log10(Math.max(1e-9, x))).toFixed(1);
  return { st50: db(best), peak: db(peak), sec: +(last / RATE).toFixed(2) };
}
async function render(name: string, volume: number): Promise<{ st50: number; peak: number; sec: number }> {
  K.ctx = null;                       // a fresh offline graph for each render
  K.graph();
  const ctx = K.ctx as OfflineAudioContext;
  K.play(name, { volume });
  return measure(await ctx.startRendering());
}

(window as unknown as { __RUN: () => Promise<unknown> }).__RUN = async () => {
  const cues = ['swish', 'rattle', 'squeak', 'crowdCheer', 'bounce', 'catch', 'impact', 'thud'];
  const out: Record<string, unknown> = {};
  K.ctx = null; K.graph();
  await K.useSampleBank(null);
  for (const c of cues) out[`${c}:synth`] = await render(c, 1);
  K.graph();
  await K.useSampleBank('hoops');
  out.bank = K.sampleState();
  for (const c of cues) { const r = []; for (let i = 0; i < 6; i++) r.push(await render(c, 1)); out[`${c}:sample`] = r; }
  // the crowd bed: its mean level over 4 s, the noise bed against the recording (at the momentum swell's resting share, 1)
  const bedRms = async (sample: boolean): Promise<number> => {
    await K.useSampleBank(sample ? 'hoops' : null);
    K.ctx = null; K.graph();
    const ctx = K.ctx as OfflineAudioContext;
    (SoundKit as unknown as { startAmbient: (k: string) => void }).startAmbient('stadium');
    const buf = await ctx.startRendering(); const a = buf.getChannelData(0); let e = 0;
    for (let i = RATE; i < a.length; i++) e += a[i] * a[i];   // past the first second
    (SoundKit as unknown as { stopAmbient: () => void }).stopAmbient();
    return +(20 * Math.log10(Math.sqrt(e / (a.length - RATE)))).toFixed(1);
  };
  out['bed:synth'] = await bedRms(false);
  out['bed:sample'] = await bedRms(true);
  // the bed: how long Chromium decodes the 14 s loop (an exact 14.000 s means the encoder's delay and padding were honoured)
  const bytes = await (await fetch('/audio/hoops/crowd_bed.mp3')).arrayBuffer();
  const bed = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(bytes);
  out.bedDecodedSec = +bed.duration.toFixed(4);
  return out;
};
