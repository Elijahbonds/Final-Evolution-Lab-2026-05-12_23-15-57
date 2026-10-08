/** Empty allowlist means nobody is a coach. Fail closed. */
export function coachUserIds(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set((env.COACH_STORE_COACH_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
}

export function isAllowlistedCoach(userId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return coachUserIds(env).has(userId);
}
