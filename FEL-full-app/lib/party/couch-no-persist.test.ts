// FN-0 COUCH-HOST-SEATS (2026-10-19): a couch session saves nothing per seat. Seat names live in memory only: a whole
// session — seats filling by pad and phone, a 5th waiting, presses routed, someone leaving, the room closing, and the TV
// stage rendered through START — makes no fetch, beacon, cookie or storage call carrying a seat name.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CouchSession, couchSeatTable, enterCouch } from './seats';
import { InputBus, type FelInput } from '@/lib/babylon/core/InputBus';
import { HostStage } from '@/components/controller-link/host-stage';
import { drive, findAll, textOf } from '@/tests/helpers/driveRender';

const NAMES = ['Grandma Jo', 'Leo', 'Mia', 'Uncle Ray'];

type Call = { what: string; args: unknown[] };
let calls: Call[] = [];
const spy = (what: string) => (...args: unknown[]) => { calls.push({ what, args }); return undefined; };
function storage(what: string): Storage {
  return {
    getItem: (...a: unknown[]) => { calls.push({ what: `${what}.getItem`, args: a }); return null; },
    setItem: spy(`${what}.setItem`), removeItem: spy(`${what}.removeItem`), clear: spy(`${what}.clear`),
    key: () => null, length: 0,
  } as unknown as Storage;
}

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn((...a: unknown[]) => { calls.push({ what: 'fetch', args: a }); return Promise.resolve(new Response('{}')); }));
  vi.stubGlobal('localStorage', storage('localStorage'));
  vi.stubGlobal('sessionStorage', storage('sessionStorage'));
  vi.stubGlobal('indexedDB', { open: spy('indexedDB.open') });
  vi.stubGlobal('navigator', { userAgent: 'test', sendBeacon: spy('navigator.sendBeacon') });
  vi.stubGlobal('XMLHttpRequest', class { open(...a: unknown[]) { calls.push({ what: 'xhr.open', args: a }); } send(...a: unknown[]) { calls.push({ what: 'xhr.send', args: a }); } });
});
afterEach(() => { vi.unstubAllGlobals(); });

/** Any call at all, and any call carrying a seat name, anywhere in its arguments. */
function withName(): Call[] {
  return calls.filter((c) => NAMES.some((n) => JSON.stringify(c.args, (_k, v) => (typeof v === 'function' ? String(v) : v))?.includes(n)));
}

describe('a couch session saves nothing per seat', () => {
  it('a full session: seat, route, leave, close — no network or storage call at all', () => {
    const leave = enterCouch();
    const s = new CouchSession();
    const bus = new InputBus();
    const slots: [number, FelInput][] = [];
    const merged: FelInput[] = [];
    bus.onSlot((e, slot) => slots.push([slot, e]));
    bus.on((e) => merged.push(e));
    const phones = NAMES.map((name, i) => ({ peerId: `peer-${i}`, name, slot: i, ready: true, connected: true }));
    const pads = [{ slot: 0, name: 'Xbox Wireless Controller' }];
    const t = s.seat(pads, phones);
    expect(t.seats.map((x) => x.name)).toEqual(['XBOX PAD', 'Grandma Jo', 'Leo', 'Mia']);
    expect(t.waiting.map((x) => x.name)).toEqual(['Uncle Ray']);
    const a: FelInput = { t: 'button', btn: 'A', pressed: true };
    expect(s.route('peer-0', a, bus)).toBe(1);
    expect(s.route('peer-2', a, bus)).toBe(3);
    expect(s.route('peer-3', a, bus)).toBeNull();          // waiting: reaches nobody
    s.seat(pads, phones.filter((p) => p.peerId !== 'peer-1'));   // Leo leaves; Uncle Ray sits down
    expect(s.route('peer-3', a, bus)).toBe(3);
    s.end();
    leave();
    expect(slots.map(([slot]) => slot)).toEqual([1, 3, 3]);
    expect(merged).toEqual([]);                             // a pad holds seat 1, so no phone drives the solo stream
    expect(calls).toEqual([]);
    expect(withName()).toEqual([]);
  });

  it('a phone on seat 1 drives the solo stream too (no pads on the couch)', () => {
    const s = new CouchSession();
    const bus = new InputBus();
    const merged: FelInput[] = [];
    bus.on((e) => merged.push(e));
    s.seat([], [{ peerId: 'x', name: 'Grandma Jo', slot: 0, ready: true, connected: true }]);
    expect(s.route('x', { t: 'button', btn: 'A', pressed: true }, bus)).toBe(0);
    expect(merged).toHaveLength(1);
    expect(calls).toEqual([]);
  });

  it('the TV stage in couch mode, through START, writes nothing with a seat name', () => {
    const start = (tree: ReturnType<typeof HostStage>) => {
      const b = findAll(tree, (el) => el.type === 'button' && /START THE SCREEN/.test(textOf(el.props.children)));
      expect(b).toHaveLength(1);
      b[0].props.onClick();
    };
    const { html } = drive(() => HostStage({ modeId: 'threepoint', couch: true, exitHref: '/play/threepoint' }), [start]);
    expect(html).toContain('data-testid="couch-seats"');
    expect(withName()).toEqual([]);
    expect(calls.filter((c) => c.what !== 'localStorage.getItem')).toEqual([]);   // reading the TV's display setting is not a seat
  });

  it('the couch code paths hold no storage or network call (a guard against one being added)', () => {
    const root = path.resolve(__dirname, '../..');
    // code only: the files' own comments say what they do NOT do
    const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s\/\/.*$/, '')).join('\n');
    const seatsSrc = code(readFileSync(path.join(root, 'lib/party/seats.ts'), 'utf8'));
    const startSrc = code(readFileSync(path.join(root, 'components/controller-link/couch-start.tsx'), 'utf8'));
    for (const src of [seatsSrc, startSrc]) expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|fetch\(|sendBeacon|document\.cookie/);
    const stage = code(readFileSync(path.join(root, 'components/controller-link/host-stage.tsx'), 'utf8'));
    expect(stage).not.toMatch(/localStorage|sessionStorage|indexedDB|fetch\(|sendBeacon|document\.cookie/);
    // the couch's seat table lives in a ref and dies with the stage
    expect(stage).toMatch(/useRef<CouchSession>\(new CouchSession\(\)\)/);
    expect(stage).toMatch(/seats\.end\(\)/);
    expect(couchSeatTable([], []).seats).toEqual([]);
  });
});
