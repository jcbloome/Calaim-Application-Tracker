import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value ?? '').trim();
const ALLOWED_PREFIXES = ['user_uploads/', 'admin_uploads/', 'documents/'];

/**
 * Staff-only: stream an uploaded application document. Families cannot read uploads (Storage rules),
 * and this route checks admin access server-side so every staff member can always open them.
 */
export async function POST(request: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const body = (await request.json().catch(() => ({}))) as { filePath?: string };
    const filePath = clean(body.filePath).replace(/^\/+/, '');
    if (!filePath || filePath.includes('..') || !ALLOWED_PREFIXES.some((prefix) => filePath.startsWith(prefix))) {
      return NextResponse.json({ success: false, error: 'Invalid document path.' }, { status: 400 });
    }

    const { adminStorage } = await import('@/firebase-admin');
    const file = adminStorage.bucket().file(filePath);
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json({ success: false, error: 'Document not found in storage.' }, { status: 404 });
    }
    const [metadata] = await file.getMetadata();
    const [contents] = await file.download();
    const fileName = filePath.split('/').pop() || 'document';

    return new NextResponse(new Uint8Array(contents), {
      status: 200,
      headers: {
        'Content-Type': String(metadata?.contentType || 'application/octet-stream'),
        'Content-Disposition': `inline; filename="${fileName.replace(/[^\x20-\x7E]|["\\]/g, '_')}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('Open uploaded document failed:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Could not open document') },
      { status: 500 }
    );
  }
}
