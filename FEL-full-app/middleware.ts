import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Hostname-aware routing middleware.
 *
 * nexusllm.abacusai.app → NEXUS Studio  (redirect / → /studio)
 * finalevolution.abacusai.app → FEL game (unchanged)
 * localhost → both (no redirect)
 *
 * Studio pages are /studio/* — they exist in both builds but only
 * nexusllm routes to them by default.
 */

const NEXUS_HOSTS = ['nexusllm.abacusai.app'];

export function middleware(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
  const hostname = host.split(':')[0];
  const { pathname } = req.nextUrl;

  // On NEXUS domain: redirect root → /studio (unless already there or API/static)
  if (NEXUS_HOSTS.includes(hostname)) {
    if (
      pathname === '/' &&
      !pathname.startsWith('/studio') &&
      !pathname.startsWith('/api') &&
      !pathname.startsWith('/_next') &&
      !pathname.startsWith('/login') &&
      !pathname.startsWith('/signup')
    ) {
      return NextResponse.redirect(new URL('/studio', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|glb|mp3|wav|ogg|json|css|js|woff|woff2|ttf|otf|ico|webmanifest)).*)'],
};
