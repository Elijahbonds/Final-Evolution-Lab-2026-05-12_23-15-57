// THE RUNNER'S COLOUR LANGUAGE (vis-board, visual wave 2, 2026-10-13) — Part B freerun: "A Mirror's Edge colour language:
// interactables in a runner red with emissive edges, everything else desaturated."
//
// The course read as one coloured mass: seven authored hues of equal weight, so the eye could not tell the box to vault from
// the floor it stands on. Mirror's Edge's answer is a rule the player learns in a second: the world is quiet, and what you can
// USE is red. Here: the pieces the verbs act on (the vault box, the slide bar, the spring, the rail, the grapple anchor, the
// ledge) take the runner's red and an emissive floor; the pieces you stand on and run along (the slab, the walls, the roofs)
// are pulled toward grey — not to grey, so each track keeps its own cast (the rooftop stays cool, the temple warm). The wall-run
// faces and the roofs are verbs' surfaces too, but they are the biggest things on screen: they get the red EDGES (the outline
// lines the mode draws on desktop), not the fill. Gates (start / checkpoint / finish) are markers with their own colours and are
// left alone. Pure colour maths, tested: no scene, no state, and nothing here changes what a piece IS.

export const RUNNER_RED = '#ff3b2f';
/** Kinds painted runner red (the verbs' own pieces). */
export const RED_KINDS: ReadonlySet<string> = new Set(['vault', 'bar', 'spring', 'rail', 'anchor', 'ledge']);
/** Kinds that keep the quiet fill but take red outline edges (desktop / high). */
export const EDGE_KINDS: ReadonlySet<string> = new Set(['vault', 'bar', 'spring', 'rail', 'anchor', 'ledge', 'wall', 'roof']);
/** Kinds the language leaves alone: the markers. */
export const MARKER_KINDS: ReadonlySet<string> = new Set(['start', 'finish', 'checkpoint', 'gate', 'hazard']);
/** How much of its colour the quiet world keeps (1 = unchanged, 0 = grey). */
export const KEEP_SATURATION = 0.42;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  return [parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Pure: a colour with its saturation scaled toward its own luma (Rec.709), keeping `keep` of it. */
export function desaturate(hex: string, keep: number): string {
  const [r, g, b] = hexToRgb(hex);
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const k = Math.max(0, Math.min(1, keep));
  return rgbToHex(l + (r - l) * k, l + (g - l) * k, l + (b - l) * k);
}

export interface RunnerLook { hex: string; /** the emissive floor a marker keeps (the verbs' red pieces read at night) */ emissive: number | null; red: boolean; edges: boolean }

/** Pure: the look of a course piece of `kind` whose authored colour is `hex`. */
export function runnerLook(kind: string, hex: string): RunnerLook {
  if (MARKER_KINDS.has(kind)) return { hex, emissive: null, red: false, edges: false };
  if (RED_KINDS.has(kind)) return { hex: RUNNER_RED, emissive: 0.2, red: true, edges: true };
  return { hex: desaturate(hex, KEEP_SATURATION), emissive: null, red: false, edges: EDGE_KINDS.has(kind) };
}

/** Pure: how colourful a hex is (max channel − min channel), 0..1 — the test's measure of "quiet". */
export function chroma(hex: string): number { const [r, g, b] = hexToRgb(hex); return Math.max(r, g, b) - Math.min(r, g, b); }
