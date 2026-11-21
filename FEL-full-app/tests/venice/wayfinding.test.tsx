// Venice V1 phase 9: the wayfinding layer is small, but it is how a player finds the four courts and how keyboard/pad
// players launch from the walk-up card. These tests keep the map accessible and prevent repeated launches from a held key.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mount } from '@/tests/helpers/hookRuntime';
import { v1Area, v1Spots } from '@/lib/adventure/venice/hubWorld';
import type { InputBus } from '@/lib/babylon';
import { FirstVisitHint, HINT_KEY, MiniMap, miniMapStatus, toMap, useCardKeys, useFirstVisitHint } from '@/app/play/venice/wayfinding';

vi.mock('react', async (importOriginal) => (await import('@/tests/helpers/hookRuntime')).hookedReact(await importOriginal()));

const g = globalThis as unknown as {
  window?: unknown;
  localStorage?: unknown;
};

const flush = async (n = 1) => {
  for (let i = 0; i < n; i++) await new Promise<void>((resolve) => queueMicrotask(resolve));
};

function text(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function installStorage(seed: Record<string, string> = {}): Record<string, string> {
  const store = { ...seed };
  g.localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
  };
  return store;
}

function installWindow() {
  const keys = new Set<(e: KeyboardEvent) => void>();
  g.window = {
    addEventListener: (name: string, fn: (e: KeyboardEvent) => void) => { if (name === 'keydown') keys.add(fn); },
    removeEventListener: (name: string, fn: (e: KeyboardEvent) => void) => { if (name === 'keydown') keys.delete(fn); },
  };
  return {
    press: (event: Partial<KeyboardEvent> & { key: string }) => {
      let prevented = false;
      const e = { repeat: false, target: { tagName: 'DIV', isContentEditable: false }, preventDefault: () => { prevented = true; }, ...event } as KeyboardEvent;
      keys.forEach((fn) => fn(e));
      return prevented;
    },
    count: () => keys.size,
  };
}

class FakeBus {
  handlers: Array<(e: { t: 'button'; btn: string; pressed: boolean }) => void> = [];
  on(fn: (e: { t: 'button'; btn: string; pressed: boolean }) => void): () => void {
    this.handlers.push(fn);
    return () => { this.handlers = this.handlers.filter((h) => h !== fn); };
  }
  emit(btn: string, pressed = true): void {
    this.handlers.forEach((fn) => fn({ t: 'button', btn, pressed }));
  }
}

afterEach(() => {
  delete g.window;
  delete g.localStorage;
});

describe('Venice wayfinding map', () => {
  it('maps the walkable rectangle into the mini-map and says which court is active', () => {
    const area = v1Area();
    expect(toMap(area.minX, area.minZ)).toEqual([0, 0]);
    expect(toMap(area.maxX, area.maxZ)).toEqual([112, 112]);
    const run = v1Spots()[1];
    expect(miniMapStatus(run.id)).toBe("Venice mini-map: you are at Court 2's play ring.");
    expect(miniMapStatus(null)).toContain('step into a gold play ring');
  });

  it('keeps the drawn map decorative but exposes a screen-reader status', () => {
    const run = v1Spots()[1];
    const html = renderToStaticMarkup(createElement(MiniMap, { active: run.id }));
    expect(html).toContain('data-testid="venice-minimap-status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('<svg aria-hidden="true"');
    expect(text(html)).toContain("Venice mini-map: you are at Court 2's play ring.");
  });

  it('the first-visit hint is specific to touch or keyboard', () => {
    expect(text(renderToStaticMarkup(createElement(FirstVisitHint, { onDismiss: () => {}, touch: true })))).toContain('Drag anywhere to walk.');
    expect(text(renderToStaticMarkup(createElement(FirstVisitHint, { onDismiss: () => {}, touch: false })))).toContain('Walk with WASD, the arrows or a stick.');
  });
});

describe('Venice first-visit hint memory', () => {
  it('shows once, then records dismissal', async () => {
    const store = installStorage();
    let shown = false;
    let dismiss = () => {};
    mount(() => {
      [shown, dismiss] = useFirstVisitHint(true, false);
      return null;
    });
    await flush();
    expect(shown).toBe(true);
    dismiss();
    await flush();
    expect(shown).toBe(false);
    expect(store[HINT_KEY]).toBe('1');
  });

  it('auto-dismisses when the player reaches a court card', async () => {
    const store = installStorage();
    let shown = false;
    mount(() => {
      [shown] = useFirstVisitHint(true, true);
      return null;
    });
    await flush(3);
    expect(shown).toBe(false);
    expect(store[HINT_KEY]).toBe('1');
  });
});

describe('Venice walk-up card keys', () => {
  it('Enter plays once, ignores repeat, and leaves native button/link Enter alone', () => {
    const win = installWindow();
    let plays = 0;
    const bus = new FakeBus();
    const mounted = mount(() => {
      useCardKeys(bus as unknown as InputBus, true, () => { plays++; }, null);
      return null;
    });
    expect(win.count()).toBe(1);
    expect(win.press({ key: 'Enter' })).toBe(true);
    win.press({ key: 'Enter', repeat: true });
    win.press({ key: 'Enter', target: { tagName: 'BUTTON', isContentEditable: false } as unknown as EventTarget });
    expect(plays).toBe(1);
    mounted.unmount();
    expect(win.count()).toBe(0);
  });

  it('pad/keyboard face buttons play or party only on pressed edges', () => {
    installWindow();
    let plays = 0, parties = 0;
    const bus = new FakeBus();
    mount(() => {
      useCardKeys(bus as unknown as InputBus, true, () => { plays++; }, () => { parties++; });
      return null;
    });
    bus.emit('X');
    bus.emit('Y');
    bus.emit('X', false);
    expect(plays).toBe(1);
    expect(parties).toBe(1);
  });
});
