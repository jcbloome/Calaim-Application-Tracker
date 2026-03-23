import { NextRequest, NextResponse } from 'next/server';

function isDebugOrTestApiPath(pathname: string): boolean {
  if (!pathname.startsWith('/api/')) return false;
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'api') return false;

  return segments.some((segment) => {
    return (
      segment === 'test' ||
      segment === 'debug' ||
      segment.startsWith('test-') ||
      segment.endsWith('-test') ||
      segment.startsWith('debug-') ||
      segment.endsWith('-debug')
    );
  });
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (process.env.NODE_ENV === 'production' && isDebugOrTestApiPath(pathname)) {
    const debugApiKey = (process.env.DEBUG_API_KEY || '').trim();
    const providedKey = (request.headers.get('x-debug-api-key') || '').trim();
    if (!debugApiKey || providedKey !== debugApiKey) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  if (pathname.startsWith('/admin/morning-dashboard')) {
    const adminSession = request.cookies.get('calaim_admin_session')?.value;
    if (!adminSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/morning-dashboard/:path*', '/api/:path*'],
};
