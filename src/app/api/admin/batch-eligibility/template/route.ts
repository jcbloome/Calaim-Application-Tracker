import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import {
  BATCH_ELIGIBILITY_TEMPLATES_COLLECTION,
  type BatchEligibilityPlan,
  type BatchEligibilityTemplate,
  type ColumnInfo,
  type ColumnSource,
} from '@/lib/batch-eligibility';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLANS: BatchEligibilityPlan[] = ['healthnet', 'kaiser'];
const s = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max);

function sanitizeMapping(raw: unknown, columns: string[]): Record<string, ColumnSource> {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
  const out: Record<string, ColumnSource> = {};
  for (const column of columns) {
    const src = input[column];
    if (src?.kind === 'member' && s(src.field)) out[column] = { kind: 'member', field: s(src.field) as any };
    else if (src?.kind === 'constant') out[column] = { kind: 'constant', value: s(src.value) };
    else if (src?.kind === 'today') out[column] = { kind: 'today' };
    else out[column] = { kind: 'blank' };
  }
  return out;
}

/** Saved Claim.MD batch eligibility format (columns + mapping) for a plan. */
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdminApiAuth(req);
  if (!adminCheck.ok) {
    return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
  }
  const plan = s(req.nextUrl.searchParams.get('plan')).toLowerCase() as BatchEligibilityPlan;
  if (!PLANS.includes(plan)) return NextResponse.json({ success: false, error: 'Unknown plan' }, { status: 400 });
  const snap = await adminCheck.adminDb.collection(BATCH_ELIGIBILITY_TEMPLATES_COLLECTION).doc(plan).get();
  return NextResponse.json({ success: true, template: snap.exists ? snap.data() : null });
}

/** Save the uploaded format and/or column mapping. Body: BatchEligibilityTemplate fields. */
export async function POST(req: NextRequest) {
  const adminCheck = await requireAdminApiAuth(req);
  if (!adminCheck.ok) {
    return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const plan = s(body?.plan).toLowerCase() as BatchEligibilityPlan;
    if (!PLANS.includes(plan)) return NextResponse.json({ success: false, error: 'Unknown plan' }, { status: 400 });
    const columns = Array.isArray(body?.columns) ? body.columns.map((c: unknown) => s(c, 120)).filter(Boolean) : [];
    if (!columns.length || columns.length > 200) {
      return NextResponse.json({ success: false, error: 'Template needs a header row of column names' }, { status: 400 });
    }
    const exampleRow = Array.isArray(body?.exampleRow) ? body.exampleRow.map((c: unknown) => s(c, 200)) : [];
    const dateFormat = ['MM/DD/YYYY', 'YYYYMMDD', 'YYYY-MM-DD'].includes(body?.dateFormat) ? body.dateFormat : 'MM/DD/YYYY';
    const nowIso = new Date().toISOString();
    const rawInfo = body?.columnInfo && typeof body.columnInfo === 'object' ? body.columnInfo : null;
    const columnInfo: Record<string, ColumnInfo> = {};
    if (rawInfo) {
      for (const column of columns) {
        const info = rawInfo[column];
        if (!info) continue;
        columnInfo[column] = {
          description: s(info.description, 300),
          required: info.required === true,
          dataType: s(info.dataType, 100),
          allowedValues: s(info.allowedValues, 1000),
        };
      }
    }
    const template: BatchEligibilityTemplate = {
      plan,
      fileName: s(body?.fileName, 200) || 'template.csv',
      columns,
      exampleRow: columns.map((_: string, i: number) => exampleRow[i] ?? ''),
      ...(Object.keys(columnInfo).length ? { columnInfo } : {}),
      mapping: sanitizeMapping(body?.mapping, columns),
      dateFormat,
      uploadedAtIso: s(body?.uploadedAtIso) || nowIso,
      uploadedByEmail: s(body?.uploadedByEmail) || adminCheck.email || '',
      updatedAtIso: nowIso,
    };
    await adminCheck.adminDb.collection(BATCH_ELIGIBILITY_TEMPLATES_COLLECTION).doc(plan).set(template);
    return NextResponse.json({ success: true, template });
  } catch (error: any) {
    console.error('[batch-eligibility/template] POST failed', error);
    return NextResponse.json({ success: false, error: error?.message || 'Save failed' }, { status: 500 });
  }
}
