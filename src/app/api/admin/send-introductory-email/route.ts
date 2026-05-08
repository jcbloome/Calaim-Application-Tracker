import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import admin from 'firebase-admin';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import introEmailSenderUtils from '@/lib/intro-email-sender';

const APP_BASE_URL = 'https://connectcalaim.com';
const EMAIL_TEMPLATE = 'introductory_application_invite';
const EMAIL_SOURCE = '/api/admin/send-introductory-email';
const DEFAULT_FROM_EMAIL = 'noreply@carehomefinders.com';
const VERIFIED_SENDER_DOMAIN = String(process.env.RESEND_VERIFIED_SENDER_DOMAIN || 'carehomefinders.com')
  .trim()
  .toLowerCase();

const {
  normalizeEmail,
  isValidEmail,
  resolvePreferredSenderIdentity,
  buildIntroEmailSender,
} = introEmailSenderUtils as any;

type IntroEmailMode = 'preview' | 'send';

function parseEmailList(value: unknown): string[] {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const deduped = new Map<string, string>();
  raw
    .split(/[;,]/)
    .map((part) => normalizeEmail(part))
    .filter((email) => isValidEmail(email))
    .forEach((email) => {
      const key = email.toLowerCase();
      if (!deduped.has(key)) deduped.set(key, email);
    });
  return Array.from(deduped.values());
}

function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toSafeHttpUrl(raw: string): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function renderTextWithLinks(text: string): string {
  const raw = String(text || '');
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  let output = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(raw)) !== null) {
    const fullMatch = String(match[0] || '');
    const start = match.index;
    const end = start + fullMatch.length;
    output += htmlEscape(raw.slice(lastIndex, start));

    const safeUrl = toSafeHttpUrl(fullMatch);
    if (safeUrl) {
      output += `<a href="${htmlEscape(safeUrl)}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline;">${htmlEscape(fullMatch)}</a>`;
    } else {
      output += htmlEscape(fullMatch);
    }
    lastIndex = end;
  }

  output += htmlEscape(raw.slice(lastIndex));
  return output;
}

function renderPortalLinkAction(label: string, buttonLabel: string, url: string): string {
  const safeUrl = toSafeHttpUrl(url);
  if (!safeUrl) return `<li>${renderTextWithLinks(`${label}: ${url}`)}</li>`;
  return `<li style="margin: 8px 0;">
      <span style="display: inline-block; min-width: 170px; color: #334155;">${htmlEscape(label)}:</span>
      <a href="${htmlEscape(safeUrl)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 8px 12px; border-radius: 8px; font-weight: 600;">
        ${htmlEscape(buttonLabel)}
      </a>
    </li>`;
}

function toHtmlBody(message: string): string {
  const lines = String(message || '').split('\n');
  const chunks: string[] = [];
  let bulletBuffer: string[] = [];

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    const renderedItems = bulletBuffer
      .map((item) => {
        const loginMatch = item.match(/^Open your secure portal login:\s*(https?:\/\/\S+)/i);
        if (loginMatch) return renderPortalLinkAction('Portal Login', 'Open Portal', loginMatch[1]);

        return `<li>${renderTextWithLinks(item)}</li>`;
      })
      .join('');
    chunks.push(`<ul style="margin: 6px 0 14px 18px; padding: 0; color: #0f172a;">${renderedItems}</ul>`);
    bulletBuffer = [];
  };

  for (const lineRaw of lines) {
    const line = String(lineRaw || '').trim();
    if (!line) {
      flushBullets();
      chunks.push('<div style="height: 8px;"></div>');
      continue;
    }

    if (line.startsWith('- ')) {
      bulletBuffer.push(line.slice(2).trim());
      continue;
    }

    flushBullets();
    const isHeading =
      line.endsWith(':') &&
      (line.toLowerCase().includes('required documents') ||
        line.toLowerCase().includes('please continue') ||
        line.toLowerCase().includes('you may be asked to verify'));

    if (isHeading) {
      chunks.push(`<p style="margin: 0 0 8px; font-weight: 700;">${renderTextWithLinks(line)}</p>`);
    } else {
      chunks.push(`<p style="margin: 0 0 8px;">${renderTextWithLinks(line)}</p>`);
    }
  }

  flushBullets();

  return `<div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.6; max-width: 640px;">
    ${chunks.join('')}
  </div>`;
}

function getAppBaseUrl(): string {
  return APP_BASE_URL;
}

