const PLACEHOLDER_COPY = /\bplaceholder\b/i;

export function isPlaceholderCopy(value: string | null | undefined): boolean {
  return !value || PLACEHOLDER_COPY.test(value.trim());
}

export function publicCopy(value: string | null | undefined, fallback: string): string {
  return isPlaceholderCopy(value) ? fallback : value!.trim();
}
