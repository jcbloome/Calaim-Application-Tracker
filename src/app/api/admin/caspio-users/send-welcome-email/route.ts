import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { Resend } from 'resend';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type WelcomeSettings = {
  enabled: boolean;
  subjectTemplate: string;
  bodyTemplate: string;
  portalUrl: string;
  portalHintWord: string;
  loginRoleLabel: string;
  rcfeInstruction: string;
  footerText: string;
  fromName: string;
  fromEmail: string;
};
const LEGACY_GREETING_LINE = 'Hello {{firstName}},';
const SUPPORT_LINE = 'If you have questions, please email us at calaim@carehomefinders.com.';
const LEGACY_RCFE_PREFIX = 'For RCFE billers:';
const LEGACY_RCFE_SINGLE_LINE = 'For RCFE billers: after logging in, select "Add CalAIM RCFE" to register your RCFE(s).';
const RCFE_INSTRUCTION_BLOCK = [
  'For RCFE billers submitting Health Net claims: after logging in, select "Add CalAIM RCFE" to register your RCFE(s).',
  'To register RCFEs, you will need an NPI number.',
  'NPPES login: https://nppes.cms.hhs.gov/login',
  'RCFEs should use Taxonomy Code: 310400000X',
].join('\n');

const DEFAULT_WELCOME_SETTINGS: WelcomeSettings = {
  enabled: true,
  subjectTemplate: 'Welcome to Connections CalAIM Provider Portal',
  bodyTemplate: [
    'Welcome to Connections CalAIM.',
    '',
    'Your account is now active. Please go to {{portalUrl}} and open the CalAIM / CalAIM Provider Portal.',
    '',
    'Use the word "{{portalHintWord}}" to access the site, then log in as {{loginRoleLabel}}.',
    '',
    '{{rcfeInstruction}}',
    '',
    SUPPORT_LINE,
    '',
    'Thank you,',
    'Connections Care Home Consultants',
  ].join('\n'),
  portalUrl: 'https://carehomefinders.com',
  portalHintWord: 'bluesky',
  loginRoleLabel: 'Provider',
  rcfeInstruction: RCFE_INSTRUCTION_BLOCK,
  footerText: 'This is an automated welcome email from Connections CalAIM.',
  fromName: 'Connections CalAIM',
  fromEmail: 'noreply@carehomefinders.com',
};
const WELCOME_EMAIL_LOGO_URL =
  'https://images.squarespace-cdn.com/content/v1/5513063be4b069b54e721157/e4e0f894-c7c1-4b7f-a715-6dab7fc055db/calaimlogosmall.jpg?format=2500w';
const WELCOME_LEAD_LINE = 'Welcome Friend to the CalAIM Provider Portal!';
const LEGACY_SUBJECTS = new Set([
  'Welcome to CalAIM Provider Portal - {{fullName}}',
  'Welcome to CalAIM Provider Portal',
]);

const normalizeSubjectTemplate = (value: unknown): string => {
  const subject = String(value || '').trim();
  if (!subject || LEGACY_SUBJECTS.has(subject)) return DEFAULT_WELCOME_SETTINGS.subjectTemplate;
  return subject;
};
const normalizeBodyTemplate = (value: unknown): string => {
  let body = String(value || DEFAULT_WELCOME_SETTINGS.bodyTemplate);
  body = body
    .replaceAll('If you need help, please reply to this email and our team will assist you.', SUPPORT_LINE)
    .replaceAll('If you need help, please email us at info@carehomefinders.com.', SUPPORT_LINE)
    .replaceAll('For RCFE billers: after logging in, select "Add CalAIM RCFE" to register your RCFE(s).', '{{rcfeInstruction}}');
  let lines = body.split('\n').map((line) => {
    const trimmed = String(line || '').trim();
    if (trimmed.startsWith(LEGACY_RCFE_PREFIX)) return '{{rcfeInstruction}}';
    return line;
  });
  if (String(lines[0] || '').trim() === LEGACY_GREETING_LINE) {
    const next = lines.slice(1);
    lines = String(next[0] || '').trim() === '' ? next.slice(1) : next;
  }
  let normalized = lines.join('\n').trim() || DEFAULT_WELCOME_SETTINGS.bodyTemplate;
  if (!normalized.includes('{{rcfeInstruction}}') && !normalized.includes('Taxonomy Code: 310400000X')) {
    normalized = `${normalized}\n\n{{rcfeInstruction}}`;
  }
  return normalized;
};
const normalizeRcfeInstruction = (value: unknown): string => {
  const rcfeInstruction = String(value || '').trim();
  if (!rcfeInstruction || rcfeInstruction === LEGACY_RCFE_SINGLE_LINE) {
    return RCFE_INSTRUCTION_BLOCK;
  }
  return rcfeInstruction;
};

const isValidEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const normalizeBool = (value: unknown): boolean => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on', 'checked', 'active'].includes(normalized);
};

const titleCase = (value: string): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const renderTemplate = (template: string, vars: Record<string, string>) => {
  let rendered = String(template || '');
  Object.entries(vars).forEach(([key, value]) => {
    rendered = rendered.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), String(value || ''));
  });
  return rendered;
};

const ensureWelcomeLeadLine = (bodyText: string) => {
  const normalized = String(bodyText || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return WELCOME_LEAD_LINE;
  const lines = normalized.split('\n').map((line) => String(line || '').trim());
  const firstNonEmptyIndex = lines.findIndex(Boolean);
  if (firstNonEmptyIndex < 0) return WELCOME_LEAD_LINE;

  const firstNonEmptyLine = lines[firstNonEmptyIndex];
  const isExistingWelcomeLead = firstNonEmptyLine.toLowerCase() === WELCOME_LEAD_LINE.toLowerCase();
  if (isExistingWelcomeLead) return normalized;

  const legacyDuplicateLeads = new Set([
    'welcome to connections calaim.',
    'welcome to connections calaim portal!',
    'welcome to connections calaim provider portal',
  ]);
  if (legacyDuplicateLeads.has(firstNonEmptyLine.toLowerCase())) {
    lines.splice(firstNonEmptyIndex, 1);
  }

  const remaining = lines.join('\n').trim();
  return remaining ? `${WELCOME_LEAD_LINE}\n\n${remaining}` : WELCOME_LEAD_LINE;
};

const htmlEscape = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const textToHtml = (bodyText: string, footerText: string) => {
  const lines = String(bodyText || '').split('\n');
  const htmlLines = lines.map((rawLine) => {
    const line = String(rawLine || '').trim();
    if (!line) return '<div style="height: 8px;"></div>';
    if (line.startsWith('- ')) {
      return `<li style="margin: 6px 0;">${htmlEscape(line.slice(2).trim())}</li>`;
    }
    return `<p style="margin: 0 0 10px;">${htmlEscape(line)}</p>`;
  });
  const merged = htmlLines.join('');
  const withListsClosed = merged.replace(/(<li[^>]*>.*?<\/li>)+/g, (liBlock) => {
    return `<ul style="margin: 8px 0 12px 20px; padding: 0;">${liBlock}</ul>`;
  });
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.6; max-width: 640px;">
      ${withListsClosed}
      <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;" />
      <div style="text-align: left; margin: 12px 0 10px;">
        <img
          src="${WELCOME_EMAIL_LOGO_URL}"
          alt="Connections CalAIM"
          style="display: block; width: 260px; max-width: 100%; height: auto; border: 0; background: transparent; margin: 0;"
        />
      </div>
      <p style="margin: 0; font-size: 12px; color: #64748b;">${htmlEscape(footerText)}</p>
    </div>
  `;
};

const withSettingsDefaults = (raw: Record<string, unknown>): WelcomeSettings => {
  return {
    enabled: raw.enabled !== false,
    subjectTemplate: normalizeSubjectTemplate(raw.subjectTemplate),
    bodyTemplate: normalizeBodyTemplate(raw.bodyTemplate),
    portalUrl: String(raw.portalUrl || DEFAULT_WELCOME_SETTINGS.portalUrl),
    portalHintWord: String(raw.portalHintWord || DEFAULT_WELCOME_SETTINGS.portalHintWord),
    loginRoleLabel: String(raw.loginRoleLabel || DEFAULT_WELCOME_SETTINGS.loginRoleLabel),
    rcfeInstruction: normalizeRcfeInstruction(raw.rcfeInstruction),
    footerText: String(raw.footerText || DEFAULT_WELCOME_SETTINGS.footerText),
    fromName: String(raw.fromName || DEFAULT_WELCOME_SETTINGS.fromName),
    fromEmail: String(raw.fromEmail || DEFAULT_WELCOME_SETTINGS.fromEmail),
  };
};

export async function POST(req: NextRequest) {
  try {
    const adminCheck = await requireAdminApiAuth(req, { requireSuperAdmin: true, requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const docId = String(body.docId || '').trim();
    const emailRaw = String(body.email || '').trim().toLowerCase();

    if (!docId && !emailRaw) {
      return NextResponse.json({ success: false, error: 'docId or email is required' }, { status: 400 });
    }

    let userDocRef: FirebaseFirestore.DocumentReference | null = null;
    let userData: Record<string, unknown> | null = null;
    if (docId) {
      const ref = adminCheck.adminDb.collection('caspio_usersregistration_cache').doc(docId);
      const snap = await ref.get();
      if (snap.exists) {
        userDocRef = ref;
        userData = (snap.data() || {}) as Record<string, unknown>;
      }
    }
    if (!userData && emailRaw) {
      const match = await adminCheck.adminDb
        .collection('caspio_usersregistration_cache')
        .where('Email', '==', emailRaw)
        .limit(1)
        .get();
      if (!match.empty) {
        userDocRef = match.docs[0].ref;
        userData = (match.docs[0].data() || {}) as Record<string, unknown>;
      }
    }
    if (!userData) {
      return NextResponse.json({ success: false, error: 'Caspio user registration record not found.' }, { status: 404 });
    }

    const email = String(userData.Email || emailRaw || '').trim().toLowerCase();
    if (!isValidEmail(email)) {
      return NextResponse.json({ success: false, error: 'Target Caspio user does not have a valid email.' }, { status: 400 });
    }
    if (!normalizeBool(userData.Account_Activation)) {
      return NextResponse.json(
        { success: false, error: 'Account_Activation is not checked for this Caspio user.' },
        { status: 400 }
      );
    }

    const settingsSnap = await adminCheck.adminDb.collection('system_settings').doc('welcoming_user_email').get();
    const settings = withSettingsDefaults((settingsSnap.exists ? (settingsSnap.data() as Record<string, unknown>) : {}) || {});
    if (!settings.enabled) {
      return NextResponse.json({ success: false, error: 'Welcoming user email is disabled in settings.' }, { status: 400 });
    }

    const firstName = titleCase(String(userData.First_Name || '').trim());
    const lastName = titleCase(String(userData.Last_Name || '').trim());
    const fullName = titleCase(
      String(userData.Full_Name_UserNames || `${firstName} ${lastName}` || '').trim() || 'Provider'
    );
    const vars = {
      firstName: firstName || fullName.split(/\s+/)[0] || 'there',
      fullName,
      email,
      portalUrl: settings.portalUrl,
      portalHintWord: settings.portalHintWord,
      loginRoleLabel: settings.loginRoleLabel,
      rcfeInstruction: settings.rcfeInstruction,
    };

    const subject = renderTemplate(settings.subjectTemplate, vars).trim() || 'Welcome to Connections CalAIM Provider Portal';
    const textBody = ensureWelcomeLeadLine(renderTemplate(settings.bodyTemplate, vars).trim());
    const htmlBody = textToHtml(textBody, settings.footerText);

    const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();
    if (!resendApiKey) {
      return NextResponse.json({ success: false, error: 'RESEND_API_KEY is not configured.' }, { status: 500 });
    }

    const resend = new Resend(resendApiKey);
    const sendResult = await resend.emails.send({
      from: `${settings.fromName} <${settings.fromEmail}>`,
      to: [email],
      subject,
      html: htmlBody,
      text: textBody,
    });
    const sendError = (sendResult as { error?: { message?: string } | null })?.error;
    if (sendError) throw new Error(String(sendError?.message || 'Failed to send welcome email'));
    const providerMessageId = String((sendResult as { data?: { id?: string } | null })?.data?.id || '').trim() || null;

    await adminCheck.adminDb.collection('emailLogs').add({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'success',
      template: 'welcoming_user_email',
      source: '/api/admin/caspio-users/send-welcome-email',
      from: `${settings.fromName} <${settings.fromEmail}>`,
      to: [email],
      subject,
      provider: 'resend',
      providerMessageId,
      metadata: {
        triggeredManually: true,
        caspioUserDocId: userDocRef?.id || null,
        caspioUserId: String(userData.User_ID || '').trim() || null,
        sentByUid: adminCheck.uid,
        sentByEmail: adminCheck.email,
      },
    });

    if (userDocRef) {
      await userDocRef.set(
        {
          welcomeUserPortalEmailLastSentAt: admin.firestore.FieldValue.serverTimestamp(),
          welcomeUserPortalEmailRecipient: email,
          welcomeUserPortalEmailSubject: subject,
          welcomeUserPortalEmailLastSentManualByUid: adminCheck.uid,
          welcomeUserPortalEmailLastSentManualByEmail: adminCheck.email,
        },
        { merge: true }
      );
    }

    return NextResponse.json({ success: true, sentTo: email, docId: userDocRef?.id || null });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to send Caspio welcome email' },
      { status: 500 }
    );
  }
}