async function resolveAssignedCaseManagerSender(args: {
  adminDb: any;
  appData: Record<string, unknown>;
  fallbackName: string;
  fallbackEmail: string;
}): Promise<{ senderName: string; senderEmail: string; senderSource: string }> {
  const { adminDb, appData, fallbackName, fallbackEmail } = args;
  const assignedStaffId = String(appData.assignedStaffId || '').trim();
  const assignedStaffName = String(appData.assignedStaffName || '').trim();
  const assignedStaffEmailFromApp = normalizeEmail(appData.assignedStaffEmail);

  const fallback = resolvePreferredSenderIdentity({
    assignedProfileName: assignedStaffName,
    assignedProfileEmail: '',
    assignedAppName: assignedStaffName,
    assignedAppEmail: assignedStaffEmailFromApp,
    fallbackName,
    fallbackEmail,
  });

  if (!assignedStaffId) return fallback;

  try {
    const staffSnap = await adminDb.collection('users').doc(assignedStaffId).get();
    if (!staffSnap.exists) return fallback;
    const staffData = (staffSnap.data() || {}) as Record<string, unknown>;
    const profileEmail = normalizeEmail(staffData.email);
    const profileName = String(
      staffData.displayName ||
        `${String(staffData.firstName || '').trim()} ${String(staffData.lastName || '').trim()}`
    )
      .trim()
      .replace(/\s+/g, ' ');

    return resolvePreferredSenderIdentity({
      assignedProfileName: profileName,
      assignedProfileEmail: profileEmail,
      assignedAppName: assignedStaffName,
      assignedAppEmail: assignedStaffEmailFromApp,
      fallbackName,
      fallbackEmail,
    });
  } catch {
    return fallback;
  }
}

function getMissingRequestedDocuments(appData: Record<string, unknown>): string[] {
  const forms = Array.isArray(appData?.forms) ? (appData.forms as Array<Record<string, unknown>>) : [];
  const healthPlan = String(appData?.healthPlan || '').trim().toLowerCase();
  const pathway = String(appData?.pathway || '').trim().toLowerCase();
  const internalExclusions = new Set([
    'eligibility screenshot',
    'eligibility check',
    'room and board/tier level agreement',
    'room and board/tier level commitment',
    'room and board commitment',
  ]);
  const canonicalName = (name: unknown): string => {
    const raw = String(name || '').trim();
    if (!raw) return '';
    const lowered = raw.toLowerCase();
    if (lowered === 'waivers') return 'Waivers & Authorizations';
    if (
      lowered === 'room and board commitment' ||
      lowered === 'room and board/tier level commitment'
    ) {
      return 'Room and Board/Tier Level Agreement';
    }
    return raw;
  };

  const statusByCanonicalName = new Map<string, string>();
  forms.forEach((form) => {
    const name = canonicalName(form?.name);
    if (!name) return;
    const status = String(form?.status || '').trim().toLowerCase();
    const prev = String(statusByCanonicalName.get(name) || '').trim().toLowerCase();
    if (prev === 'completed') return;
    statusByCanonicalName.set(name, status);
  });

  const expectedByPathway: string[] = [
    'Waivers & Authorizations',
    "LIC 602A - Physician's Report",
    'Medicine List',
    ...(healthPlan.includes('health net') ? [] : ['Proof of Income']),
    ...(pathway === 'snf transition' ? ['SNF Facesheet'] : []),
    ...(pathway === 'snf diversion' && healthPlan.includes('health net')
      ? ['Declaration of Eligibility']
      : []),
  ];
  const expectedPending = expectedByPathway.filter((name) => {
    const status = String(statusByCanonicalName.get(name) || '').trim().toLowerCase();
    return status !== 'completed';
  });

  const pendingFromForms = forms
    .filter((form) => {
      const name = canonicalName(form?.name);
      if (!name) return false;
      const normalizedName = name.toLowerCase();
      if (normalizedName === 'cs member summary' || normalizedName === 'cs summary') return false;
      if (internalExclusions.has(normalizedName)) return false;
      if (String(form?.type || '').trim().toLowerCase() === 'info') return false;
      const status = String(form?.status || '').trim().toLowerCase();
      return status !== 'completed';
    })
    .map((form) => canonicalName(form?.name))
    .filter(Boolean);

  return Array.from(new Set([...expectedPending, ...pendingFromForms]));
}

