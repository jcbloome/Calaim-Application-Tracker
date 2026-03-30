import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const apiKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    '';

  if (!apiKey) {
    return NextResponse.json(
      {
        success: false,
        error: 'Google Maps API key is not configured.',
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    apiKey,
  });
}
