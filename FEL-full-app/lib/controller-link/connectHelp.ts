// CONNECT HELP — the words that teach a first-time player to plug in a pad or join by phone (CONTROLLER-USB-QR-HELP,
// 2026-09-14).
//
// One copy for every host screen (HostLobby on /try and 3PT, HostStage on the TV) so the steps can't drift apart. The
// feel bar is a player on /try who has never seen FEL: they get from "I have a controller" to "it moves the dunker"
// without asking anyone. The one step people miss is the second USB one: Chrome hides a pad from the page until a
// button is pressed on it, so a plugged-in pad looks dead until you press something.

import type { PadInfo } from '@/lib/babylon/core/InputBus';

export const USB_TITLE = 'USB / Bluetooth controller';

export const USB_STEPS = [
  'Plug the controller into this computer with a USB cable (or pair it over Bluetooth first).',
  'Press any button on it. Your browser keeps a controller hidden until you do.',
  'A P1 chip appears when it is in, and the controller plays straight away.',
] as const;

export const PHONE_TITLE = 'Phone as a controller: scan the QR';

export const PHONE_STEPS = [
  "Open your phone's camera.",
  'Point it at the QR code.',
  'Tap the link. Your phone becomes the controller.',
] as const;

/** The always-on line beside the lobby badge: what to do before a pad is in, who is in after. */
export function usbStatusLine(pads: readonly PadInfo[]): string {
  if (pads.length === 0) return 'USB controller? Plug it in, then press any button';
  return pads.map((p) => `P${p.slot + 1} ${p.name} connected`).join(' · ');
}

/** A phone can only type what a phone can reach — shown under the QR for anyone whose camera won't scan. */
export function typeInstead(url: string): string {
  return url ? `No camera? Open ${url} on your phone.` : '';
}
