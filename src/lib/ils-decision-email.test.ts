import { strict as assert } from 'node:assert';
import {
  ILS_DECISION_CUSTOM_TEXT_MAX,
  ILS_DECISION_IDEMPOTENCY_KEY_MAX,
  ILS_DECISION_RECIPIENTS,
  ILS_DECISION_CC,
  ILS_DECISION_TO,
  buildIlsBulkOutOfCountyDeclineNarrative,
  buildIlsBulkOutOfCountyDeclineSubject,
  buildIlsBulkOutOfCountyDeclineTextBody,
  buildIlsDecisionHtmlBody,
  buildIlsDecisionNarrative,
  buildIlsDecisionSubject,
  buildIlsDecisionTextBody,
  validateIlsDecisionCustomText,
  validateIlsDecisionIdempotencyKey,
} from './ils-decision-email';

const run = () => {
  assert.equal(buildIlsDecisionNarrative('accept'), 'Please note we have STARTED service delivery for this member.');
  assert.equal(buildIlsDecisionNarrative('decline'), 'Please note we have DECLINED service delivery for this member.');
  assert.equal(
    buildIlsDecisionNarrative('decline', { declineReason: 'out_of_county' }),
    'Please note we are DECLINING service delivery for this member since we do not serve this county.'
  );
  assert.equal(
    buildIlsBulkOutOfCountyDeclineNarrative(),
    'Please note we are DECLINING service delivery for these members since we do not serve those counties.'
  );
  assert.equal(
    buildIlsBulkOutOfCountyDeclineSubject(25),
    'To ILS RE: Northern California declines (25 members)'
  );

  assert.equal(Array.from(ILS_DECISION_TO).join(','), 'ils-calaim@ilshealth.com');
  assert.equal(Array.from(ILS_DECISION_CC).join(','), 'jason@carehomefinders.com');
  assert.equal(Array.from(ILS_DECISION_RECIPIENTS).join(','), 'ils-calaim@ilshealth.com,jason@carehomefinders.com');
  assert.equal(buildIlsDecisionSubject('Kimberly Clemens', '110019007034'), 'To ILS RE: Kimberly Clemens MRN: 110019007034');

  const textBody = buildIlsDecisionTextBody({
    choice: 'accept',
    memberName: 'Jane Doe',
    memberMrn: '12345',
    memberCounty: 'Orange',
    customText: 'Custom line one.\nCustom line two.',
  });
  assert.ok(textBody.includes('Hi ILS,\n\nPlease note we have STARTED service delivery for this member.'));
  assert.ok(textBody.includes('Custom line one.\nCustom line two.'));
  assert.ok(textBody.includes('Member: Jane Doe\nMRN: 12345\nCounty: Orange'));
  assert.ok(textBody.includes('Jason Bloome\nConnections Care Home Consultants\n800-330-5993'));

  const bulkBody = buildIlsBulkOutOfCountyDeclineTextBody({
    members: [
      { memberName: 'Timothy Clark', memberMrn: '110000787251', memberCounty: 'Contra Costa' },
      { memberName: 'Kazuko Petteys', memberMrn: '110017896345', memberCounty: 'Alameda' },
    ],
  });
  assert.ok(
    bulkBody.startsWith(
      'Hi ILS,\n\nPlease note we are DECLINING service delivery for these members since we do not serve those counties.'
    )
  );
  assert.ok(bulkBody.includes('Member: Timothy Clark\nMRN: 110000787251\nCounty: Contra Costa'));
  assert.ok(bulkBody.includes('Member: Kazuko Petteys\nMRN: 110017896345\nCounty: Alameda'));

  const htmlBody = buildIlsDecisionHtmlBody({
    choice: 'decline',
    memberName: 'Jane <Doe>',
    memberMrn: '987',
    memberCounty: 'LA',
    customText: 'Line A\nLine B & more',
  });
  assert.ok(htmlBody.includes('<p style="margin: 0 0 14px 0; line-height: 1.6;">Hi ILS,</p>'));
  assert.ok(htmlBody.includes('Please note we have DECLINED service delivery for this member.'));
  assert.ok(htmlBody.includes('Jane &lt;Doe&gt;'));
  assert.ok(htmlBody.includes('Line A<br/>Line B &amp; more'));

  assert.equal(validateIlsDecisionCustomText('x'.repeat(ILS_DECISION_CUSTOM_TEXT_MAX)), null);
  assert.ok(Boolean(validateIlsDecisionCustomText('x'.repeat(ILS_DECISION_CUSTOM_TEXT_MAX + 1))));

  assert.equal(validateIlsDecisionIdempotencyKey('abc-123'), null);
  assert.ok(Boolean(validateIlsDecisionIdempotencyKey('')));
  assert.ok(Boolean(validateIlsDecisionIdempotencyKey('x'.repeat(ILS_DECISION_IDEMPOTENCY_KEY_MAX + 1))));
};

run();
