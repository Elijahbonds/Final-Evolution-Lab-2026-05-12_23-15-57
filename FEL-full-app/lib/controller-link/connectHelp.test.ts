// CONTROLLER-USB-QR-HELP: the teach copy, the retried room create, and the wiring that puts both on /try.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { USB_STEPS, PHONE_STEPS, usbStatusLine, typeInstead } from './connectHelp';
import { fetchWithRetry, linkErrorText, CREATE_RETRY_MS } from './transport/signaling';
import type { PadInfo } from '@/lib/babylon/core/InputBus';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const res = (status: number) => ({ status, ok: status >= 200 && status < 300 }) as Response;
const noWait = () => Promise.resolve();

describe('connect help copy', () => {
  it('USB teaches plug → press any button → chip', () => {
    expect(USB_STEPS).toHaveLength(3);
    expect(USB_STEPS[0]).toMatch(/USB cable/);
    expect(USB_STEPS[0]).toMatch(/Bluetooth/);
    expect(USB_STEPS[1]).toMatch(/Press any button/);
    expect(USB_STEPS[2]).toMatch(/P1/);
  });

  it('phone teaches camera → point at the QR → tap', () => {
    expect(PHONE_STEPS).toHaveLength(3);
    expect(PHONE_STEPS.join(' ')).toMatch(/camera.*QR code.*Tap the link/);
  });

  it('the status line asks for a press until a pad is in, then names it', () => {
    expect(usbStatusLine([])).toBe('USB controller? Plug it in, then press any button');
    const pad = { slot: 0, index: 0, id: 'x', profileId: 'xbox', name: 'Xbox Controller' } as PadInfo;
    expect(usbStatusLine([pad, { ...pad, slot: 1, index: 1, name: 'DualSense' }])).toBe('P1 Xbox Controller connected · P2 DualSense connected');
  });

  it('type-instead needs a url', () => {
    expect(typeInstead('')).toBe('');
    expect(typeInstead('http://h/controller/ABCDEF')).toBe('No camera? Open http://h/controller/ABCDEF on your phone.');
  });
});

describe('room create survives a blip (the eye\'s "Failed to fetch")', () => {
  it('retries a rejected fetch and returns the first good answer', async () => {
    let calls = 0;
    const waits: number[] = [];
    const r = await fetchWithRetry(async () => {
      calls++;
      if (calls < 3) throw new TypeError('Failed to fetch');
      return res(200);
    }, CREATE_RETRY_MS, async (ms) => { waits.push(ms); });
    expect(r.status).toBe(200);
    expect(calls).toBe(3);
    expect(waits).toEqual([500, 1000]);
  });

  it('retries a 5xx but hands a 4xx straight back', async () => {
    let calls = 0;
    expect((await fetchWithRetry(async () => (++calls < 2 ? res(503) : res(200)), [1, 1], noWait)).status).toBe(200);
    calls = 0;
    expect((await fetchWithRetry(async () => { calls++; return res(400); }, [1, 1], noWait)).status).toBe(400);
    expect(calls).toBe(1);
  });

  it('gives up after the last delay with the real error', async () => {
    let calls = 0;
    await expect(fetchWithRetry(async () => { calls++; throw new TypeError('Failed to fetch'); }, [1, 1, 1], noWait)).rejects.toThrow('Failed to fetch');
    expect(calls).toBe(4);
  });

  it('never shows a player the raw fetch error', () => {
    expect(linkErrorText(new TypeError('Failed to fetch'))).toBe("Can't reach the game server");
    expect(linkErrorText(new TypeError('Load failed'))).toBe("Can't reach the game server");
    expect(linkErrorText(new Error('createRoom failed: 503'))).toBe('The game server refused the room (503)');
  });
});

describe('wiring', () => {
  const lobby = read('components/controller-link/host-lobby.tsx');

  it('HostLobby teaches USB beside the badge and in the panel, with the QR and its steps', () => {
    expect(lobby).toMatch(/data-testid="usb-connect-hint"/);
    expect(lobby).toMatch(/data-testid="usb-connect-help"/);
    expect(lobby).toMatch(/<Steps steps=\{USB_STEPS\} \/>/);
    expect(lobby).toMatch(/data-testid="host-lobby-qr"/);
    expect(lobby).toMatch(/<Steps steps=\{PHONE_STEPS\} \/>/);
    expect(lobby).toMatch(/bus\.onPads\(\(next\) => \{\s*setPads\(next\)/);
    // the adopting press starts play and collapses the lobby — the join line must outlive that frame
    expect(lobby).toMatch(/!collapsed \|\| \(justJoined && pads\.length > 0\)/);
  });

  it('a failed room is retryable, never a dead red badge', () => {
    expect(lobby).not.toMatch(/Controller link unavailable/);
    expect(lobby).toMatch(/data-testid="host-lobby-retry"/);
    expect(lobby).toMatch(/\[config, armed, attempt\]/);
    expect(read('lib/controller-link/transport/signaling.ts')).toMatch(/fetchWithRetry\(\(\) => fetch\('\/api\/controller-link\/rooms'/);
  });

  it('/try (dunk) and 3PT hand the lobby their bus; HostStage shows the phone steps', () => {
    expect(read('components/games/dunk-babylon.tsx')).toMatch(/<HostLobby[^>]*bus=\{bus\}/);
    expect(read('components/games/three-point-babylon.tsx')).toMatch(/<HostLobby[\s\S]*?bus=\{busRef\.current\}[\s\S]*?\/>/);
    const stage = read('components/controller-link/host-stage.tsx');
    expect(stage).toMatch(/PHONE_STEPS\.map/);
    expect(stage).toMatch(/\[started, config, attempt\]/);
  });
});
