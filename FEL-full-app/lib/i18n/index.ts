// i18n-READY (A11-07, lane/a11y-design, 2026-10-25). English only at launch (owner); this is the seam, not a translation.
//
// No dependency (owner's rule): a tiny in-repo t(key, vars) over JSON message files, one file per area under
// messages/en/. Keys are TYPED from the English files, so a key that does not exist is a type error, and every message a
// converted file shows lives in a file a translator can be handed. tests/i18n-ratchet.test.ts holds the converted folders:
// a NEW hard-coded string there fails; the strings already in the tree are counted as its baseline and never fail.
//
// Placeholders are `{name}`, filled from `vars`; a missing var is left visible as `{name}` (a bug you can see, never a
// crash). Adding a language later is a second folder (messages/<locale>/) and a locale switch here; nothing calls a
// locale today.
import settings from '@/messages/en/settings.json';
import shell from '@/messages/en/shell.json';
import play from '@/messages/en/play.json';
import train from '@/messages/en/train.json';
import profile from '@/messages/en/profile.json';
import ui from '@/messages/en/ui.json';

export const LOCALES = ['en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** The English messages, by area. */
export const EN = { settings, shell, play, train, profile, ui } as const;

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : T[K] extends Record<string, unknown> ? Leaves<T[K], `${P}${K}.`> : never;
}[keyof T & string];

/** Every message key, e.g. 'shell.tabs.play'. */
export type MessageKey = Leaves<typeof EN>;

export type Vars = Record<string, string | number>;

/** PURE: the message at a dotted path, or undefined. */
export function lookup(messages: unknown, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** PURE: fill `{name}` placeholders. */
export function format(message: string, vars?: Vars): string {
  if (!vars) return message;
  return message.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** The message for a key, with its placeholders filled. An unknown key (only possible past the type checker) returns the key. */
export function t(key: MessageKey, vars?: Vars): string {
  const m = lookup(EN, key);
  return m === undefined ? key : format(m, vars);
}

/** Every key in a message tree (the tests walk them). */
export function keysOf(messages: unknown, prefix = ''): string[] {
  if (messages === null || typeof messages !== 'object') return [];
  return Object.entries(messages as Record<string, unknown>).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : keysOf(v, `${prefix}${k}.`));
}