const REQUIREMENT_TITLE_TO_ID: Record<string, string> = {
  'cs member summary': 'cs-summary',
  'cs summary': 'cs-summary',
  'waivers & authorizations': 'waivers',
  'proof of income': 'proof-of-income',
  "lic 602a - physician's report": 'lic-602a',
  'medicine list': 'medicine-list',
  'declaration of eligibility': 'declaration-of-eligibility',
  'snf facesheet': 'snf-facesheet',
};

function getFocusRequirementId(missingDocuments: string[]): string {
  for (const item of missingDocuments) {
    const key = String(item || '').trim().toLowerCase();
    if (REQUIREMENT_TITLE_TO_ID[key]) return REQUIREMENT_TITLE_TO_ID[key];
  }
  return '';
}

function getFirstNameOnly(name: string): string {
  const cleaned = String(name || '').trim();
  if (!cleaned) return '';
  return cleaned.split(/\s+/)[0] || '';
}

function buildPortalLinks(params: {
  applicationId: string;
  focusRequirementId: string;
  baseUrl: string;
}) {
  const { applicationId, focusRequirementId, baseUrl } = params;
  const pathwayReturnPath = `/pathway?applicationId=${encodeURIComponent(applicationId)}${
    focusRequirementId ? `&focus=${encodeURIComponent(focusRequirementId)}&mode=upload-missing` : ''
  }`;
  const loginUrl = `${baseUrl}/login?redirect=${encodeURIComponent(pathwayReturnPath)}&forceLogin=1`;
  const signupUrl = `${baseUrl}/signup`;
  const inviteUrl = `${baseUrl}/invite/continue?applicationId=${encodeURIComponent(applicationId)}`;
  return { loginUrl, signupUrl, inviteUrl };
}

