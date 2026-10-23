// FN-0 COUCH-HOST-SEATS (2026-10-19): in a couch room no seat has a body. def.onBody is never called and no camera
// permission is asked for — the host seat included, whatever its age (an adult, a teen, a seat whose age is unknown).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { InputBus, type BodyPacket } from './InputBus';
import { NO_BODY_LISTENER, seatCountOf, type ModeDefinition } from './ModeHarness';
import { HostStage, CouchSplash } from '@/components/controller-link/host-stage';
import { BootSplash } from '@/components/games/boot-splash';
import { drive, findAll, textOf } from '@/tests/helpers/driveRender';

const packet = (): BodyPacket => ({
  read: { t: 0, present: true } as unknown as BodyPacket['read'],
  events: [{ kind: 'jump', t: 0, seen: 0 } as unknown as BodyPacket['events'][number]],
  channels: {} as BodyPacket['channels'],
  arrivedAt: 1,
});

/** The seats a family night puts on the couch: the age the host's account says is not an input to the couch at all. */
const SEATS = [
  { who: 'host, adult', age: 'adult' }, { who: 'host, teen', age: 'teen' },
  { who: 'phone seat, teen', age: 'teen' }, { who: 'pad seat, age unknown', age: null },
] as const;

afterEach(() => { vi.unstubAllGlobals(); });

describe('couch: no body for any seat', () => {
  const harness = readFileSync(path.resolve(__dirname, 'ModeHarness.ts'), 'utf8');

  it('runMode never subscribes to the body in a couch: def.onBody is reached only from inside that one subscription', () => {
    expect(harness).toMatch(/const unBody = couch \? NO_BODY_LISTENER : input\.onBody\(\(p\) => \{/);
    expect(harness.match(/\.onBody\(\(/g) ?? []).toHaveLength(1);                     // the one subscription
    const sub = harness.indexOf('input.onBody((p) => {');
    const end = harness.indexOf('store.setBody(s.presence, s.handsUp01);', sub);
    const calls = [...harness.matchAll(/def\.onBody\(ctx/g)].map((m) => m.index ?? -1);
    expect(calls.length).toBeGreaterThan(0);
    for (const at of calls) { expect(at).toBeGreaterThan(sub); expect(at).toBeLessThan(end); }
    expect(harness).toMatch(/const couch = opts\.couch === true;/);
    expect(harness).toMatch(/if \(couch\) ctx\.body = \(\) => null;/);
    expect(NO_BODY_LISTENER()).toBeUndefined();
  });

  it.each(SEATS)('$who: camera frames on the couch bus reach no def.onBody (nothing is listening)', ({ age }) => {
    const onBody = vi.fn();
    const def = { modeId: 'threepoint', onBody } as unknown as ModeDefinition;
    const bus = new InputBus();
    // what runMode holds in a couch: NO_BODY_LISTENER, and no onBody listener on the bus
    const unBody: () => void = NO_BODY_LISTENER;
    bus.publishBody(packet());
    bus.publishBody(packet());
    unBody();
    expect(onBody).not.toHaveBeenCalled();
    expect(def.onBody).toBe(onBody);
    expect(age === null || typeof age === 'string').toBe(true);   // the host's age is not an input to the couch
  });

  it('control: a listener on the same bus does get those frames (the probe is live)', () => {
    const seen = vi.fn();
    const bus = new InputBus();
    const off = bus.onBody(seen);
    bus.publishBody(packet());
    off();
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('seatCount: live in a couch (1..4), 1 outside one', () => {
    let n = 3;
    expect(seatCountOf({ couch: true, seatCount: () => n })).toBe(3);
    n = 9; expect(seatCountOf({ couch: true, seatCount: () => n })).toBe(4);
    n = 0; expect(seatCountOf({ couch: true, seatCount: () => n })).toBe(1);
    expect(seatCountOf({ couch: false, seatCount: () => 4 })).toBe(1);
    expect(seatCountOf({})).toBe(1);
  });

  it('the couch stage never asks for the camera and shows no body or camera prompt', () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal('navigator', { userAgent: 'test', mediaDevices: { getUserMedia } });
    const start = (tree: ReturnType<typeof HostStage>) => {
      const b = findAll(tree, (el) => el.type === 'button' && /START THE SCREEN/.test(textOf(el.props.children)));
      b[0].props.onClick();
    };
    const couch = drive(() => HostStage({ modeId: 'threepoint', couch: true }), [start]);
    expect(findAll(couch.tree, (el) => el.type === BootSplash)).toHaveLength(0);   // the solo card carries body play
    expect(findAll(couch.tree, (el) => el.type === CouchSplash)).toHaveLength(1);
    expect(couch.html).not.toMatch(/data-fel-body-play|data-fel-selfview|Play with your body|camera/i);
    expect(getUserMedia).not.toHaveBeenCalled();
    // control: the solo stage does mount BootSplash, so the probe above can see it
    const solo = drive(() => HostStage({ modeId: 'threepoint' }), [start]);
    expect(findAll(solo.tree, (el) => el.type === BootSplash)).toHaveLength(1);
  });

  it('the couch start is a full page load (a solo camera does not carry over), and the room page mounts no body play', () => {
    const start = readFileSync(path.resolve(__dirname, '../../../components/controller-link/couch-start.tsx'), 'utf8');
    expect(start).not.toMatch(/from 'next\/link'/);
    expect(start).toMatch(/<a\s+href=\{couchHref\(m\)\}/);
    expect(start).not.toMatch(/body-play|body-control|poseSource|getUserMedia/);
  });

  it('the couch stage passes couch and a live seatCount to runMode', () => {
    const src = readFileSync(path.resolve(__dirname, '../../../components/controller-link/host-stage.tsx'), 'utf8');
    expect(src).toMatch(/runMode\(def, \{\s*canvas,\s*input,\s*couch,\s*seatCount: \(\) => couchRef\.current\.seatCount\(\),/);
  });
});
