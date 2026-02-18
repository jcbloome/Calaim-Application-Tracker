import { NextResponse } from 'next/server';

export function GET(request: Request) {
  // Always redirect through our smart installer endpoint, which resolves the
  // latest GitHub release asset (and can fall back to a locally bundled installer).
  const url = new URL('/admin/desktop-installer', request.url);
  return NextResponse.redirect(url);
}
