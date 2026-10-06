// ducking: the music, the effects and the crowd step down while a voice talks (VOICEOVER, 2026-10-06).
//
// Before: only the crowd ducked, only under the booth (VoiceKit.duck: 0.4, i.e. -8 dB), and the music and the effects never moved,
// so a rival's line, the Coach or Professor Okta sat under whatever else was playing. Now every foreground voice ducks three
// targets by its output preset's depths (outputPreset.ts), sidechain style: we know when the voice starts and stops (it is
// scheduled on the audio clock), so the duck starts a beat EARLY (LOOKAHEAD) instead of reacting to the first syllable.
//
// The maths is Web Audio's setTargetAtTime: from v0 toward a target T with time constant tau, v(t) = T + (v0 - T)·e^(-(t-t0)/tau).
// It reaches 95% of the way after 3·tau, so an attack of A seconds is tau = A/3. Pure: the events are numbers, SoundKit writes them.

export interface DuckSpec { depthDb: number; attack: number; release: number }
export interface DuckEvent { at: number; target: number; tau: number }

/** TUNED (VOICEOVER 2026-10-06): the duck is fully down as the first syllable lands, not 80 ms into it. */
export const LOOKAHEAD = 0.03;

export const tauFor = (sec: number): number => Math.max(1e-3, sec / 3);
export const duckFactor = (depthDb: number): number => Math.pow(10, -Math.abs(depthDb) / 20);

/** The two automation events for one voice span [t0, t1] on a target whose resting level is `level`. */
export function duckEvents(t0: number, t1: number, level: number, spec: DuckSpec): DuckEvent[] {
  if (!(t1 > t0) || spec.depthDb === 0) return [];
  return [
    { at: Math.max(0, t0 - LOOKAHEAD), target: level * duckFactor(spec.depthDb), tau: tauFor(spec.attack) },
    { at: t1, target: level, tau: tauFor(spec.release) },
  ];
}

/** The value a param following `events` (in time order, from `v0`) has at time `t`: the analytic setTargetAtTime chain. */
export function envelopeAt(t: number, v0: number, events: readonly DuckEvent[]): number {
  let v = v0, from = -Infinity, cur: DuckEvent | null = null;
  for (const e of events) {
    if (e.at > t) break;
    if (cur) v = cur.target + (v - cur.target) * Math.exp(-(e.at - from) / cur.tau);
    cur = e; from = e.at;
  }
  return cur ? cur.target + (v - cur.target) * Math.exp(-(t - from) / cur.tau) : v;
}

/**
 * What to write on a target RIGHT NOW (after cancelling its future events) so it follows the duck for `span` from `now` on,
 * resting at `level`: before the span, rest (and the attack waits for its time); inside it, head down (a setTargetAtTime from
 * wherever the value is now is seamless); in or after the release, head back up. `restTau` is the glide used when nothing is
 * ducking (a volume slider's own ramp). A new span, a volume change mid-duck and a span extended by the next line all come
 * through here, so the last event on a target is always the right resting level.
 */
export function duckPlan(now: number, span: readonly [number, number] | null, level: number, spec: DuckSpec, restTau: number): DuckEvent[] {
  if (!span || spec.depthDb === 0 || now >= span[1]) {
    const out: DuckEvent[] = [{ at: now, target: level, tau: span && now < span[1] + spec.release ? tauFor(spec.release) : restTau }];
    return out;
  }
  const [t0, t1] = span;
  return [
    { at: Math.max(now, t0 - LOOKAHEAD), target: level * duckFactor(spec.depthDb), tau: tauFor(spec.attack) },
    { at: t1, target: level, tau: tauFor(spec.release) },
  ];
}

/**
 * Overlapping voices hold one duck: merge spans that touch (or come back within the release) so the music does not bob up
 * between the MC and the sidekick. `spans` in any order; returns them merged and sorted.
 */
export function mergeSpans(spans: readonly [number, number][], bridge: number): [number, number][] {
  const s = [...spans].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const [a, b] of s) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + bridge) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}
