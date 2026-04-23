import assert from 'node:assert/strict';
import {
  resolvePreferredSenderIdentity,
  buildIntroEmailSender,
} from '../src/lib/intro-email-sender.js';

function run() {
  const resolvedProfile = resolvePreferredSenderIdentity({
    assignedProfileName: 'Case Manager A',
    assignedProfileEmail: 'manager.a@carehomefinders.com',
    assignedAppName: 'Fallback App Name',
    assignedAppEmail: 'app.assigned@carehomefinders.com',
    fallbackName: 'Admin Fallback',
    fallbackEmail: 'admin@carehomefinders.com',
  });
  assert.equal(resolvedProfile.senderEmail, 'manager.a@carehomefinders.com');
  assert.equal(resolvedProfile.senderSource, 'assigned_profile');

  const resolvedApp = resolvePreferredSenderIdentity({
    assignedProfileName: 'Case Manager A',
    assignedProfileEmail: '',
    assignedAppName: 'Assigned From App',
    assignedAppEmail: 'assigned.app@carehomefinders.com',
    fallbackName: 'Admin Fallback',
    fallbackEmail: 'admin@carehomefinders.com',
  });
  assert.equal(resolvedApp.senderEmail, 'assigned.app@carehomefinders.com');
  assert.equal(resolvedApp.senderSource, 'assigned_application');

  const resolvedFallback = resolvePreferredSenderIdentity({
    assignedProfileName: '',
    assignedProfileEmail: '',
    assignedAppName: '',
    assignedAppEmail: '',
    fallbackName: 'Admin Fallback',
    fallbackEmail: 'admin@carehomefinders.com',
  });
  assert.equal(resolvedFallback.senderEmail, 'admin@carehomefinders.com');
  assert.equal(resolvedFallback.senderSource, 'admin_fallback');

  const directFrom = buildIntroEmailSender({
    senderName: 'Case Manager A',
    senderEmail: 'manager.a@carehomefinders.com',
    fallbackName: 'Admin Fallback',
    fallbackEmail: 'admin@carehomefinders.com',
    verifiedSenderDomain: 'carehomefinders.com',
    defaultFromEmail: 'noreply@carehomefinders.com',
  });
  assert.equal(directFrom.usesFallbackFrom, false);
  assert.equal(directFrom.canSendAsResolvedSender, true);
  assert.match(String(directFrom.fromEmail), /manager\.a@carehomefinders\.com/);

  const fallbackTransport = buildIntroEmailSender({
    senderName: 'Outside Staff',
    senderEmail: 'outside@gmail.com',
    fallbackName: 'Admin Fallback',
    fallbackEmail: 'admin@carehomefinders.com',
    verifiedSenderDomain: 'carehomefinders.com',
    defaultFromEmail: 'noreply@carehomefinders.com',
  });
  assert.equal(fallbackTransport.usesFallbackFrom, true);
  assert.equal(fallbackTransport.canSendAsResolvedSender, false);
  assert.match(String(fallbackTransport.fromEmail), /admin@carehomefinders\.com/);
  assert.equal(fallbackTransport.replyTo, 'outside@gmail.com');

  console.log('intro-email-sender tests passed');
}

run();
