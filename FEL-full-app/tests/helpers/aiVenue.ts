// Stubbed CELL answers for the Nexus Studio AI builder (lib/nexus-studio/aiEdits.ts, app/api/cell/venue). Nothing here
// talks to a model: these are the texts a model might send back, a good one and hostile ones, as the route receives them.

export const NIGHT_BEACH_PROMPT = 'a night beach court with floodlights and a packed far stand';

/** What a well-behaved model answers for NIGHT_BEACH_PROMPT (as text, fenced, the way models often answer). */
export const GOOD_ANSWER = '```json\n' + JSON.stringify({
  edits: [
    { op: 'venue', set: {
      name: 'Night Beach Court', mood: 'nightGame', backdrop: 'beach', paintedSky: true,
      sky: { top: '#060b1c', bottom: '#1a1440', fog: '#0f0c26', sun: '#9ad7ff', ambient: 0.4 },
      ground: { color: '#d9c49a', line: '#ffffff', kind: 'sand' },
    } },
    { op: 'row', item: 'fixture:flood', from: [-9, -14], to: [-9, 14], count: 3, yaw: 90, set: { height: 16 } },
    { op: 'row', item: 'fixture:flood', from: [9, -14], to: [9, 14], count: 3, yaw: -90, set: { height: 16 } },
    { op: 'place', item: 'crowd:bleacher', at: [0, -20], yaw: 0, set: { width: 30, rows: 8, gaps: 0 } },
    { op: 'place', item: 'kit:nature/tree_palmTall', at: [-16, -24], yaw: 20, scale: 1.4 },
  ],
}) + '\n```';

/** A hostile / broken answer: every field a model could abuse, beside one valid edit that must survive. */
export const HOSTILE_ANSWER = JSON.stringify({
  edits: [
    { op: 'replaceProject', project: { kind: 'nexus-studio-project', venues: [] } },          // an op the vocabulary does not have
    { op: 'eval', code: 'fetch("/api/v1/wallet",{method:"POST"})' },                           // code: never run
    { op: 'place', item: 'spec:hoop', at: [0, 0] },                                            // a gameplay prop: not in the catalog
    { op: 'place', item: '../../etc/passwd', at: [0, 0] },
    { op: 'place', item: 'fixture:flood', at: [1e9, -1e9], yaw: 'NaN', scale: 1e6, name: '<img src=x onerror=alert(1)>\u0000\u0007', set: { height: 9999, color: 'javascript:alert(1)', onload: 'x' } },
    { op: 'place', item: 'crowd:bleacher', at: [0, -20], id: 'venue_0', set: { width: -5, rows: 500, gaps: 7, posture: 'flying', __proto__: { polluted: true } } },
    { op: 'row', item: 'decal:scuff', from: [0, 0], to: [10, 10], count: 1e9 },
    { op: 'venue', set: { base: { spec: 'hoops', target: 'dunk' }, mood: 'apocalypse', weather: 'hail', sky: { top: 'red' }, glossyFloor: 'yes', objects: [{ type: 'fixture' }] } },
    { op: 'venue', set: { id: 'stolen', objects: [] } },
    'not an object', null, 42,
    { op: 'clear', type: 'everything' },
  ],
  __proto__: { edits: [] },
});

/** Not JSON at all (a model that chatted instead). */
export const PROSE_ANSWER = 'Sure! I would add some floodlights and a big stand. Let me know if you want more.';

/** An answer far past every cap. */
export function floodAnswer(n = 500): string {
  return JSON.stringify({ edits: Array.from({ length: n }, (_, i) => ({ op: 'place', item: 'decal:foot', at: [i % 20, -i % 20] })) });
}

/** The completions endpoint's response body carrying `content` (what lib/cell-engine completeText reads). */
export function completionBody(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
}

// ── studio-4b: scripts, casts and the explain pass ───────────────────────────────────────────────────────────────────

export const RALLY_PROMPT = 'when a rally reaches 5 the crowd cheers and a banner says WHAT A RALLY; cast Nova as the player and put Ace in the crowd';