function buildDefaultDraft(params: {
  applicationId: string;
  memberName: string;
  contactName: string;
  memberMrn: string;
  hasKaiserAuthorizationAtIntake: boolean;
  hasPriorIntroEmail: boolean;
  focusRequirementId: string;
  baseUrl: string;
  missingDocuments: string[];
  senderName: string;
  senderEmail: string;
}): { subject: string; message: string } {
  const {
    applicationId,
    memberName,
    contactName,
    memberMrn,
    hasKaiserAuthorizationAtIntake,
    hasPriorIntroEmail,
    focusRequirementId,
    baseUrl,
    missingDocuments,
    senderName,
    senderEmail,
  } = params;
  const greetingFirstName = getFirstNameOnly(contactName) || 'there';
  const { loginUrl } = buildPortalLinks({ applicationId, focusRequirementId, baseUrl });
  const kaiserAuthorizationLine = hasKaiserAuthorizationAtIntake
    ? hasPriorIntroEmail
      ? `This is a reminder to sign in and continue the existing Kaiser-authorized CalAIM Assisted Living Transitions application for ${memberName}${memberMrn ? ` (MRN: ${memberMrn})` : ''}.`
      : `We have received Kaiser authorization for ${memberName} for the California Advancing and Innovating Medi-Cal (CalAIM) program for Assisted Living Transitions${memberMrn ? ` (MRN: ${memberMrn})` : ''}. We need the required documents below to move forward.`
    : hasPriorIntroEmail
      ? `This is a reminder to continue the CalAIM application for ${memberName}.`
      : `We started a CalAIM application for ${memberName} and we are ready for next steps.`;
  const missingDocumentsSection = missingDocuments.length
    ? [
        '',
        'Required documents to upload:',
        ...missingDocuments.map((item) => `- ${item}`),
      ]
    : [
        '',
        'Required documents to upload:',
        '- Please upload each document marked Pending in your portal checklist.',
      ];
  const supportLine = `For any questions, please contact ${senderName || 'our team'}${senderEmail ? ` at ${senderEmail}` : ''} or call 800-330-5993.`;

  return {
    subject: hasPriorIntroEmail
      ? `Reminder: ${memberName} CalAIM Assisted Living Transitions - Portal Action Needed`
      : `To ${contactName || 'Primary Contact'}, Re: ${memberName} CalAIM Assisted Living Transitions Program - Next Steps`,
    message: [
      `Hello ${greetingFirstName},`,
      '',
      kaiserAuthorizationLine,
      '',
      'Please continue in the Connect CalAIM portal:',
      `- Open your secure portal login: ${loginUrl}`,
      '',
      'Please use this same email address for your account so we can match it correctly.',
      ...missingDocumentsSection,
      '',
      'After signing in, open My Applications and select the member application.',
      '',
      'You may be asked to verify:',
      '- Application ID',
      '- Member last name',
      '- Member date of birth',
      '',
      supportLine,
      '',
      'Thank you,',
      'Connections Care Home Consultants',
    ].join('\n'),
  };
}

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdminApiAuth(request, { requireSuperAdmin: false, requireTwoFactor: true });
  if (!adminCheck.ok) {
    return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const mode = String(body.mode || 'preview').trim().toLowerCase() as IntroEmailMode;
    if (mode !== 'preview' && mode !== 'send') {
      return NextResponse.json({ success: false, error: 'Invalid mode. Use preview or send.' }, { status: 400 });
    }

    const applicationId = String(body.applicationId || '').trim();
    if (!applicationId) {
      return NextResponse.json({ success: false, error: 'Application ID is required.' }, { status: 400 });
    }

    let appRef = adminCheck.adminDb.collection('applications').doc(applicationId);
    let appSnap = await appRef.get();
    let resolvedUserId = String(body.userId || '').trim();

    // Backward-compat: some applications only exist under users/{uid}/applications/{id}.
    if (!appSnap.exists && resolvedUserId) {
      const userScopedRef = adminCheck.adminDb
        .collection('users')
        .doc(resolvedUserId)
        .collection('applications')
        .doc(applicationId);
      const userScopedSnap = await userScopedRef.get();
      if (userScopedSnap.exists) {
        appRef = userScopedRef;
        appSnap = userScopedSnap;
      }
    }

    // Last-resort lookup when userId is missing from query params.
    if (!appSnap.exists) {
      const cgSnap = await adminCheck.adminDb
        .collectionGroup('applications')
        .where(admin.firestore.FieldPath.documentId(), '==', applicationId)
        .limit(1)
        .get();
      if (!cgSnap.empty) {
        const first = cgSnap.docs[0];
        appRef = first.ref;
        appSnap = first;
        resolvedUserId = String(first.ref.parent?.parent?.id || '').trim();
      }
    }

    if (!appSnap.exists) {
      return NextResponse.json({ success: false, error: 'Application not found.' }, { status: 404 });
    }

    const appData = (appSnap.data() || {}) as Record<string, unknown>;
    const requestedUserId = String(body.userId || appData.userId || resolvedUserId || '').trim();
    let effectiveAppData: Record<string, unknown> = { ...appData };
    if (requestedUserId && applicationId) {
      try {
        const userAppSnap = await adminCheck.adminDb
          .collection('users')
          .doc(requestedUserId)
          .collection('applications')
          .doc(applicationId)
          .get();
        if (userAppSnap.exists) {
          const userAppData = (userAppSnap.data() || {}) as Record<string, unknown>;
          const mergedForms =
            Array.isArray(appData.forms) && appData.forms.length > 0
              ? appData.forms
              : Array.isArray(userAppData.forms)
                ? userAppData.forms
                : appData.forms;
          effectiveAppData = {
            ...userAppData,
            ...appData,
            forms: mergedForms,
          };
        }
      } catch {
        // Best effort: keep admin app data if user copy lookup fails.
      }
    }
    const assignedStaffId = String(effectiveAppData.assignedStaffId || '').trim();
    const memberName =
      String(`${effectiveAppData.memberFirstName || ''} ${effectiveAppData.memberLastName || ''}`)
        .replace(/\s+/g, ' ')
        .trim() || 'CalAIM Member';
    const contactName = String(
      `${effectiveAppData.bestContactFirstName || ''} ${effectiveAppData.bestContactLastName || ''}`
    ).trim();
    const memberMrn = String(effectiveAppData.memberMrn || '').trim();
    const kaiserAuthorizationMode = String(effectiveAppData.kaiserAuthorizationMode || '').trim().toLowerCase();
    const intakeType = String(effectiveAppData.intakeType || '').trim().toLowerCase();
    const hasKaiserAuthorizationAtIntake =
      kaiserAuthorizationMode === 'authorization_received' ||
      Boolean(effectiveAppData.kaiserAuthReceivedViaIls) ||
      intakeType === 'kaiser_auth_received_via_ils';
    const toEmailDefault = normalizeEmail(effectiveAppData.bestContactEmail);
    const primaryContactEmail = normalizeEmail(effectiveAppData.bestContactEmail);
    const fallbackSenderName = String(adminCheck.name || adminCheck.email || 'Staff').trim();
    const fallbackSenderEmail = normalizeEmail(adminCheck.email);
    const senderResolved = await resolveAssignedCaseManagerSender({
      adminDb: adminCheck.adminDb,
      appData: effectiveAppData,
      fallbackName: fallbackSenderName,
      fallbackEmail: fallbackSenderEmail,
    });
    const senderName = senderResolved.senderName;
    const senderEmail = senderResolved.senderEmail;
    const senderTransport = buildIntroEmailSender({
      senderName,
      senderEmail,
      fallbackName: fallbackSenderName || 'CalAIM Pathfinder',
      fallbackEmail: fallbackSenderEmail || DEFAULT_FROM_EMAIL,
      verifiedSenderDomain: VERIFIED_SENDER_DOMAIN,
      defaultFromEmail: DEFAULT_FROM_EMAIL,
    });
    const fromEmail = String(senderTransport.fromEmail || '').trim();
    const replyToEmail = String(senderTransport.replyTo || '').trim();
    const baseUrl = getAppBaseUrl();
    const missingDocuments = getMissingRequestedDocuments(effectiveAppData);
    const focusRequirementId = getFocusRequirementId(missingDocuments);
    const introSendHistory = Array.isArray(effectiveAppData.introEmailSendHistory)
      ? (effectiveAppData.introEmailSendHistory as Array<Record<string, unknown>>)
      : [];
    const latestSendHistoryEntry = introSendHistory
      .map((entry) => {
        const iso = String(entry?.sentAtIso || '').trim();
        const ms = iso ? new Date(iso).getTime() : 0;
        return { entry, iso, ms };
      })
      .filter((item) => Boolean(item.iso) && Number.isFinite(item.ms) && item.ms > 0)
      .sort((a, b) => b.ms - a.ms)[0];
    const lastSentAtIso = String(latestSendHistoryEntry?.iso || '').trim();
    const lastSentTo = String(
      effectiveAppData.introEmailLastSentTo || latestSendHistoryEntry?.entry?.to || ''
    ).trim();
    const hasPriorIntroEmail = Boolean(
      effectiveAppData.introEmailLastSentAt ||
        (Array.isArray(effectiveAppData.introEmailSendHistory) &&
          (effectiveAppData.introEmailSendHistory as unknown[]).length > 0)
    );
    const defaults = buildDefaultDraft({
      applicationId,
      memberName,
      contactName,
      memberMrn,
      hasKaiserAuthorizationAtIntake,
      hasPriorIntroEmail,
      focusRequirementId,
      baseUrl,
      missingDocuments,
      senderName,
      senderEmail,
    });

    const to = String(body.to || toEmailDefault).trim();
    const subject = String(body.subject || defaults.subject).trim();
    const message = String(body.message || defaults.message).trim();
    const toRecipients = parseEmailList(to);
    const requestedCc = parseEmailList(body.cc);
    const senderShouldBeCc =
      isValidEmail(senderEmail) &&
      !toRecipients.some((email) => email.toLowerCase() === senderEmail.toLowerCase());
    const ccBase = requestedCc.length > 0 ? requestedCc : senderShouldBeCc ? [senderEmail] : [];
    const ccDedup = new Map<string, string>();
    ccBase.forEach((email) => {
      if (!toRecipients.some((toEmail) => toEmail.toLowerCase() === email.toLowerCase())) {
        ccDedup.set(email.toLowerCase(), email);
      }
    });
    const ccRecipients = Array.from(ccDedup.values());
    const sentToPrimaryContact =
      Boolean(primaryContactEmail) &&
      toRecipients.some((email) => email.toLowerCase() === primaryContactEmail.toLowerCase());

    if (mode === 'preview') {
      return NextResponse.json({
        success: true,
        draft: { to: toRecipients.join(', '), cc: ccRecipients.join(', '), subject, message },
        missingDocuments,
        portalLinks: buildPortalLinks({ applicationId, focusRequirementId, baseUrl }),
        acknowledgement: {
          lastSentAtIso: lastSentAtIso || null,
          lastSentTo: lastSentTo || null,
        },
        sender: {
          name: senderName || null,
          email: senderEmail || null,
          from: fromEmail,
          source: senderResolved.senderSource || null,
          usesFallbackFrom: Boolean(senderTransport.usesFallbackFrom),
          canSendAsResolvedSender: Boolean(senderTransport.canSendAsResolvedSender),
          warning: String(senderTransport.warning || ''),
          verifiedSenderDomain: VERIFIED_SENDER_DOMAIN || null,
        },
      });
    }

    if (!assignedStaffId) {
      return NextResponse.json(
        { success: false, error: 'Assigned case manager is required before sending an introductory invite.' },
        { status: 400 }
      );
    }

    if (toRecipients.length === 0 || !subject || !message) {
      return NextResponse.json(
        { success: false, error: 'Recipient, subject, and message are required to send.' },
        { status: 400 }
      );
    }

    const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();
    if (!resendApiKey) {
      return NextResponse.json({ success: false, error: 'RESEND_API_KEY is not configured.' }, { status: 500 });
    }

    const resend = new Resend(resendApiKey);
    const html = toHtmlBody(message);
    const text = message;

    let providerMessageId = '';
    try {
      const sentAtIso = new Date().toISOString();
      const result = await resend.emails.send({
        from: fromEmail,
        to: toRecipients,
        ...(ccRecipients.length > 0 ? { cc: ccRecipients } : {}),
        ...(isValidEmail(replyToEmail) ? { replyTo: replyToEmail } : {}),
        subject,
        html,
        text,
      });

      const sendError = (result as any)?.error;
      if (sendError) {
        throw new Error(String(sendError?.message || 'Resend email send failed.'));
      }
      providerMessageId = String((result as any)?.data?.id || '').trim();

      await adminCheck.adminDb.collection('emailLogs').add({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'success',
        template: EMAIL_TEMPLATE,
        source: EMAIL_SOURCE,
        from: fromEmail,
        to: toRecipients,
        cc: ccRecipients.length > 0 ? ccRecipients : null,
        subject,
        provider: 'resend',
        providerMessageId: providerMessageId || null,
        errorMessage: null,
        metadata: {
          applicationId,
          memberName,
          primaryContactEmail: primaryContactEmail || null,
          sentToPrimaryContact,
          sentByUid: adminCheck.uid,
          sentByEmail: adminCheck.email,
          sentByName: adminCheck.name,
          senderEmail,
          senderName,
          senderSource: senderResolved.senderSource || null,
          senderUsesFallbackFrom: Boolean(senderTransport.usesFallbackFrom),
          senderWarning: String(senderTransport.warning || ''),
          replyToEmail: isValidEmail(replyToEmail) ? replyToEmail : null,
          ccRecipients,
        },
      });

      await appRef.set(
        {
          introEmailLastSentAt: admin.firestore.FieldValue.serverTimestamp(),
          introEmailLastSentTo: toRecipients.join(', '),
          introEmailLastSentByUid: adminCheck.uid,
          introEmailLastSentByEmail: adminCheck.email,
          introEmailSendHistory: admin.firestore.FieldValue.arrayUnion({
            sentAtIso,
            to: toRecipients.join(', '),
            sentByUid: adminCheck.uid,
            sentByEmail: adminCheck.email,
            sentByName: adminCheck.name,
          }),
        },
        { merge: true }
      );
    } catch (sendError: any) {
      const errorMessage = String(sendError?.message || 'Failed to send introductory email.');
      await adminCheck.adminDb.collection('emailLogs').add({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'failure',
        template: EMAIL_TEMPLATE,
        source: EMAIL_SOURCE,
        from: fromEmail,
        to: toRecipients,
        cc: ccRecipients.length > 0 ? ccRecipients : null,
        subject,
        provider: 'resend',
        providerMessageId: providerMessageId || null,
        errorMessage,
        metadata: {
          applicationId,
          memberName,
          primaryContactEmail: primaryContactEmail || null,
          sentToPrimaryContact,
          sentByUid: adminCheck.uid,
          sentByEmail: adminCheck.email,
          sentByName: adminCheck.name,
          senderEmail,
          senderName,
          senderSource: senderResolved.senderSource || null,
          senderUsesFallbackFrom: Boolean(senderTransport.usesFallbackFrom),
          senderWarning: String(senderTransport.warning || ''),
          replyToEmail: isValidEmail(replyToEmail) ? replyToEmail : null,
          ccRecipients,
        },
      });
      throw sendError;
    }

    return NextResponse.json({
      success: true,
      message: 'Introductory email sent successfully.',
      sentAtIso: new Date().toISOString(),
      sentTo: toRecipients.join(', '),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Unexpected send-introductory-email error.') },
      { status: 500 }
    );
  }
}
