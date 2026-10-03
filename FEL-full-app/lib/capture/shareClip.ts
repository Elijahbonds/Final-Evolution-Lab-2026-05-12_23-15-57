// shareClip — the system share sheet, or a download when the sheet cannot take a file.
//
// The app never posts. planShare only chooses. deliverClip is called from a tap and either calls
// navigator.share or saves a file. There is no third path.

export type SharePlan =
  | { kind: 'sheet'; fileName: string }
  | { kind: 'download'; fileName: string; reason: 'no-share' | 'cannot-share-file' };

export function planShare(env: { hasShare: boolean; canShareFile: boolean }, fileName: string): SharePlan {
  if (env.hasShare && env.canShareFile) return { kind: 'sheet', fileName };
  return { kind: 'download', fileName, reason: env.hasShare ? 'cannot-share-file' : 'no-share' };
}

export function shareFileName(kind: 'game' | 'replay' | 'dunk', aspect: '9:16' | '16:9', ext: string): string {
  const shape = aspect === '9:16' ? '9x16' : '16x9';
  const safeExt = ext.replace(/^\./, '') || 'webm';
  return `fel-${kind}-${shape}.${safeExt}`;
}

export function extForMime(mime: string | null): string {
  if (mime && mime.includes('mp4')) return 'mp4';
  return 'webm';
}

export interface ShareEnv {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  download: (blob: Blob, fileName: string) => void;
}

/** A download in the browser. The fallback when the share sheet cannot take a file. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Hand the file to the sheet, or download it. Returns which one happened. */
export async function deliverClip(
  blob: Blob,
  fileName: string,
  title: string,
  env: ShareEnv,
): Promise<SharePlan> {
  const file = new File([blob], fileName, { type: blob.type || 'video/webm' });
  const plan = planShare(
    { hasShare: typeof env.share === 'function', canShareFile: env.canShare ? env.canShare({ files: [file] }) : false },
    fileName,
  );
  if (plan.kind === 'sheet' && env.share) {
    await env.share({ files: [file], title, text: `${title} — ${fileName}` });
    return plan;
  }
  env.download(blob, fileName);
  return plan.kind === 'sheet' ? { kind: 'download', fileName, reason: 'no-share' } : plan;
}