/** A model that proposes a script and casts by the names the creator typed (it is never told which characters exist). */
export const SCRIPT_CAST_ANSWER = JSON.stringify({
  edits: [
    { op: 'script', name: 'Rally cheer', nodes: [
      { id: 'e', kind: 'onRally', params: { length: 5 }, x: 9999, y: -9999 },
      { id: 'c', kind: 'cooldown', params: { seconds: 2 } },
      { id: 'a1', kind: 'crowd', params: { reaction: 'cheer', strength: 1 } },
      { id: 'a2', kind: 'banner', params: { text: 'WHAT A RALLY', tone: 'heat', seconds: 2 } },
    ], edges: [{ from: 'e', to: 'c' }, { from: 'c', to: 'a1' }, { from: 'c', to: 'a2' }] },
    { op: 'cast', slot: 'player', character: 'Nova' },
    { op: 'cast', slot: 'crowd', character: 'ace' },
    { op: 'cast', slot: 'crowd', character: 'Zed' },
  ],
});

/** Scripts and casts a model could abuse: code, loops, unknown kinds, a graph with no action, a rival slot, an injected look. */
export const HOSTILE_SCRIPT_ANSWER = JSON.stringify({
  edits: [
    { op: 'script', name: '<script>alert(1)</script>', nodes: [
      { id: 'e', kind: 'onScore', params: { side: 'me', code: 'fetch("/api/v1/wallet")' } },
      { id: 'x', kind: 'exec', params: { code: 'process.exit()' } },
      { id: 'a', kind: 'banner', params: { text: 'x'.repeat(500), tone: 'javascript:' } },
      { id: 's', kind: 'setScore', params: { me: 99 } },
    ], edges: [{ from: 'e', to: 'a' }, { from: 'a', to: 'e' }, { from: 'e', to: 'x' }, { from: 'e', to: 's' }] },
    { op: 'script', name: 'no action', nodes: [{ id: 'e', kind: 'onTimer' }], edges: [] },
    { op: 'script', name: 'loop', nodes: [{ id: 'a', kind: 'cooldown' }, { id: 'b', kind: 'chance' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] },
    { op: 'cast', slot: 'rival', character: 'Nova' },
    { op: 'cast', slot: 'player', character: { lookCode: 'FEL2.injected.0000000' } },
    { op: 'cast', slot: 'crowd' },
  ],
});

/** A model's summary for the explain pass, with the things a summary must not carry through. */
export const EXPLAIN_ANSWER = '## Night Court\n\nA **night** court under four floods.\u0007 The far stand is packed.<img src=x onerror=alert(1)>\n```json\n{"edits":[]}\n```\nAdd palms on the left.';

// studio-5 (§13.2): CELL proposes STAMPS — two built-ins (by id and by name), one of the project's own named as the creator typed
// it, a name nobody has, and the hostile shapes (no spot, a stamp that is not text, past the per-answer cap).
export const STAMP_PROMPT = 'a lamp row down each side, a flood corner set, and my Bench Gang behind the far line';
export const STAMP_ANSWER = JSON.stringify({
  edits: [
    { op: 'stamp', stamp: 'stamp:lampRow', at: [-9, 0], yaw: 90 },
    { op: 'stamp', stamp: 'Lamp row', at: [9, 0], yaw: 90 },
    { op: 'stamp', stamp: 'stamp:floodCorners', at: [0, 0] },
    { op: 'stamp', stamp: 'Bench Gang', at: [0, -22], yaw: 0 },
    { op: 'stamp', stamp: 'Disco Ball Tower', at: [0, -30] },
  ],
});
export const HOSTILE_STAMP_ANSWER = JSON.stringify({
  edits: [
    { op: 'stamp', stamp: 'stamp:lampRow' },                                   // no spot
    { op: 'stamp', stamp: { id: 'stamp:lampRow', objects: [{ type: 'hoop' }] }, at: [0, 0] },   // a stamp that is not a name
    { op: 'stamp', stamp: '', at: [0, 0] },
    { op: 'stamp', stamp: 'stamp:lampRow', at: [500, -500], yaw: 'x', objects: [{ type: 'specProp', kind: 'hoop' }], id: 'evil' },   // clamped; the extras ignored
    ...Array.from({ length: 8 }, (_, i) => ({ op: 'stamp', stamp: 'stamp:lanternString', at: [i, 5] })),   // past the cap of 6
  ],
});
