import { NextResponse } from 'next/server';

/** /books is the old address. It opens Final Evolution Press (/press), the book shop. Owner, 2026-10-13: was /links#books. */
export function GET() {
  return new NextResponse(null, {
    status: 307,
    headers: { Location: '/press' },
  });
}
