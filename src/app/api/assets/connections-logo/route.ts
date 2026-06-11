import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

const CANDIDATE_LOGO_PATHS = [
  path.join(process.cwd(), 'public', 'calaimlogopdf.png'),
  path.join(process.cwd(), 'public', 'ils-logo.png'),
];

export async function GET() {
  for (const filePath of CANDIDATE_LOGO_PATHS) {
    try {
      const data = await fs.readFile(filePath);
      return new NextResponse(data, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        },
      });
    } catch {
      // Try next candidate
    }
  }

  return NextResponse.json({ error: 'Logo not found' }, { status: 404 });
}
