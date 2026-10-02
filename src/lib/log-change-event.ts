'use client';

import { addDoc, collection, type DocumentData, type Firestore } from 'firebase/firestore';
import { adminFetch } from '@/lib/admin-fetch';
import type { WriteGlobalChangeLogInput } from '@/lib/global-change-log';
import { ILS_MIF_AUDIT_COLLECTION } from '@/lib/ils-mif-parse';

const clean = (value: unknown) => String(value ?? '').trim();

export type ClientChangeEventInput = Omit<WriteGlobalChangeLogInput, 'staffName' | 'staffEmail'>;

/**
 * Record a change in the Global Change Log from the browser. Fire-and-forget:
 * failures are logged to the console and never interrupt the caller.
 */
export function logChangeEvent(input: ClientChangeEventInput): void {
  void adminFetch('/api/admin/global-change-log', { method: 'POST', json: input }).catch((error) => {
    console.warn('[global-change-log] client write failed:', error);
  });
}

/** Writes an ILS/MIF audit row and mirrors it into the Global Change Log. */
export async function addIlsMifAuditDoc(firestore: Firestore, data: DocumentData) {
  const ref = await addDoc(collection(firestore, ILS_MIF_AUDIT_COLLECTION), data);
  const action = clean(data.action) || 'mif_audit';
  const first = clean(data.memberFirstName);
  const last = clean(data.memberLastName);
  logChangeEvent({
    category: 'mif_consolidator',
    action,
    summary: clean(data.summary) || action.replace(/_/g, ' '),
    memberName: last && first ? `${last}, ${first}` : clean(data.memberName) || undefined,
    memberMrn: clean(data.memberMrn) || undefined,
    clientId2: clean(data.clientId2) || clean(data.caspioMatchedClientId2) || undefined,
    applicationId: clean(data.applicationId) || undefined,
    source: 'ils_mif_audit_log',
    sourceRef: `${ILS_MIF_AUDIT_COLLECTION}/${ref.id}`,
    href: '/admin/tools/ils-mif-consolidator',
    atIso: clean(data.atIso) || undefined,
    details: {
      runId: data.runId ?? data.consolidatorRunId ?? undefined,
      previousKaiserStatus: data.previousKaiserStatus ?? undefined,
      kaiserStatus: data.kaiserStatus ?? undefined,
      authorizationNumberT2038: data.authorizationNumberT2038 ?? undefined,
    },
  });
  return ref;
}
