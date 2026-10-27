// The i18n seam (A11-07): typed keys, placeholders, and message files with no empty or orphaned messages.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_LOCALE, EN, LOCALES, format, keysOf, lookup, t } from './index';

const ROOT = join(__dirname, '..', '..');

describe('t()', () => {
  it('reads a message by its dotted key and fills placeholders', () => {
    expect(t('shell.tabs.play')).toBe('Play');
    expect(t('train.cards.programming.lineCoach', { name: 'Coach Dee' })).toBe('Written by Coach Dee.');
    expect(t('shell.venues.live', { count: 13 })).toBe('13 live');
  });
  it('a missing var stays visible; an unknown key returns itself', () => {
    expect(format('Hi {name}, {n}', { n: 2 })).toBe('Hi {name}, 2');
    expect(lookup(EN, 'shell.nope')).toBeUndefined();
    expect(t('shell.nope' as never)).toBe('shell.nope');
  });
  it('English only at launch', () => {
    expect(LOCALES).toEqual(['en']);
    expect(DEFAULT_LOCALE).toBe('en');
  });
});

describe('the message files', () => {
  const keys = keysOf(EN);
  it('every area under messages/en is loaded', () => {
    const files = readdirSync(join(ROOT, 'messages/en')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
    expect(Object.keys(EN).sort()).toEqual(files);
  });
  it('no message is empty', () => {
    for (const k of keys) expect(lookup(EN, k)?.trim(), k).toBeTruthy();
  });
  it('every message is used: a key nothing reads is a string nobody sees', () => {
    const src: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d)) {
        if (e === 'node_modules' || e.startsWith('.')) continue;
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) src.push(readFileSync(p, 'utf8'));
      }
    };
    for (const d of ['app', 'components', 'lib']) walk(join(ROOT, d));
    const all = src.join('\n');
    for (const k of keys) {
      // a key is used whole ('shell.tabs.play') or as the prefix a template completes (`settings.motion.label.${p}`)
      const parent = k.slice(0, k.lastIndexOf('.'));
      expect(all.includes(`'${k}'`) || all.includes(`${parent}.\${`), k).toBe(true);
    }
  });
});
