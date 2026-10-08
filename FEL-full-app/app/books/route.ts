import { NextResponse } from 'next/server';

/** /books is the old address. It opens the books section of the public links page. */
export function GET() {
  return new NextResponse(null, {
    status: 307,
    headers: { Location: '/links#books' },
  });
}
