import { NextResponse } from 'next/server';

// Desktop installer removed - redirect to admin dashboard
export function GET() {
  return new NextResponse(null, {
    status: 307,
    headers: {
      location: '/admin',
      'cache-control': 'no-store',
    },
  });
}
