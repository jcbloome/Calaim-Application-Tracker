import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { fetchAllCalAIMMembers, getCaspioCredentialsFromEnv } from '@/lib/caspio-api-utils';
import {
  ALW_WAITLIST_CCA_NAME,
  buildAlwWaitlistFileName,
  buildAlwWaitlistWorkbookBuffer,
  collectAuthorizedHealthNetAlwRows,
  partitionAlwWaitlistRows,
  type AlwWaitlistExclusionEntry,
  type AlwWaitlistMemberRow,
} from '@/lib/alw-waitlist';
import { alwWaitlistFormFileName, buildAlwWaitlistFormPdfBytes } from '@/lib/alw-waitlist-form-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function sanitizeEntries(raw: unknown): AlwWaitlistExclusionEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = (item || {}) as Record<string, unknown>;
      return {
        mediCalNumber: String(row.mediCalNumber || '').trim(),
        clientId2: String(row.clientId2 || '').trim(),
        memberName: String(row.memberName || '').trim(),
        dateOfBirth: String(row.dateOfBirth || '').trim(),
        sourceLabel: String(row.sourceLabel || '').trim() || undefined,
      };
    })
    .filter((entry) => entry.mediCalNumber || entry.clientId2 || entry.memberName);
}

export async function POST(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    let rows: AlwWaitlistMemberRow[] = Array.isArray(body.rows)
      ? (body.rows as AlwWaitlistMemberRow[]).filter((row) => String(row?.memberName || '').trim())
      : [];

    if (rows.length === 0) {
      const credentials = getCaspioCredentialsFromEnv();
      const result = await fetchAllCalAIMMembers(credentials, {
        includeRawData: true,
        forceRefresh: true,
      });
      const rawMembers = Array.isArray(result.rawMembers) ? result.rawMembers : result.members || [];
      const allRows = collectAuthorizedHealthNetAlwRows(rawMembers as Array<Record<string, unknown>>);

      let exclusions = sanitizeEntries(body.exclusionEntries);
      if (exclusions.length === 0) {
        const { adminDb } = await import('@/firebase-admin');
        const snap = await adminDb.doc('admin-settings/alw-waitlist-exclusions').get();
        const data = (snap.exists ? snap.data() : {}) as Record<string, unknown>;
        exclusions = sanitizeEntries(data.entries);
      }
      rows = partitionAlwWaitlistRows(allRows, exclusions).included;
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No members left to include after exclusions.' },
        { status: 400 }
      );
    }

    const zip = new JSZip();
    const formsFolder = zip.folder('Filled ALW Waitlist Forms');
    const usedNames = new Set<string>();
    for (const row of rows) {
      const bytes = await buildAlwWaitlistFormPdfBytes(row);
      let fileName = alwWaitlistFormFileName(row);
      if (usedNames.has(fileName.toLowerCase())) {
        const stamp = String(usedNames.size + 1).padStart(3, '0');
        fileName = fileName.replace(/\.pdf$/i, `_${stamp}.pdf`);
      }
      usedNames.add(fileName.toLowerCase());
      formsFolder?.file(fileName, bytes);
    }

    const summaryFileName = buildAlwWaitlistFileName();
    zip.file(summaryFileName, buildAlwWaitlistWorkbookBuffer(rows));

    const generatedAt = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
    const readme = [
      'Assisted Living Waiver Waitlist Request — Health Net package',
      '',
      `Care Coordination Agency (CCA): ${ALW_WAITLIST_CCA_NAME}`,
      `Generated: ${generatedAt}`,
      `Member forms in this package: ${rows.length}`,
      '',
      'Contents',
      `- ${summaryFileName}  (Excel summary of all members)`,
      '- Filled ALW Waitlist Forms/  (one PDF per member)',
      '',
      'Sharing',
      'Upload this ZIP to a Google Drive folder and share the folder with Sierra CCA.',
      'You can also unzip first and share the folder of PDFs directly.',
      '',
      'Notes',
      '- Forms use the generated ALW waitlist layout.',
      '- Address / residence fields are filled from RCFE_Name, RCFE_Address, RCFE_City, RCFE_State, RCFE_Zip when available.',
      '- Legal authority: Authorized_Party_* when present (Other). If none, Applicant is checked and Best_Contact_* is written on the Other line labeled "Best contact" for Sierra outreach (RCFE / member / best contact).',
      '- Members already on the ALW waitlist (uploaded YES list or Caspio On_ALW_Waitlist=Yes) are not included.',
      '- Program/service checkboxes are left blank for CCA completion.',
    ].join('\n');
    zip.file('README - share via Google Drive.txt', readme);

    const zipBytes = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    const y = new Date().getFullYear();
    const m = String(new Date().getMonth() + 1).padStart(2, '0');
    const d = String(new Date().getDate()).padStart(2, '0');
    const zipName = `ALW Waitlist for Sierra CCA - Health Net - ${y}${m}${d} - ${rows.length} members.zip`;

    return new NextResponse(new Uint8Array(zipBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipName}"`,
        'Cache-Control': 'no-store',
        'X-ALW-Form-Count': String(rows.length),
      },
    });
  } catch (error: any) {
    console.error('[alw-waitlist/forms-zip]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to build ALW waitlist forms ZIP.') },
      { status: 500 }
    );
  }
}
