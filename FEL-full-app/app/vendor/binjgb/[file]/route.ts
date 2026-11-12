// BINJGB-SHELF-1 G1(a) (Cyber A2, 2026-11-09): the vendored player, served by the function and never by Hosting's static
// layer. public/ is copied whole to Firebase Hosting and served before the function, middleware or the flag are asked, so
// the bytes left public/ (third_party/binjgb/ keeps the source copies; lib/binjgb/vendor-bytes.server.ts is what ships).
// force-dynamic + no generateStaticParams: never prerendered, so never in prerender-manifest and never copied to Hosting.
import { isBinjgbShelfEnabled } from '@/lib/flags';
import { binjgbVendorBytes } from '@/lib/binjgb/vendor-bytes.server';
import {
  binjgbVendorFile, binjgbVendorMethodNotAllowed, binjgbVendorNotFound, binjgbVendorOkHeaders, binjgbVendorOptions,
} from '@/lib/binjgb/vendorHttp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { file: string } }): Promise<Response> {
  if (!isBinjgbShelfEnabled()) return binjgbVendorNotFound();   // read per request (G10)
  const file = binjgbVendorFile(params?.file);
  if (!file) return binjgbVendorNotFound();
  return new Response(binjgbVendorBytes(file), { status: 200, headers: binjgbVendorOkHeaders(file) });
}

// I-2 (Cyber review 467aa397): Next's own OPTIONS (204) and 405 answers carry no Cache-Control; these send no-store and
// nosniff like every other answer here. Flag off, they are the same one 404 as GET (middleware 404s first anyway).
export async function OPTIONS(): Promise<Response> {
  return isBinjgbShelfEnabled() ? binjgbVendorOptions() : binjgbVendorNotFound();
}

async function methodNotAllowed(): Promise<Response> {
  return isBinjgbShelfEnabled() ? binjgbVendorMethodNotAllowed() : binjgbVendorNotFound();
}
export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
