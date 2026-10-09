/**
 * lib/marketing/joinLab.ts — JOIN-LAB-HIDE (2026-09-29): the one switch for the "Join the Lab" email form
 * (components/marketing/email-capture.tsx, rendered by the signed-out landing on `/`) and for the intake behind it,
 * POST /api/marketing/subscribe. Off unless NEXT_PUBLIC_JOIN_LAB_ENABLED is exactly the string 'true'; off is unset,
 * so no env file or deploy config carries the key.
 *
 * The default argument spells `process.env.NEXT_PUBLIC_JOIN_LAB_ENABLED` out because Next inlines a NEXT_PUBLIC_ value
 * only where the code names it in full. `process.env` handed over whole is an empty object in the browser bundle, so
 * the flag could never turn on there, and the server render and the client would disagree about the form. The value is
 * baked in at build time: turning it on takes a rebuild.
 */

type JoinLabEnv = { readonly NEXT_PUBLIC_JOIN_LAB_ENABLED?: string };

// Hidden until the adult waitlist asks an age question and saves safely (PRIVACY-CORE).
export function joinLabEnabled(
  env: JoinLabEnv = { NEXT_PUBLIC_JOIN_LAB_ENABLED: process.env.NEXT_PUBLIC_JOIN_LAB_ENABLED },
): boolean {
  return env.NEXT_PUBLIC_JOIN_LAB_ENABLED === 'true';
}
