// lane/online-play: the host's "Start together" card against a party1 netd (the first party build) and a party2 one.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StartSection } from '@/components/party/social/party-start';
import { EMPTY_PARTY, type PartyState } from '@/lib/party/social/state';

const member = (peer: string, name: string, host = false) => ({ peer, name, pub: `p-${peer}`, host, connected: true, voice: false, muted: false, deafened: false, activity: null });
const state = (features: string[]): PartyState => ({
  ...EMPTY_PARTY, status: 'live', code: 'ABC234', you: 'm1', host: 'm1', rights: { text: true, voice: true }, features,
  members: [member('m1', 'ANA', true), member('m2', 'BO'), member('m3', 'CY')],
});

describe('Start together, by party server', () => {
  it('party1: 3v3 offers 2 players and says six need an update; winners stay on needs an update; no Karate', () => {
    const html = renderToStaticMarkup(<StartSection s={state([])} />);
    expect(html).toContain('3v3 · 2 players');
    expect(html).toContain('1v1 Streetball · 2 players');
    expect(html).not.toContain('Karate');
    expect(html).toContain('data-testid="party-run-off"');
  });
  it('party2: 3v3 offers 6, the winners-stay-on switch is on, and the first game is named', () => {
    const html = renderToStaticMarkup(<StartSection s={state(['party1', 'party2'])} />);
    expect(html).toContain('3v3 · 6 players');
    expect(html).toContain('data-testid="party-run-on"');
    expect(html).toContain('data-testid="party-next-up"');
    expect(html).toContain('<b>ANA</b> vs <b>BO</b>');
  });
});
