// lib/coach/delivery/media.ts — COACH-DELIVERY (2026-10-26): a signed PUT into one of FEL's own Google Cloud Storage buckets
// for a coach's logo (COA-04) and a coach's exercise video (COA-08). No new package and no new signer: the canonical request
// is lib/soundtrack/storage.ts buildSignedRequest (itself checked byte for byte against the coach store's), and the signature
// comes from the runtime's own service account through IAM signBlob — the same two calls those modules make.
//
// FAILS CLOSED: no bucket name (the owner's step, OWN-16), or a malformed one, and every call throws UploadsComingSoon, which
// the routes turn into "uploads are not on yet". The size is bound into the signature (GCS refuses any other length).
import { buildSignedRequest, objectUrl, UploadsComingSoon, type SignDeps } from '@/lib/soundtrack/storage';

export { UploadsComingSoon, type SignDeps };

const BUCKET_RE = /^[a-z0-9][a-z0-9._-]{1,220}$/;
export const PUT_TTL_SEC = 15 * 60;

/** A bucket name from env, or null (off). */
export function bucketFrom(name: string | undefined): string | null {
  const b = (name ?? '').trim();
  return BUCKET_RE.test(b) ? b : null;
}

async function identity(deps: SignDeps): Promise<{ accessToken: string; email: string }> {
  if (deps.token) return deps.token();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const headers = { 'Metadata-Flavor': 'Google' };
  const [t, e] = await Promise.all([
    fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers }),
    fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email', { headers }),
  ]);
  if (!t.ok || !e.ok) throw new UploadsComingSoon();
  const tok = (await t.json()) as { access_token?: string };
  const email = (await e.text()).trim();
  if (!tok.access_token || !email) throw new UploadsComingSoon();
  return { accessToken: tok.access_token, email };
}

async function signBlob(stringToSign: string, deps: SignDeps): Promise<string> {
  if (deps.sign) return deps.sign(stringToSign);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const id = await identity(deps);
  const r = await fetchImpl(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(id.email)}:signBlob`, {
    method: 'POST', headers: { Authorization: `Bearer ${id.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: Buffer.from(stringToSign).toString('base64') }),
  });
  if (!r.ok) throw new UploadsComingSoon();
  const j = (await r.json()) as { signedBlob?: string };
  if (!j.signedBlob) throw new UploadsComingSoon();
  return Buffer.from(j.signedBlob, 'base64').toString('hex');
}

/** A signed PUT for exactly `bytes` of `contentType` at `objectName` in `bucket`, and the object's public URL. */
export async function signOwnPut(input: { bucket: string | null; objectName: string; contentType: string; bytes: number }, deps: SignDeps = {}): Promise<{ url: string; headers: Record<string, string>; objectUrl: string }> {
  if (!input.bucket) throw new UploadsComingSoon();
  const now = (deps.now ?? (() => new Date()))();
  const email = deps.sign && !deps.token ? 'signer@test.iam.gserviceaccount.com' : (await identity(deps)).email;
  const built = buildSignedRequest({ method: 'PUT', bucket: input.bucket, objectName: input.objectName, expiresSec: PUT_TTL_SEC, now, email, contentType: input.contentType, bytes: input.bytes });
  const signature = await signBlob(built.stringToSign, deps);
  return { url: `${built.urlBase}&X-Goog-Signature=${signature}`, headers: built.headers, objectUrl: objectUrl(input.bucket, input.objectName) };
}
