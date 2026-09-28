/**
 * Creator-platform flags. ON only for 1 / true / on / yes, the lib/flags.ts convention. Everything defaults OFF.
 */

export function creatorFlagOn(env: NodeJS.ProcessEnv, name: string): boolean {
  const v = (env[name] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}
