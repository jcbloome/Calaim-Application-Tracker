import { NextResponse } from 'next/server';

export function GET() {
  const targetUrl = process.env.NEXT_PUBLIC_DESKTOP_INSTALLER_URL;

  if (!targetUrl) {
    return new NextResponse('Installer link not configured.', { status: 404 });
  }

  return NextResponse.redirect(targetUrl);
}
