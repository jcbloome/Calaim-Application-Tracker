import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuthFromIdToken } from '@/lib/admin-api-auth';

type EraseBody = {
  idToken?: string;
};

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as EraseBody;
    const idToken = String(body?.idToken || '').trim();
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    }

    const authz = await requireAdminApiAuthFromIdToken(idToken, { requireSuperAdmin: true, requireTwoFactor: true });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const { adminDb, uid, email } = authz;

    // Clear Firestore-backed note records used by Interoffice Recent Notes.
    // Keep chat-only records intact.
    const allSnap = await adminDb.collection('staff_notifications').get();
    const allIds: string[] = [];
    allSnap.forEach((docSnap: any) => {
      const data = docSnap.data() || {};
      const type = String(data?.type || '').trim().toLowerCase();
      const source = String(data?.source || '').trim().toLowerCase();
      const isChatOnly = Boolean(data?.isChatOnly) || type.includes('chat');
      if (isChatOnly) return;
      const isInteroffice =
        Boolean(data?.isGeneral) ||
        type.includes('interoffice') ||
        type.includes('note');
      const isCaspioNote = source === 'caspio' || type.includes('note_assignment');
      if (!isInteroffice && !isCaspioNote) return;
      allIds.push(String(docSnap.id));
    });

    let deleted = 0;
    const chunks = chunkArray(allIds, 400);
    for (const ids of chunks) {
      const batch = adminDb.batch();
      ids.forEach((id) => {
        batch.delete(adminDb.collection('staff_notifications').doc(id));
      });
      await batch.commit();
      deleted += ids.length;
    }

    await adminDb.collection('systemNotes').add({
      title: 'Interoffice recent notes erased',
      message: `Global erase removed ${deleted} Firestore note records used by Interoffice Recent Notes.`,
      category: 'admin_action',
      createdBy: uid,
      createdByName: email || uid,
      timestamp: new Date().toISOString(),
      source: 'admin.interoffice-notes.erase',
      metadata: {
        deletedCount: deleted,
      },
    });

    return NextResponse.json({
      success: true,
      deleted,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to erase Firestore recent notes' },
      { status: 500 }
    );
  }
}

