// COMBINE-DAY: the screens, rendered (React's own markup, in node) — setup shows the gates, the run says hand-timed and
// takes the picture only through SelfView, the report ranks — plus what the phone sends (numbers only, never a typed
// name, a reach or a frame), the routes are signed-in only, and the source scans that hold the privacy lines.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CombineSetup, DEFAULT_STATIONS, type CombineCtx } from '@/components/combine/combine-setup';
import { CombineRun, drillScore } from '@/components/combine/combine-run';
import { CombineReport } from '@/components/combine/combine-report';
import { MyCombines, MINE_COMING_SOON } from '@/components/combine/my-combines';
import { syncBody, fromServer } from '@/components/combine/combine-app';
import { HandTimer } from '@/components/combine/hand-timer';
import { adhocAthlete, newEvent, recordAttempts, setReach } from '@/lib/combine/draft';
import { HELD_LINES, CAMERA_ADULTS_LINE } from '@/lib/combine/copy';
import { isSignedInOnly } from '@/lib/screen/config';
import { stripComments } from '@/lib/testing/sourceScan';
import type { CombineAthlete } from '@/lib/combine/types';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const adult = (id: string, name: string, saveCamera = true): CombineAthlete => ({ id, name, source: 'roster', access: { testable: true, camera: true, saveCamera, held: null } });
const teen: CombineAthlete = { id: 'teen', name: 'Riley', source: 'roster', access: { testable: false, camera: false, saveCamera: false, held: 'guardian_consent_required' } };
const handOnly: CombineAthlete = { id: 'h', name: 'Hana', source: 'roster', access: { testable: true, camera: false, saveCamera: false, held: null } };
const CTX: CombineCtx = { available: true, athletes: [adult('maya', 'Maya'), adult('jo', 'Jo', false), handOnly, teen], teams: [{ id: 't1', name: 'Varsity', athleteIds: ['maya', 'teen'] }], events: [] };
const noop = () => {};

function sample() {
  let ev = newEvent({ name: 'Fall tryout', athletes: [adult('maya', 'Maya'), adult('jo', 'Jo', false), handOnly, adhocAthlete('Walk On', [])], stations: [...DEFAULT_STATIONS], localId: 'L', now: Date.UTC(2026, 9, 25) });
  ev = recordAttempts(ev, 'maya', 'cmj:standing', [{ value: 52 }, { value: 50 }, { value: null }]);
  ev = recordAttempts(ev, 'jo', 'cmj:standing', [{ value: 47 }]);
  ev = recordAttempts(ev, 'maya', 'sprint:40yd', [{ value: 5.02 }]);
  ev = recordAttempts(ev, 'jo', 'sprint:40yd', [{ value: 4.88 }, { value: 4.91 }]);
  ev = recordAttempts(ev, 'h', 'sprint:40yd', [{ value: 5.3 }]);
  return setReach(ev, 'maya', { reachOverLeg: 2.4, reachOverLegSd: 0.02 });
}

describe('setup', () => {
  it('lists the roster with its gates: a held athlete cannot be picked and says so (placeholder until the owner approves)', () => {
    const html = renderToStaticMarkup(h(CombineSetup, { ctx: CTX, onStart: noop, onCancel: noop }));
    expect(html).toContain('data-combine-athlete="teen" data-held="guardian_consent_required"');
    expect(html).toMatch(/<input type="checkbox"[^>]*disabled=""[^>]*aria-label="Riley"/);
    expect(html).toContain(HELD_LINES.guardian_consent_required.placeholder);
    expect(html).toContain(CAMERA_ADULTS_LINE.placeholder);
    expect(html).not.toContain(HELD_LINES.guardian_consent_required.draft);
    // the testable athletes start picked; the default stations are jump, agility (hand-timed) and sprint (hand-timed)
    expect(html).toContain('data-combine-picked="3"');
    expect(html).toContain('Agility · 5-10-5 (pro agility) (hand-timed)');
    expect(html).toContain('Sprint · 40 yd (hand-timed)');
    expect(html).toContain('Varsity');
  });
});

describe('the run', () => {
  it('the sprint station: the line, the athlete and attempt in big type, the stopwatch, hand-timed said', () => {
    const ev = sample();
    const html = renderToStaticMarkup(h(CombineRun, { ev, onChange: noop, onReport: noop, onHome: noop, roster: CTX.athletes, saving: true, status: null }));
    // the first tab is the jump station: the next athlete with an attempt left, the camera start, no picture until Start
    expect(html).toContain('data-combine-run="cmj:standing"');
    expect(html).toContain('data-combine-current="jo"');
    expect(html).toContain('Attempt 2 of 3');
    expect(html).toContain('data-combine-start-camera');
    expect(html).toContain('data-fel-selfview');          // the picture's one place: SelfView (collapsed until Start)
    expect(html).not.toMatch(/<video|<canvas/);
    // jo has not opted in: on this phone only (the placeholder)
    expect(html).toContain('data-combine-device-only');
    // the hand-only athlete and the typed name are not in the jump line
    expect(html).not.toMatch(/data-combine-line[^]*Hana[^]*data-combine-current/);
    expect(html).not.toContain('Walk On');
  });

  it('the stopwatch says hand-timed; a drill\'s score is its own timing share', () => {
    const html = renderToStaticMarkup(h(HandTimer, { kind: 'sprint', onTime: noop }));
    expect(html).toContain('Tap to start');
    expect(html).toContain('Hand-timed by the coach.');
    expect(drillScore({ accuracy: 0.8333 })).toBe(83.3);
    expect(drillScore({ accuracy: null })).toBeNull();
  });
});

