// FN-0 COUCH-HOST-SEATS (2026-10-19): no party chat or voice is rendered in a couch room — on the TV (the stage and the
// root layout's party dock) or on a seated phone (its page enters the couch from the room's layout).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PartyState } from '@/lib/party/social/state';

const party = vi.hoisted(() => ({ state: null as PartyState | null }));
vi.mock('@/components/party/social/use-party', () => ({ useParty: () => party.state }));
vi.mock('next/navigation', () => ({ usePathname: () => '/play/threepoint' }));

import { EMPTY_PARTY } from '@/lib/party/social/state';
import { PartyDock } from '@/components/party/social/party-dock';
import { enterCouch } from '@/lib/party/seats';
import { HostStage, couchControllerConfig } from './host-stage';
import { controllerConfigFor } from '@/lib/controller-link/schemas/registry';
import { drive, findAll, textOf } from '@/tests/helpers/driveRender';

const IN_PARTY: PartyState = {
  ...EMPTY_PARTY, status: 'live', you: 'me', host: 'me', rights: { text: true, voice: true },
  members: [
    { peer: 'me', name: 'Host', pub: 'a', host: true, connected: true, voice: true, muted: false, deafened: false, activity: null },
    { peer: 'f', name: 'Friend', pub: 'b', host: false, connected: true, voice: true, muted: false, deafened: false, activity: null },
  ],
  caption: { id: 'c1', key: 'c1', from: 'f', name: 'Friend', text: 'gg', self: false, at: 1 } as unknown as PartyState['caption'],
};

const CHAT_OR_VOICE = /party-bar|party-panel|party-caption|party-voice|party-chat|Mute your microphone|Join voice/;

afterEach(() => { party.state = null; });

describe('couch: no party chat or voice', () => {
  it('control: in a party, outside a couch, the dock draws the party bar and its captions', () => {
    party.state = IN_PARTY;
    const html = renderToStaticMarkup(createElement(PartyDock));
    expect(html).toMatch(/data-testid="party-bar"/);
    expect(html).toMatch(/party-caption-sr/);
  });

  it('with a couch open, the dock draws nothing at all — bar, panel, captions, voice', () => {
    party.state = IN_PARTY;
    const leave = enterCouch();
    try {
      const html = renderToStaticMarkup(createElement(PartyDock));
      expect(html).toBe('');
    } finally { leave(); }
    expect(renderToStaticMarkup(createElement(PartyDock))).toMatch(/party-bar/);   // and back once the couch closes
  });

  it('a couch opening leaves voice (the dock calls the mesh\'s leave)', () => {
    const src = readFileSync(path.resolve(__dirname, '../party/social/party-dock.tsx'), 'utf8');
    expect(src).toMatch(/if \(!couch\) return;\s*setOpen\(false\);\s*voiceMesh\(partyClient\(\)\)\.leave\(\);/);
    expect(src).toMatch(/if \(couch\) return null;/);
  });

  it('the couch stage renders no party chat or voice, before or after START', () => {
    party.state = IN_PARTY;
    const before = renderToStaticMarkup(createElement(HostStage, { modeId: 'threepoint', couch: true }));
    expect(before).not.toMatch(CHAT_OR_VOICE);
    const start = (tree: ReturnType<typeof HostStage>) => {
      findAll(tree, (el) => el.type === 'button' && /START THE SCREEN/.test(textOf(el.props.children)))[0].props.onClick();
    };
    const after = drive(() => HostStage({ modeId: 'threepoint', couch: true }), [start]);
    expect(after.html).toContain('data-testid="host-stage-canvas"');
    expect(after.html).not.toMatch(CHAT_OR_VOICE);
  });

  it('a seated phone is told it is on a couch, and its page closes chat and voice for as long as it holds that layout', () => {
    const c = couchControllerConfig(controllerConfigFor('threepoint')!);
    expect(c.couch).toBe(true);
    expect(controllerConfigFor('threepoint')!.couch).toBeUndefined();
    const page = readFileSync(path.resolve(__dirname, 'controller-page.tsx'), 'utf8');
    expect(page).toMatch(/const couch = config\?\.couch === true;\s*useEffect\(\(\) => \(couch \? enterCouch\(\) : undefined\), \[couch\]\);/);
  });
});
