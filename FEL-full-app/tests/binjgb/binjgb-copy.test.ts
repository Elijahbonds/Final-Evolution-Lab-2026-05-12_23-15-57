// BINJGB-SHELF-1 — copy, navigation, input scope and saves. T-NO-TM-COPY (OQ-11), T-NO-ROM-SITE-COPY (G5),
// T-NAV-NOT-MODE (G8), T-INPUT-SCOPE (G9), T-SAVE-LOCAL + T-SAVE-CAP (G7), T-CARRY-ROW (noted; see NOTES.md).
import { describe, expect, it } from 'vitest';
import { allShelfCopy, BINJGB_CREDIT_LINE, CONTROL_LABELS, PICKED_NAME_MAX, PICKER_COPY, SHELF_COPY } from '@/lib/binjgb/copy';
import { SHELF_TITLES } from '@/lib/binjgb/manifest';
import {
  BATTERY_MAX_BYTES, checkBattery, DB_MAX_BYTES, planWrite, SAVES_DB_NAME, STATE_MAX_BYTES, STATE_MAX_SLOTS, stateKey,
} from '@/lib/binjgb/savesDb';
import { gamepadBits, isTextEntry, KEY_TO_BUTTON, shouldPollGamepad, BUTTON } from '@/lib/binjgb/input';
import { isAnonymousEvent } from '@/lib/analyticsAnon';
import { MODE_INFO } from '@/lib/game-data';
import { FAMILIES } from '@/lib/nav/families';
import { MODE_MENU_META } from '@/lib/mode-menu';
import { read, sources, SHELF_CODE_DIRS } from './helpers';

/** Strip the allowed extension tokens (.gb / .gbc as file extensions only) before the trademark scan. */
const withoutExtensions = (s: string) => s.replace(/\.gbc?\b/gi, '');
const TM = /game\s*boy|gameboy|\bgbc\b|\bgb\b|nintendo|pok[eé]mon|\bdmg\b|\bcgb\b/i;

/** Every UI-visible string in the shelf: the copy module, manifest titles, credit line, metadata, alt/aria/title attrs. */
function uiStrings(): string[] {
  const out = [...allShelfCopy(), ...SHELF_TITLES.map((t) => t.title), BINJGB_CREDIT_LINE, SHELF_COPY.metaTitle];
  for (const f of sources(SHELF_CODE_DIRS)) {
    for (const m of read(f).matchAll(/\b(?:alt|aria-label|title)=["']([^"']+)["']/g)) out.push(m[1]);
    // JSX text between tags that is a literal (not an expression)
    if (f.endsWith('.tsx')) for (const m of read(f).matchAll(/>\s*([A-Za-z][^<>{}]*[A-Za-z.!?])\s*</g)) out.push(m[1]);
  }
  return out;
}

describe('T-NO-TM-COPY (OQ-11): no console or platform-maker names in user-facing copy', () => {
  it('the copy, manifest, credit line, metadata, alt and aria text are clean (extensions .gb/.gbc allowed as extensions only)', () => {
    const strings = uiStrings();
    expect(strings.length).toBeGreaterThan(25);
    expect(strings.filter((s) => TM.test(withoutExtensions(s)))).toEqual([]);
  });

  it('the scan itself catches the banned words (self-test)', () => {
    for (const s of ['Game Boy', 'GAMEBOY', 'a GBC title', 'Nintendo', 'Pokemon', 'Pokémon', 'DMG', 'CGB']) expect(TM.test(withoutExtensions(s)), s).toBe(true);
    expect(TM.test(withoutExtensions('Choose a .gb or .gbc file.'))).toBe(false);
  });

  it('the frame document has no such words in its title or labels', () => {
    expect([CONTROL_LABELS.screen, CONTROL_LABELS.frame].some((s) => TM.test(s))).toBe(false);
  });
});

