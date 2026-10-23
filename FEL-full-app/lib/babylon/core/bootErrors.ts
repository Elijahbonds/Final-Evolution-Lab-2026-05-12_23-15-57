export const WEBGL_CONTEXT_RESET_MESSAGE = 'Graphics were reset by the device. Reload to keep playing.';

export function bootErrorRequiresPageReload(detail: unknown): boolean {
  return typeof detail === 'string' && detail.includes(WEBGL_CONTEXT_RESET_MESSAGE);
}
