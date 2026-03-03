import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import path from 'path';
import os from 'os';
import { writeFile, unlink } from 'fs/promises';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireSuperAdmin(params: { idToken: string }) {
  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;

  const decoded = await adminAuth.verifyIdToken(params.idToken);
  const uid = String(decoded?.uid || '').trim();
  const email = String((decoded as any)?.email || '').trim().toLowerCase();

  if (!uid) return { ok: false as const, status: 401, error: 'Invalid token' };

  let isSuperAdmin = Boolean((decoded as any)?.superAdmin);
  if (isHardcodedAdminEmail(email)) isSuperAdmin = true;

  if (!isSuperAdmin) {
    const superAdminDoc = await adminDb.collection('roles_super_admin').doc(uid).get();
    isSuperAdmin = superAdminDoc.exists;
    if (!isSuperAdmin && email) {
      const superAdminByEmailDoc = await adminDb.collection('roles_super_admin').doc(email).get();
      isSuperAdmin = superAdminByEmailDoc.exists;
    }
  }

  if (!isSuperAdmin) return { ok: false as const, status: 403, error: 'Super Admin privileges required' };

  return { ok: true as const };
}

function runPythonParser(params: { pdfPath: string }): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), 'tools', 'era_parser', 'era_parser.py');
    const pythonCmd = process.env.ERA_PARSER_PYTHON || 'python';
    const child = spawn(pythonCmd, [scriptPath, '--input', params.pdfPath, '--format', 'json'], {
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += String(d)));
    child.stderr.on('data', (d) => (stderr += String(d)));
    child.on('close', (code) => resolve({ stdout, stderr, code }));
    child.on('error', () => resolve({ stdout, stderr: stderr || 'Failed to start python process', code: -1 }));
  });
}

export async function POST(req: NextRequest) {
  let tmpPath = '';
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const adminCheck = await requireSuperAdmin({ idToken });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Missing PDF file (field: file)' }, { status: 400 });
    }

    const filename = String(file.name || 'era.pdf');
    const ext = path.extname(filename).toLowerCase();
    if (ext !== '.pdf') {
      return NextResponse.json({ success: false, error: 'Only .pdf files are supported' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    tmpPath = path.join(os.tmpdir(), `era-${randomUUID()}.pdf`);
    await writeFile(tmpPath, bytes);

    const run = await runPythonParser({ pdfPath: tmpPath });
    if (!run.stdout?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error:
            'ERA parser returned empty output. Ensure Python and dependencies are installed (tools/era_parser/requirements.txt).',
          details: run.stderr || null,
        },
        { status: 500 }
      );
    }

    let payload: any = null;
    try {
      payload = JSON.parse(run.stdout);
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: 'Failed to parse ERA parser JSON output', details: run.stderr || run.stdout.slice(0, 2000) },
        { status: 500 }
      );
    }

    if (!payload?.success) {
      return NextResponse.json({ success: false, error: payload?.error || 'ERA parser failed', details: run.stderr || null }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        payer: payload?.payer || 'Health Net',
        summary: payload?.summary || null,
        rows: Array.isArray(payload?.rows) ? payload.rows : [],
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Unexpected error' }, { status: 500 });
  } finally {
    if (tmpPath) {
      try {
        await unlink(tmpPath);
      } catch {
        // ignore
      }
    }
  }
}

