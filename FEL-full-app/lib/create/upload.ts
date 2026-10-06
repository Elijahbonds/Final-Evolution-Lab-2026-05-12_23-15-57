// lib/create/upload.ts — CREATE HUB: one media upload, on lane/soundtrack's phase-0 contract.
//
//   POST /api/v1/creative-card/upload-url {fileName, contentType, bytes, durationSec?}
//     → {uploadUrl, headers, objectName, publicUrl}
//   PUT uploadUrl with exactly those headers (the size is bound into the signature) and the bytes.
//
// `publicUrl` is the PENDING object's address: what the card stores, readable by nobody until an approver passes the
// card (lane/soundtrack copies it to the public bucket then). The route answers 403 device_only to anyone who is not a
// verified 18+, 503 until the bucket is configured, 429 when rate-limited, 422 for a type or size it will not take.
// Every one of those comes back as an UploadError a player can read. `fetchImpl` is injected so this runs in tests.

export type UploadErrorCode = 'device_only' | 'coming_soon' | 'rate_limited' | 'refused' | 'network' | 'put_failed';

export class UploadError extends Error {
  code: UploadErrorCode;
  constructor(code: UploadErrorCode, message: string) { super(message); this.name = 'UploadError'; this.code = code; }
}

export interface UploadInput {
  body: Blob;
  fileName: string;
  contentType: string;
  /** Required for audio by the route (the 4-minute cap). */
  durationSec?: number;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

const safeName = (n: string) => n.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'file';

export async function uploadMedia(input: UploadInput, fetchImpl: FetchLike = (u, i) => fetch(u, i)): Promise<string> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchImpl('/api/v1/creative-card/upload-url', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileName: safeName(input.fileName), contentType: input.contentType, bytes: input.body.size,
        ...(input.durationSec !== undefined ? { durationSec: Math.round(input.durationSec * 100) / 100 } : {}),
      }),
    });
  } catch { throw new UploadError('network', 'Could not reach FEL. Check your connection and try again.'); }
  const data = (await res.json().catch(() => ({}))) as { uploadUrl?: string; headers?: Record<string, string>; publicUrl?: string; error?: string; message?: string };
  if (!res.ok) {
    if (res.status === 403) throw new UploadError('device_only', data.message ?? 'Uploads are for creators 18 and over. Your work stays on this device.');
    if (res.status === 503) throw new UploadError('coming_soon', 'Uploads are coming soon: FEL has not switched creator storage on yet.');
    if (res.status === 429) throw new UploadError('rate_limited', 'Too many uploads in a row. Try again in a few minutes.');
    throw new UploadError('refused', data.error ?? `Upload refused (${res.status}).`);
  }
  if (!data.uploadUrl || !data.publicUrl) throw new UploadError('refused', 'Upload refused (no address came back).');
  let put: Awaited<ReturnType<FetchLike>>;
  try {
    put = await fetchImpl(data.uploadUrl, { method: 'PUT', headers: { ...(data.headers ?? { 'content-type': input.contentType }) }, body: input.body });
  } catch { throw new UploadError('network', 'The upload was cut off. Try again.'); }
  if (!put.ok) throw new UploadError('put_failed', `The upload did not finish (${put.status}). Try again.`);
  return data.publicUrl;
}
