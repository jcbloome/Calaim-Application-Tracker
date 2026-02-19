import { NextResponse } from 'next/server';

export function GET(request: Request) {
  // IMPORTANT: use a relative redirect here.
  // In some hosting setups (Cloud Run / App Hosting), `request.url` can reflect the
  // internal container address (e.g. `0.0.0.0:8080`). A relative redirect avoids
  // leaking that internal host into the Location header.
  return NextResponse.redirect('/admin/desktop-installer');
}
