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
