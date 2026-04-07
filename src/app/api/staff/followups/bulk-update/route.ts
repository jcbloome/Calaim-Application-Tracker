import { NextRequest, NextResponse } from 'next/server';
import '@/ai/firebase';
import * as admin from 'firebase-admin';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
const escapeQuotes = (value: string) => value.replace(/'/g, "''");

function normalizeDateValue(raw: unknown): string | null {
  const v = clean(raw, 40);
  if (!v) return null;
  // Prefer YYYY-MM-DD (best compatibility with Caspio date fields)
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // If an ISO is passed, reduce to YYYY-MM-DD.
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10);
  return v;
}

async function updateNotesWithSamePayload(args: {
  noteIds: string[];
  payload: Record<string, any>;
  followUpStatusRaw: string;
  followUpDateProvided: boolean;
  followUpDate: string | null;
  accessToken: string;
  baseUrl: string;
  firestore: admin.firestore.Firestore;
}) {
  const { noteIds, payload, followUpStatusRaw, followUpDateProvided, followUpDate, accessToken, baseUrl, firestore } = args;
  const table = 'connect_tbl_clientnotes';
  const chunkSize = 25;
  let updated = 0;

  for (let i = 0; i < noteIds.length; i += chunkSize) {
    const chunk = noteIds.slice(i, i + chunkSize);
    const where = chunk.map((id) => `Note_ID='${escapeQuotes(id)}'`).join(' OR ');
    const url = `${baseUrl}/integrations/rest/v3/tables/${table}/records?q.where=${encodeURIComponent(where)}`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Failed to update Caspio notes (${res.status}): ${txt || res.statusText}`);
    }

    updated += chunk.length;

    const batch = firestore.batch();
    chunk.forEach((id) => {
      const ref = firestore.doc(`client_notes/${id}`);
      batch.set(
        ref,
        {
          ...(followUpStatusRaw ? { followUpStatus: followUpStatusRaw } : {}),
          ...(followUpDateProvided ? { followUpDate: followUpDate || null } : {}),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
    await batch.commit();
  }

  return updated;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const updatesRaw = Array.isArray(body?.updates) ? body.updates : null;

    const credentials = getCaspioCredentialsFromEnv();
    const accessToken = await getCaspioToken(credentials);
    const baseUrl = credentials.baseUrl;

    const firestore = admin.firestore();

    // Mode A: legacy bulk update (same payload for all noteIds)
    if (!updatesRaw) {
      const noteIds = Array.isArray(body?.noteIds) ? body.noteIds.map((x: any) => clean(x, 60)).filter(Boolean) : [];
      const followUpStatusRaw = clean(body?.followUpStatus, 40);
      const followUpDateProvided = body?.followUpDate !== undefined;
      const followUpDate = normalizeDateValue(body?.followUpDate);

      if (noteIds.length === 0) {
        return NextResponse.json({ success: false, error: 'noteIds is required' }, { status: 400 });
      }
      if (!followUpStatusRaw && !followUpDateProvided) {
        return NextResponse.json({ success: false, error: 'No updates provided' }, { status: 400 });
      }

      const payload: Record<string, any> = {};
      if (followUpStatusRaw) payload.Follow_Up_Status = followUpStatusRaw;
      if (followUpDateProvided) payload.Follow_Up_Date = followUpDate; // null clears

      const updated = await updateNotesWithSamePayload({
        noteIds,
        payload,
        followUpStatusRaw,
        followUpDateProvided,
        followUpDate,
        accessToken,
        baseUrl,
        firestore,
      });

      return NextResponse.json({
        success: true,
        updated,
        followUpStatus: followUpStatusRaw || undefined,
        followUpDate,
      });
    }

    // Mode B: per-note updates (staged edits synced on-demand)
    const updates = updatesRaw
      .map((u: any) => ({
        noteId: clean(u?.noteId, 60),
        followUpStatusRaw: clean(u?.followUpStatus, 40),
        followUpDateProvided: u?.followUpDate !== undefined,
        followUpDate: normalizeDateValue(u?.followUpDate),
      }))
      .filter((u: any) => Boolean(u.noteId));

    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: 'updates is required' }, { status: 400 });
    }

    // Group by same payload to keep Caspio requests efficient.
    const groups = new Map<
      string,
      { noteIds: string[]; payload: Record<string, any>; followUpStatusRaw: string; followUpDateProvided: boolean; followUpDate: string | null }
    >();

    for (const u of updates) {
      if (!u.followUpStatusRaw && !u.followUpDateProvided) continue;
      const payload: Record<string, any> = {};
      if (u.followUpStatusRaw) payload.Follow_Up_Status = u.followUpStatusRaw;
      if (u.followUpDateProvided) payload.Follow_Up_Date = u.followUpDate; // null clears
      const key = JSON.stringify(payload);
      const existing = groups.get(key);
      if (existing) {
        existing.noteIds.push(u.noteId);
      } else {
        groups.set(key, {
          noteIds: [u.noteId],
          payload,
          followUpStatusRaw: u.followUpStatusRaw,
          followUpDateProvided: u.followUpDateProvided,
          followUpDate: u.followUpDate,
        });
      }
    }

    if (groups.size === 0) {
      return NextResponse.json({ success: false, error: 'No updates provided' }, { status: 400 });
    }

    let updated = 0;
    for (const g of groups.values()) {
      updated += await updateNotesWithSamePayload({
        noteIds: g.noteIds,
        payload: g.payload,
        followUpStatusRaw: g.followUpStatusRaw,
        followUpDateProvided: g.followUpDateProvided,
        followUpDate: g.followUpDate,
        accessToken,
        baseUrl,
        firestore,
      });
    }

    return NextResponse.json({
      success: true,
      updated,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Bulk update failed' }, { status: 500 });
  }
}

