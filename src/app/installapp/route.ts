import { NextResponse } from 'next/server';

export function GET(request: Request) {
  // IMPORTANT: use a relative redirect here.
  // In some hosting setups (Cloud Run / App Hosting), `request.url` can reflect the
  // internal container address (e.g. `0.0.0.0:8080`). A relative redirect avoids
  // leaking that internal host into the Location header.
  // Some platforms still normalize `NextResponse.redirect()` to an absolute URL using
  // internal host headers. Setting Location manually guarantees it stays relative.
  return new NextResponse(null, {
    status: 307,
    headers: {
      location: '/admin/desktop-installer',
      'cache-control': 'no-store',
    },
  });
}
