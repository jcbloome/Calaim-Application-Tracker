import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase-admin';
import { requireAdminApiAuthFromIdToken } from '@/lib/admin-api-auth';
import { Resend } from 'resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SETTINGS_REF = adminDb.collection('system_settings').doc('welcoming_user_email');
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

const DEFAULT_SETTINGS = {
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

const normalizeSubjectTemplate = (value: unknown) => {
  const subject = String(value || '').trim();
  if (!subject || LEGACY_SUBJECTS.has(subject)) return DEFAULT_SETTINGS.subjectTemplate;
  return subject;
};

const normalizeBodyTemplate = (value: unknown): string => {
  let body = String(value || DEFAULT_SETTINGS.bodyTemplate);
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
  let normalized = lines.join('\n').trim() || DEFAULT_SETTINGS.bodyTemplate;
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

const SAMPLE_RECIPIENT = {
  firstName: 'Alex',
  fullName: 'Alex Provider',
  email: 'alex.provider@example.com',
};

const htmlEscape = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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

const isValidEmail = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

function textToHtml(bodyText: string, footerText: string) {
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
}

function withDefaults(settings: Record<string, unknown>) {
  return {
    enabled: settings.enabled !== false,
    subjectTemplate: normalizeSubjectTemplate(settings.subjectTemplate),
    bodyTemplate: normalizeBodyTemplate(settings.bodyTemplate),
    portalUrl: String(settings.portalUrl || DEFAULT_SETTINGS.portalUrl),
    portalHintWord: String(settings.portalHintWord || DEFAULT_SETTINGS.portalHintWord),
    loginRoleLabel: String(settings.loginRoleLabel || DEFAULT_SETTINGS.loginRoleLabel),
    rcfeInstruction: normalizeRcfeInstruction(settings.rcfeInstruction),
    footerText: String(settings.footerText || DEFAULT_SETTINGS.footerText),
    fromName: String(settings.fromName || DEFAULT_SETTINGS.fromName),
    fromEmail: String(settings.fromEmail || DEFAULT_SETTINGS.fromEmail),
  };
}

function renderPreview(settings: ReturnType<typeof withDefaults>) {
  const vars = {
    ...SAMPLE_RECIPIENT,
    portalUrl: settings.portalUrl,
    portalHintWord: settings.portalHintWord,
    loginRoleLabel: settings.loginRoleLabel,
    rcfeInstruction: settings.rcfeInstruction,
  };
  const subject = renderTemplate(settings.subjectTemplate, vars).trim();
  const textBody = ensureWelcomeLeadLine(renderTemplate(settings.bodyTemplate, vars).trim());
  const htmlBody = textToHtml(textBody, settings.footerText);
  return { subject, textBody, htmlBody };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const idToken = String(body?.idToken || '').trim();
    const action = String(body?.action || '').trim().toLowerCase();
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });

    const authz = await requireAdminApiAuthFromIdToken(idToken, { requireSuperAdmin: true, requireTwoFactor: true });
    if (!authz.ok) return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });

    const currentSnap = await SETTINGS_REF.get();
    const currentSettings = withDefaults((currentSnap.exists ? currentSnap.data() : {}) || {});

    if (action === 'get') {
      const preview = renderPreview(currentSettings);
      return NextResponse.json({ success: true, settings: currentSettings, preview });
    }

    if (action === 'set') {
      const nextSettings = withDefaults({
        ...currentSettings,
        enabled: body?.enabled,
        subjectTemplate: body?.subjectTemplate,
        bodyTemplate: body?.bodyTemplate,
        portalUrl: body?.portalUrl,
        portalHintWord: body?.portalHintWord,
        loginRoleLabel: body?.loginRoleLabel,
        rcfeInstruction: body?.rcfeInstruction,
        footerText: body?.footerText,
        fromName: body?.fromName,
        fromEmail: body?.fromEmail,
      });

      if (!nextSettings.subjectTemplate.trim()) {
        return NextResponse.json({ success: false, error: 'Subject template is required' }, { status: 400 });
      }
      if (!nextSettings.bodyTemplate.trim()) {
        return NextResponse.json({ success: false, error: 'Body template is required' }, { status: 400 });
      }
      if (!isValidEmail(nextSettings.fromEmail)) {
        return NextResponse.json({ success: false, error: 'A valid from email is required' }, { status: 400 });
      }

      await SETTINGS_REF.set(
        {
          ...nextSettings,
          updatedAt: new Date().toISOString(),
          updatedByEmail: authz.email || '',
        },
        { merge: true }
      );

      const preview = renderPreview(nextSettings);
      return NextResponse.json({ success: true, settings: nextSettings, preview });
    }

    if (action === 'send_test_email') {
      const settings = withDefaults({
        ...currentSettings,
        ...body?.settings,
      });
      const toEmail = String(body?.toEmail || authz.email || '').trim().toLowerCase();
      if (!isValidEmail(toEmail)) {
        return NextResponse.json({ success: false, error: 'A valid test recipient email is required' }, { status: 400 });
      }

      const resendKey = String(process.env.RESEND_API_KEY || '').trim();
      if (!resendKey) {
        return NextResponse.json({ success: false, error: 'RESEND_API_KEY missing' }, { status: 500 });
      }

      const preview = renderPreview(settings);
      const resend = new Resend(resendKey);
      const result = await resend.emails.send({
        from: `${settings.fromName} <${settings.fromEmail}>`,
        to: [toEmail],
        subject: `[TEST PREVIEW] ${preview.subject || 'Welcome to Connections CalAIM Provider Portal'}`,
        html: preview.htmlBody,
        text: preview.textBody,
      });
      const sendError = (result as { error?: { message?: string } | null })?.error;
      if (sendError) {
        throw new Error(String(sendError?.message || 'Failed to send test email'));
      }

      return NextResponse.json({ success: true, sentTo: toEmail, preview });
    }

    return NextResponse.json({ success: false, error: 'Unsupported action' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to manage welcoming user email settings' },
      { status: 500 }
    );
  }
}
