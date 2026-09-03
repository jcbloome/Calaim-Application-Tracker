import { sendAlftManagerWorkflowStageEmail } from '@/app/actions/send-email';
import { ispWorkflowActionUrl } from '@/lib/alft-workflow-status';

export type AlftNotifyPerson = {
  uid?: string;
  email?: string;
  name?: string;
};

export {
  ispWorkflowActionUrl,
  swPortalAlftUrl,
  alftNeedsStaffActionItem,
  alftAdminReviewQueueUrl,
  alftRnReviewActionUrl,
  alftRnReviewQueueUrl,
  alftActionAudience,
} from '@/lib/alft-workflow-status';

const clean = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);

export async function resolveUidByEmail(admin: any, adminDb: any, emailRaw: string): Promise<string> {
  const email = clean(emailRaw, 220).toLowerCase();
  if (!email) return '';
  try {
    const user = await admin.auth().getUserByEmail(email);
    return clean(user?.uid, 128);
  } catch {
    try {
      const snap = await adminDb.collection('users').where('email', '==', email).limit(1).get();
      return clean(snap?.docs?.[0]?.id, 128);
    } catch {
      return '';
    }
  }
}

/** Enabled Staff Management recipients with ALFT ISP Reviewer flag. */
export async function collectAlftReviewerRecipients(adminDb: any): Promise<AlftNotifyPerson[]> {
  try {
    const settingsSnap = await adminDb.collection('system_settings').doc('review_notifications').get();
    const settings = settingsSnap.exists ? settingsSnap.data() : null;
    const globalEnabled = (settings as any)?.enabled === undefined ? true : Boolean((settings as any)?.enabled);
    if (!globalEnabled) return [];

    const recipients = ((settings as any)?.recipients || {}) as Record<string, any>;
    const out: AlftNotifyPerson[] = [];
    const seen = new Set<string>();

    Object.entries(recipients).forEach(([key, raw]) => {
      const r = raw || {};
      if (!Boolean(r?.enabled)) return;
      if (!Boolean(r?.alftReviewer || r?.alft)) return;
      const email = clean(r?.email || (String(key).includes('@') ? key : ''), 220).toLowerCase();
      const uid = clean(r?.uid || (!String(key).includes('@') ? key : ''), 128);
      const dedupe = uid || email;
      if (!dedupe || seen.has(dedupe)) return;
      seen.add(dedupe);
      out.push({
        uid: uid || undefined,
        email: email || undefined,
        name: clean(r?.name || r?.email || 'Staff', 160) || 'Staff',
      });
    });
    return out;
  } catch {
    return [];
  }
}

function mergePeople(people: AlftNotifyPerson[]): AlftNotifyPerson[] {
  const byKey = new Map<string, AlftNotifyPerson>();
  for (const p of people) {
    const email = clean(p.email, 220).toLowerCase();
    const uid = clean(p.uid, 128);
    const key = uid || email;
    if (!key) continue;
    const prev = byKey.get(key) || byKey.get(email) || byKey.get(uid);
    if (prev) {
      byKey.set(key, {
        uid: prev.uid || uid || undefined,
        email: prev.email || email || undefined,
        name: prev.name || p.name || 'Staff',
      });
    } else {
      byKey.set(key, {
        uid: uid || undefined,
        email: email || undefined,
        name: clean(p.name, 160) || 'Staff',
      });
    }
  }
  // Deduplicate by email when both uid-key and email-key exist
  const byEmail = new Map<string, AlftNotifyPerson>();
  for (const p of byKey.values()) {
    const email = clean(p.email, 220).toLowerCase();
    const uid = clean(p.uid, 128);
    const key = email || uid;
    if (!key) continue;
    const prev = byEmail.get(key);
    if (prev) {
      byEmail.set(key, {
        uid: prev.uid || uid || undefined,
        email: prev.email || email || undefined,
        name: prev.name || p.name || 'Staff',
      });
    } else {
      byEmail.set(key, p);
    }
  }
  return Array.from(byEmail.values());
}

/**
 * Notify assigned ALFT staff + (optionally) all Staff Management ALFT ISP Reviewers.
 * John is NOT auto-included — only if selected as assigned staff or flagged as ALFT ISP Reviewer.
 */
export async function notifyAlftWorkflowParties(opts: {
  admin: any;
  adminDb: any;
  intakeId: string;
  memberName: string;
  mrn?: string;
  title: string;
  message: string;
  type: string;
  stageLabel?: string;
  nextAction?: string;
  triggeredBy?: string;
  assignedStaff?: AlftNotifyPerson | null;
  includeAlftReviewers?: boolean;
  sendEmails?: boolean;
  actionUrl?: string;
  createdBy?: string;
  createdByName?: string;
}): Promise<{ emailed: number; notified: number; recipients: AlftNotifyPerson[] }> {
  const {
    admin,
    adminDb,
    intakeId,
    memberName,
    mrn,
    title,
    message,
    type,
    stageLabel,
    nextAction,
    triggeredBy,
    assignedStaff,
    includeAlftReviewers = true,
    sendEmails = true,
    createdBy,
    createdByName,
  } = opts;

  const actionUrl = opts.actionUrl || ispWorkflowActionUrl(intakeId);
  const pool: AlftNotifyPerson[] = [];

  if (assignedStaff?.email || assignedStaff?.uid) {
    pool.push({
      uid: assignedStaff.uid,
      email: clean(assignedStaff.email, 220).toLowerCase() || undefined,
      name: clean(assignedStaff.name, 160) || 'Staff',
    });
  }

  if (includeAlftReviewers) {
    const reviewers = await collectAlftReviewerRecipients(adminDb);
    pool.push(...reviewers);
  }

  const recipients = mergePeople(pool);

  // Resolve missing uids
  await Promise.all(
    recipients.map(async (r) => {
      if (!r.uid && r.email) {
        r.uid = (await resolveUidByEmail(admin, adminDb, r.email)) || undefined;
      }
    })
  );

  let notified = 0;
  await Promise.all(
    recipients.map(async (r) => {
      if (!r.uid) return;
      try {
        await adminDb.collection('staff_notifications').add({
          userId: r.uid,
          recipientName: r.name || 'Staff',
          title,
          message,
          memberName,
          type,
          priority: 'Priority',
          status: 'Open',
          isRead: false,
          source: 'system',
          createdBy: createdBy || null,
          createdByName: createdByName || null,
          senderName: createdByName || 'System',
          senderId: createdBy || null,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          actionUrl,
          intakeId,
          standaloneUploadId: intakeId,
        });
        notified += 1;
      } catch {
        // best-effort
      }
    })
  );

  let emailed = 0;
  if (sendEmails && stageLabel) {
    const results = await Promise.all(
      recipients
        .filter((r) => Boolean(r.email))
        .map((r) =>
          sendAlftManagerWorkflowStageEmail({
            to: String(r.email),
            managerName: r.name || 'Staff',
            memberName,
            mrn: mrn || undefined,
            stageLabel,
            nextAction: nextAction || message,
            actionUrl,
            triggeredBy: triggeredBy || createdByName || undefined,
          })
            .then(() => true)
            .catch(() => false)
        )
    );
    emailed = results.filter(Boolean).length;
  }

  return { emailed, notified, recipients };
}
