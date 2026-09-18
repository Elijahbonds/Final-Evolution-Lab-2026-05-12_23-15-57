/**
 * lib/input-schemes.board.ts
 *
 * Board-lane entries for lib/input-schemes.ts (the app's single source of
 * truth for mode -> controls). MERGE, don't replace: spread
 * BOARD_INPUT_SCHEMES into the existing scheme map and re-export.
 *
 * ASSUMPTION (flagged in REFINEMENT.md): the live input-schemes.ts entry
 * shape is not visible from the reference docs. The structure below carries
 * everything any plausible shape needs (action id, label, key codes, gamepad
 * hint, touch-zone hint); adapt field names at merge time — the game code
 * only depends on lib/board/board-input.ts key codes, not on this file.
 */

export interface BoardControlDescriptor {
  action: string;
  label: string;
  keys: string[];
  gamepad: string;   // PS-layout hint for virtual-controller.tsx skinning
  hint: string;      // shown by GameShell's controls help
}

const SHARED_BOARD_CONTROLS: BoardControlDescriptor[] = [
  { action: 'steer_left',  label: 'Carve Left',  keys: ['ArrowLeft', 'KeyA'],  gamepad: 'dpad-left',  hint: 'Carve / balance / trick modifier' },
  { action: 'steer_right', label: 'Carve Right', keys: ['ArrowRight', 'KeyD'], gamepad: 'dpad-right', hint: 'Carve / balance / trick modifier' },
  { action: 'tuck',        label: 'Tuck / Push', keys: ['ArrowUp', 'KeyW'],    gamepad: 'dpad-up',    hint: 'Speed up / trick modifier' },
  { action: 'brake',       label: 'Brake',       keys: ['ArrowDown', 'KeyS'],  gamepad: 'dpad-down',  hint: 'Scrub speed / trick modifier' },
  { action: 'ollie',       label: 'Ollie',       keys: ['Space'],              gamepad: 'cross',      hint: 'Hold to load, release to pop' },
  { action: 'flip_trick',  label: 'Flip Trick',  keys: ['KeyJ'],               gamepad: 'square',     hint: 'In air + direction = flip trick' },
  { action: 'grab_trick',  label: 'Grab Trick',  keys: ['KeyK'],               gamepad: 'triangle',   hint: 'In air + direction = grab trick' },
  { action: 'grind',       label: 'Grind',       keys: ['KeyI'],               gamepad: 'circle',     hint: 'Hold over a rail to lock on' },
  { action: 'spin_left',   label: 'Spin Left',   keys: ['KeyQ'],               gamepad: 'l1',         hint: 'Rotate in air — square up before landing!' },
  { action: 'spin_right',  label: 'Spin Right',  keys: ['KeyE'],               gamepad: 'r1',         hint: 'Rotate in air — square up before landing!' },
  { action: 'boost',       label: 'Boost',       keys: ['ShiftLeft', 'KeyL'],  gamepad: 'r2',         hint: 'Burn adrenaline for speed' },
  { action: 'special',     label: 'Signature',   keys: ['KeyU'],               gamepad: 'square+triangle', hint: 'TRICKY only: signature trick' },
];

export const BOARD_INPUT_SCHEMES: Record<string, BoardControlDescriptor[]> = {
  skate: SHARED_BOARD_CONTROLS,
  snowboard: SHARED_BOARD_CONTROLS,
  surf: SHARED_BOARD_CONTROLS.filter((c) => c.action !== 'grind'),
};