describe('the report', () => {
  it('ranks the composite, a table per station, a card per athlete; no ± anywhere', () => {
    const html = renderToStaticMarkup(h(CombineReport, { ev: sample(), onChange: noop, onBack: noop }));
    expect(html).toContain('data-combine-composite');
    for (const s of DEFAULT_STATIONS) expect(html).toContain(`data-combine-table="${s.id}"`);
    expect(html).toContain('data-combine-card="maya"');
    expect(html).toContain('incomplete');
    expect(html).toContain('20.5 in');                     // maya's best jump, 52 cm
    expect(html).not.toMatch(/±|lab-grade|accurate to/i);
    expect(html).not.toContain('Walk On');                 // a typed (held) name takes no station
  });
});

describe('what the phone sends', () => {
  it('numbers for roster athletes only: never a typed name, a standing reach, or anything but the slots', () => {
    const { create, save } = syncBody(sample());
    expect(create.athleteIds).toEqual(['maya', 'jo', 'h']);
    expect(Object.keys(save.results).sort()).toEqual(['h', 'jo', 'maya']);
    const text = JSON.stringify({ create, save });
    expect(text).not.toMatch(/Walk On|adhoc|reach|frames|image|video/);
    expect(Object.keys(create)).toEqual(['name', 'teamId', 'stations', 'weights', 'athleteIds']);
  });

  it('a saved combine read back becomes a draft on this phone', () => {
    const ev = fromServer({ id: 'e1', name: 'X', createdAt: 5, updatedAt: 6, teamId: null, stations: [{ kind: 'sprint', variant: '40yd', attempts: 2 }], weights: {}, athletes: [{ id: 'jo', name: 'Jo', access: CTX.athletes[1].access }], results: { jo: { 'sprint:40yd': [{ value: 4.9, at: 1 }, null] } } }, 'srv-e1')!;
    expect(ev).toMatchObject({ localId: 'srv-e1', serverId: 'e1', name: 'X' });
    expect(ev.results.jo['sprint:40yd'][0]?.value).toBe(4.9);
  });
});

describe('the athlete\'s page', () => {
  it('coming soon before the SQL; their own stations with their place after', () => {
    expect(renderToStaticMarkup(h(MyCombines, { available: false, events: [] }))).toContain(MINE_COMING_SOON);
    const html = renderToStaticMarkup(h(MyCombines, { available: true, events: [{ id: 'e', name: 'Tryout', createdAt: 0, stations: [{ id: 'sprint:40yd', kind: 'sprint', variant: '40yd', best: 4.9, touchCm: null, attempts: [4.9, null], rank: 2, of: 9 }] }] }));
    expect(html).toContain('2nd of 9');
    expect(html).toContain('4.90 s · X');
    expect(html).toContain('(hand-timed)');
  });
});

describe('guards', () => {
  it('the combine routes are signed-in only', () => {
    for (const r of ['/coach/combine', '/train/combine', '/api/coach/combine', '/api/coach/combine/x', '/api/combine/mine']) expect(isSignedInOnly(r), r).toBe(true);
  });

  it('the combine screens send nothing but the combine\'s numbers: one fetch site, and no picture is ever read', () => {
    const dir = path.join(ROOT, 'components/combine');
    const files = fs.readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'));
    const PIXEL = /\.toDataURL\s*\(|\.toBlob\s*\(|captureStream\s*\(|getImageData\s*\(|sendBeacon\s*\(|\bWebSocket\b|\.showIn\(/;
    for (const f of files) {
      const src = read(`components/combine/${f}`);
      expect(src, f).not.toMatch(PIXEL);
      if (f !== 'combine-app.tsx') expect(src, f).not.toMatch(/\bfetch\s*\(/);
    }
    // combine-app's every send is a body built by syncBody
    const app = read('components/combine/combine-app.tsx');
    expect([...app.matchAll(/body: JSON\.stringify\(([^)]*)\)/g)].map((m) => m[1])).toEqual(['create', 'body.save']);
  });

  it('no jump accuracy claim in any combine file', () => {
    const files = [
      ...fs.readdirSync(path.join(ROOT, 'components/combine')).map((f) => `components/combine/${f}`),
      ...fs.readdirSync(path.join(ROOT, 'lib/combine')).filter((f) => !f.includes('.test.')).map((f) => `lib/combine/${f}`),
      'app/coach/combine/page.tsx', 'app/train/combine/page.tsx',
    ].filter((f) => !f.includes('.test.'));
    for (const f of files) expect(read(f), f).not.toMatch(/lab[- ]grade|±|plusMinus|accurate to/i);
  });
});
