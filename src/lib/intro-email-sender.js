function normalizeEmail(value) {
  return String(value || '').trim();
}

function isValidEmail(value) {
  const email = normalizeEmail(value);
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getEmailDomain(value) {
  const email = normalizeEmail(value).toLowerCase();
  const at = email.lastIndexOf('@');
  if (at <= 0 || at >= email.length - 1) return '';
  return email.slice(at + 1);
}

function resolvePreferredSenderIdentity(input) {
  const assignedProfileName = String(input.assignedProfileName || '').trim();
  const assignedProfileEmail = normalizeEmail(input.assignedProfileEmail);
  const assignedAppName = String(input.assignedAppName || '').trim();
  const assignedAppEmail = normalizeEmail(input.assignedAppEmail);
  const fallbackName = String(input.fallbackName || '').trim();
  const fallbackEmail = normalizeEmail(input.fallbackEmail);

  if (isValidEmail(assignedProfileEmail)) {
    return {
      senderName: assignedProfileName || assignedAppName || fallbackName || 'Case Manager',
      senderEmail: assignedProfileEmail,
      senderSource: 'assigned_profile',
    };
  }
  if (isValidEmail(assignedAppEmail)) {
    return {
      senderName: assignedAppName || assignedProfileName || fallbackName || 'Case Manager',
      senderEmail: assignedAppEmail,
      senderSource: 'assigned_application',
    };
  }
  return {
    senderName: assignedAppName || assignedProfileName || fallbackName || 'Case Manager',
    senderEmail: fallbackEmail,
    senderSource: 'admin_fallback',
  };
}

function buildIntroEmailSender(input) {
  const senderName = String(input.senderName || '').trim();
  const senderEmail = normalizeEmail(input.senderEmail);
  const fallbackName = String(input.fallbackName || '').trim() || 'CalAIM Pathfinder';
  const fallbackEmail = normalizeEmail(input.fallbackEmail);
  const verifiedSenderDomain = String(input.verifiedSenderDomain || 'carehomefinders.com')
    .trim()
    .toLowerCase();
  const defaultFromEmail = normalizeEmail(input.defaultFromEmail || 'noreply@carehomefinders.com');

  const senderDomain = getEmailDomain(senderEmail);
  const fallbackDomain = getEmailDomain(fallbackEmail);
  const canUseSenderAsFrom = Boolean(
    isValidEmail(senderEmail) &&
      senderDomain &&
      verifiedSenderDomain &&
      senderDomain === verifiedSenderDomain
  );
  const canUseFallbackAsFrom = Boolean(
    isValidEmail(fallbackEmail) &&
      fallbackDomain &&
      verifiedSenderDomain &&
      fallbackDomain === verifiedSenderDomain
  );

  if (canUseSenderAsFrom) {
    return {
      fromEmail: `${senderName || 'Case Manager'} <${senderEmail}>`,
      replyTo: senderEmail,
      usesFallbackFrom: false,
      warning: '',
      canSendAsResolvedSender: true,
    };
  }

  const replyTo = isValidEmail(senderEmail) ? senderEmail : isValidEmail(fallbackEmail) ? fallbackEmail : '';
  const warning = senderEmail
    ? `Assigned case manager email (${senderEmail}) is outside verified sender domain (${verifiedSenderDomain}); using fallback sender.`
    : 'Assigned case manager email is missing; using fallback sender.';

  if (canUseFallbackAsFrom) {
    return {
      fromEmail: `${fallbackName} <${fallbackEmail}>`,
      replyTo,
      usesFallbackFrom: true,
      warning,
      canSendAsResolvedSender: false,
    };
  }

  return {
    fromEmail: `${fallbackName} <${defaultFromEmail}>`,
    replyTo,
    usesFallbackFrom: true,
    warning,
    canSendAsResolvedSender: false,
  };
}

module.exports = {
  normalizeEmail,
  isValidEmail,
  resolvePreferredSenderIdentity,
  buildIntroEmailSender,
};