describe('T-NO-ROM-SITE-COPY (G5): no ROM-site link or the word "ROM" in UI copy', () => {
  // The banned hosts live in this test only (never in app code).
  const BANNED_HOSTS = ['emuparadise', 'romsmania', 'romspure', 'coolrom', 'vimm.net', 'romhustler', 'archive.org', 'cdromance', 'wowroms', 'romsfun'];

  it('no banned host anywhere in the shelf code, copy or vendored notes', () => {
    const texts = [...sources(SHELF_CODE_DIRS).map(read), read('public/vendor/binjgb/VENDOR.md'), ...allShelfCopy()];
    for (const t of texts) for (const h of BANNED_HOSTS) expect(t.toLowerCase()).not.toContain(h);
  });

  it('no "ROM" / "ROMs" in any UI string', () => {
    expect(uiStrings().filter((s) => /\broms?\b/i.test(s))).toEqual([]);
  });

  it('the shelf links only inside FEL (credits, play hub, its own slugs); no outbound href', () => {
    for (const f of sources(SHELF_CODE_DIRS)) {
      for (const m of read(f).matchAll(/href=\{?["'`]([^"'`]+)["'`]/g)) expect(m[1], f).toMatch(/^\//);
    }
  });

  it('the picker disclaimer says FEL provides no game files and links to none', () => {
    expect(PICKER_COPY.disclaimer).toContain('does not provide game files');
    expect(PICKER_COPY.disclaimer).toContain('does not link to places that share them');
    expect(PICKER_COPY.pendingElijahCard).toBe(true);
    expect(PICKED_NAME_MAX).toBe(40);
  });
});

describe('T-NAV-NOT-MODE (G8): the shelf is not a mode', () => {
  it('not in MODE_INFO, FAMILIES or the mode menu', () => {
    const blob = JSON.stringify([MODE_INFO, FAMILIES, MODE_MENU_META]).toLowerCase();
    expect(blob).not.toMatch(/gb-shelf|homebrew|binjgb/);
  });

  it('no session, score, coin, XP or leaderboard code in the shelf', () => {
    for (const f of sources(SHELF_CODE_DIRS)) {
      const imports = [...read(f).matchAll(/from ['"]([^'"]+)['"]/g)].map((m) => m[1]);
      expect(imports.filter((i) => /session-setup|scor|coin|xp|leaderboard|streak|mirror-progress|story/i.test(i)), f).toEqual([]);
    }
  });
});

describe('T-INPUT-SCOPE (G9): keys only on the focused player, never in text fields; pads only while visible', () => {
  it('no window/document keydown listener, no pointer lock, no vibration anywhere in the shelf', () => {
    for (const f of sources(SHELF_CODE_DIRS)) {
      const src = read(f);
      expect(src, f).not.toMatch(/(window|document|w)\.addEventListener\(\s*['"]key(down|up)/);
      expect(src, f).not.toMatch(/requestPointerLock|vibrate\(|vibrationActuator/);
    }
    expect(read('lib/binjgb/frameDoc.ts')).toMatch(/canvas\.addEventListener\('keydown'/);
  });

  it('text entry is never captured; keys map by event.code', () => {
    expect(isTextEntry({ tagName: 'INPUT' })).toBe(true);
    expect(isTextEntry({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextEntry({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTextEntry({ tagName: 'CANVAS' })).toBe(false);
    expect(KEY_TO_BUTTON.ArrowUp).toBe('up');
    expect(Object.keys(KEY_TO_BUTTON).every((k) => /^(Arrow|Key|Enter|Shift|Backspace|Space)/.test(k))).toBe(true);
  });

  it('gamepads are polled only while the tab is visible and the player is on screen', () => {
    expect(shouldPollGamepad('visible', true)).toBe(true);
    expect(shouldPollGamepad('hidden', true)).toBe(false);
    expect(shouldPollGamepad('visible', false)).toBe(false);
    expect(gamepadBits(null)).toBe(0);
    expect(gamepadBits({ buttons: [{ pressed: true, value: 1 }], axes: [] }) & BUTTON.a).toBe(BUTTON.a);
  });

  it('pads are read through the input layer (readPad + the controller profile), never by raw index', () => {
    const src = read('lib/binjgb/input.ts');
    expect(src).toMatch(/readPad\(pad, profileFor\(pad\)\)/);
    expect(src).not.toMatch(/\.(buttons|axes)\s*\[/);
    const pad = (pressed: number[], axes: number[] = [0, 0, 0, 0], id = 'Xbox Wireless Controller') => ({
      id, mapping: 'standard',
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
      axes,
    });
    // standard: 0 = A, 1 = B, 8 = select, 9 = start, 12–15 = d-pad
    expect(gamepadBits(pad([0]))).toBe(BUTTON.a);
    expect(gamepadBits(pad([1]))).toBe(BUTTON.b);
    expect(gamepadBits(pad([8, 9]))).toBe(BUTTON.select | BUTTON.start);
    expect(gamepadBits(pad([12, 15]))).toBe(BUTTON.up | BUTTON.right);
    // left stick as a d-pad, past the deadzone only
    expect(gamepadBits(pad([], [-1, 1, 0, 0]))).toBe(BUTTON.left | BUTTON.down);
    expect(gamepadBits(pad([], [0.1, -0.1, 0, 0]))).toBe(0);
    // the right stick and shoulders do nothing
    expect(gamepadBits(pad([4, 5, 6, 7], [0, 0, 1, 1]))).toBe(0);
    // a Switch Pro maps by POSITION: the bottom face button (physical index 1) is A, as in every FEL mode
    expect(gamepadBits(pad([1], undefined, 'Pro Controller (Vendor: 057e Product: 2009)'))).toBe(BUTTON.a);
    expect(gamepadBits(pad([0], undefined, 'Pro Controller (Vendor: 057e Product: 2009)'))).toBe(BUTTON.b);
  });

  it('fullscreen only from a tap on the player control', () => {
    const p = read('components/binjgb/local-player.tsx');
    expect(p.match(/requestFullscreen/g)).toHaveLength(1);
    expect(p).toMatch(/onClick=\{\(\) => \{ void frameRef\.current\?\.requestFullscreen/);
  });
});

describe('T-SAVE-LOCAL + T-SAVE-CAP (G7): IndexedDB fel_binjgb only, capped, nothing to the server', () => {
  it('one database, fel_binjgb; no other storage in the shelf', () => {
    expect(SAVES_DB_NAME).toBe('fel_binjgb');
    const opens = sources(SHELF_CODE_DIRS).flatMap((f) => [...read(f).matchAll(/indexedDB\.(open|deleteDatabase)\(([^,)]*)/g)].map((m) => m[2].trim()));
    expect(opens.length).toBeGreaterThan(0);
    expect(new Set(opens)).toEqual(new Set(['SAVES_DB_NAME']));
  });

  it('caps: battery 128 KiB, state 1 MiB × 3 slots, database 16 MiB', () => {
    expect([BATTERY_MAX_BYTES, STATE_MAX_BYTES, STATE_MAX_SLOTS, DB_MAX_BYTES]).toEqual([131_072, 1_048_576, 3, 16_777_216]);
    expect(checkBattery(BATTERY_MAX_BYTES)).toEqual({ ok: true });
    expect(checkBattery(BATTERY_MAX_BYTES + 1)).toEqual({ ok: false, reason: 'too-big' });
    expect(planWrite('state', 3, 10, [])).toEqual({ ok: false, reason: 'bad-slot' });
    expect(planWrite('state', 0, STATE_MAX_BYTES + 1, [])).toEqual({ ok: false, reason: 'too-big' });
  });

  it('over the total: evicts the oldest save states first, never a battery save; refuses when only batteries remain', () => {
    const MiB = 1024 * 1024;
    const others = [
      { key: 'g1', kind: 'battery' as const, bytes: 13 * MiB, at: 1 },
      { key: stateKey('g1', 0), kind: 'state' as const, bytes: MiB, at: 5 },
      { key: stateKey('g1', 1), kind: 'state' as const, bytes: MiB, at: 2 },
      { key: stateKey('g1', 2), kind: 'state' as const, bytes: MiB, at: 9 },
    ];
    expect(planWrite('state', 0, MiB, others.filter((o) => o.key !== 'g1:0'))).toEqual({ ok: true, evict: [] });
    expect(planWrite('state', 0, MiB, [...others, { key: 'g2:0', kind: 'state', bytes: MiB, at: 0 }])).toEqual({ ok: true, evict: ['g2:0', 'g1:1'] });
    expect(planWrite('battery', 0, 128 * 1024, [{ key: 'g9', kind: 'battery', bytes: DB_MAX_BYTES, at: 0 }])).toEqual({ ok: false, reason: 'full' });
  });

  it('T-CARRY-ROW (noted): the shelf adds no localStorage/sessionStorage key; fel_binjgb needs a SKIP row in DATA-CARRYOVER-1', () => {
    // DATA-CARRYOVER-1's registry is not in this tree (12b817a3), so T-INV-2 cannot run here. The guard this tree CAN
    // hold: the shelf's only client storage is the fel_binjgb IndexedDB database. See NOTES.md.
    for (const f of sources(SHELF_CODE_DIRS)) expect(read(f), f).not.toMatch(/localStorage|sessionStorage/);
  });
});

describe('analytics: the two homebrew events carry no user and are anonymous', () => {
  it('both are anonymous events; other events are unaffected', () => {
    expect(isAnonymousEvent('homebrew_shelf_play')).toBe(true);
    expect(isAnonymousEvent('homebrew_local_play')).toBe(true);
  });
});
