import { NextResponse } from 'next/server';

/** /elijah was the first bio page. It stays as a permanent redirect to /links. */
export function GET() {
  return new NextResponse(null, {
    status: 308,
    headers: { Location: '/links' },
  });
}
