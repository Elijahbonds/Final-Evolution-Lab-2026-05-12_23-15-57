// MUSIC-SUITE P6 phone-replay (2026-09-26) — the byte-identical proof for the phone page, re-run for the room-state change.
// P5 captured every mode's controller markup from the page as it was BEFORE P5 (musicsuite/p5/phone/controller-markup-
// before.json, the original controller-page.tsx :86-100 schema map). This renders SchemaControls as it is NOW for every
// mode in the registry — with NO state, and with a room state in hand that lights every action the mode has — and
// compares each to that capture. A mode that did not opt in (types.ts ModeControllerConfig.roomState) must be identical
// both ways; music_flip / music_perform opted in (and music_flip already changed in P5).
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p6-controller-markup.ts   (OUT env override)
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SchemaControls } from '../../components/controller-link/controller-page';
import { MODE_CONTROLLERS } from '../../lib/controller-link/schemas/registry';
import { roomStateOptIn } from '../../lib/controller-link/roomState';
import type { ModeControllerConfig, RoomState } from '../../lib/controller-link/types';

// the page's .tsx compiles with the classic JSX runtime under tsx: React must be a global when it renders
(globalThis as unknown as { React: typeof React }).React = React;

const P5 = '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p5/phone/controller-markup-before.json';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p6/phone-replay';
fs.mkdirSync(OUT, { recursive: true });
const before = JSON.parse(fs.readFileSync(P5, 'utf8')) as Record<string, string>;
const MAIN = 'flex flex-1 flex-col justify-center gap-6 px-4 pb-8';
const page = (c: ModeControllerConfig, live: RoomState | null | undefined): string =>
  renderToStaticMarkup(createElement('main', { className: MAIN }, createElement(SchemaControls, live === undefined ? { config: c, client: null } : { config: c, client: null, live })));
const allActions = (c: ModeControllerConfig): string[] => c.schemas.flatMap((s) => (s.kind === 'button' ? s.buttons.map((b) => b.action) : s.kind === 'dpad' ? [s.dpad.action] : [s.motion.action]));

const modes: Record<string, unknown> = {};
let others = 0, othersIdentical = 0;
for (const [id, c] of Object.entries(MODE_CONTROLLERS)) {
  const loud: RoomState = { lit: allActions(c).slice(0, 16), chips: [{ text: 'BANK B · Pocket Bass', tone: '#e8d9c2' }, { text: '▶ PLAYING', tone: '#4ade80', on: true }] };
  const now = page(c, undefined), withNull = page(c, null), withState = page(c, loud);
  const pre = before[id];
  const optIn = roomStateOptIn(c);
  const row = {
    optIn, capturedBeforeP5: pre !== undefined,
    identicalToBeforeP5: pre === undefined ? null : now === pre,
    identicalWithState: withState === now, identicalWithNull: withNull === now,
    bytes: now.length, bytesWithState: withState.length,
  };
  modes[id] = row;
  if (!optIn) { others++; if (row.identicalToBeforeP5 !== false && row.identicalWithState && row.identicalWithNull) othersIdentical++; }
}
const out = {
  at: new Date().toISOString(),
  what: 'controller page schema markup: before MUSIC-SUITE P5 (p5/phone/controller-markup-before.json) vs now (P6 phone-replay), with no room state, a null one, and one lighting every action',
  otherModes: others, otherModesIdentical: othersIdentical, allOtherModesIdentical: others === othersIdentical,
  optedIn: Object.entries(MODE_CONTROLLERS).filter(([, c]) => roomStateOptIn(c)).map(([id]) => id),
  modes,
};
fs.writeFileSync(`${OUT}/controller-markup-proof.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ otherModes: others, otherModesIdentical: othersIdentical, optedIn: out.optedIn }));
for (const [id, r] of Object.entries(modes)) console.log(id, JSON.stringify(r));
