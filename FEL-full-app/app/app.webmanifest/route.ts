import { FEL_MANIFEST } from '@/lib/pwa/manifest';

// The web app manifest at /app.webmanifest. Why a route handler and not app/manifest.ts: lib/pwa/manifest.ts.
export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(JSON.stringify(FEL_MANIFEST), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
  });
}
