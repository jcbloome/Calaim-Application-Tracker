import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

const CANDIDATE_WOLF_PATHS = [
  path.join(process.cwd(), 'public', 'wolf-mascot-small.jpg'),
  path.join(process.cwd(), 'public', 'wolf mascotsmall.jpg'),
];

export async function GET() {
  for (const filePath of CANDIDATE_WOLF_PATHS) {
    try {
      const data = await fs.readFile(filePath);
      return new NextResponse(data, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        },
      });
    } catch {
      // Try next candidate.
    }
  }

  return NextResponse.json({ error: 'Wolf mascot not found' }, { status: 404 });
}
