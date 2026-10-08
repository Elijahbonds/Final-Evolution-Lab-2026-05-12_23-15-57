import { readFileSync } from 'node:fs';

/**
 * Read the enabled Babylon mode list from registry source text. Probes use this
 * instead of importing the registry because that pulls the whole engine into
 * Node before a browser exists.
 */
export function enabledModesFromSource(src: string): string[] {
  const decl = src.indexOf('ENABLED_BABYLON_MODES');
  if (decl < 0) throw new Error('ENABLED_BABYLON_MODES declaration not found');
  const open = src.indexOf('[', decl);
  const close = src.indexOf(']', open);
  if (open < 0 || close < 0) throw new Error('ENABLED_BABYLON_MODES array literal not found');
  return [...src.slice(open, close).matchAll(/'([a-zA-Z0-9_-]+)'/g)].map((m) => m[1]);
}

/** Read the enabled list from the registry's SOURCE. */
export function enabledModes(): string[] {
  const src = readFileSync(new URL('../../lib/babylon/modes/registry.ts', import.meta.url), 'utf8');
  return enabledModesFromSource(src);
}
