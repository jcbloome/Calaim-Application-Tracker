import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionValue } from '@/lib/admin-session-token';

// Called by admin UI in production despite matching the test/debug naming pattern.
const DEBUG_PATTERN_API_ALLOWLIST = new Set([
  '/api/alft/reminders/send-test',
  '/api/test-emails',
  '/api/caspio-simple-test',
  '/api/caspio-single-client-test',
  '/api/test-caspio-note',
]);

function isDebugOrTestApiPath(pathname: string): boolean {
  if (!pathname.startsWith('/api/')) return false;
  if (DEBUG_PATTERN_API_ALLOWLIST.has(pathname.replace(/\/+$/, ''))) return false;
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

// Pages the admin layout lets non-admin portal users (ILS contacts, desktop windows) open.
// They are still guarded client-side; middleware leaves them alone.
const ADMIN_PATHS_WITHOUT_SESSION = [
  '/admin/login',
  '/admin/my-notes',
  '/admin/reports/ils',
  '/admin/ils-report-editor',
  '/admin/ils-package-review',
  '/admin/tools/ils-status-check',
  '/admin/tools/ils-mif-monthly-report',
  '/admin/tools/h2022-claim-checker',
  '/admin/h2022-claim-checker',
  '/admin/desktop-notification-window',
  '/admin/desktop-chat-window',
];

const SUPER_ADMIN_PATHS = ['/admin/super-admin-tools'];

const matchesPrefix = (pathname: string, prefixes: string[]) =>
  prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

function redirectToAdminLogin(request: NextRequest, clearCookie = false) {
  const url = request.nextUrl.clone();
  url.pathname = '/admin/login';
  url.search = '';
  url.searchParams.set('redirect', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const response = NextResponse.redirect(url);
  if (clearCookie) {
    response.cookies.set(ADMIN_SESSION_COOKIE, '', { path: '/admin', maxAge: 0 });
  }
  return response;
}

async function guardAdminPage(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;
  if (matchesPrefix(pathname, ADMIN_PATHS_WITHOUT_SESSION)) return null;

  const session = await verifyAdminSessionValue(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (session.status === 'missing') return redirectToAdminLogin(request);
  if (session.status === 'invalid') return redirectToAdminLogin(request, true);

  // Legacy unsigned cookies carry no role; the page's own check still applies until
  // the admin layout refreshes them into signed cookies.
  if (session.status === 'valid' && matchesPrefix(pathname, SUPER_ADMIN_PATHS) && session.role !== 'super') {
    const url = request.nextUrl.clone();
    url.pathname = '/admin';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (process.env.NODE_ENV === 'production' && isDebugOrTestApiPath(pathname)) {
    const debugApiKey = (process.env.DEBUG_API_KEY || '').trim();
    const providedKey = (request.headers.get('x-debug-api-key') || '').trim();
    if (!debugApiKey || providedKey !== debugApiKey) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const blocked = await guardAdminPage(request);
    if (blocked) return blocked;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/:path*'],
};
