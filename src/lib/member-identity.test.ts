import { strict as assert } from 'node:assert';
import {
  buildApplicationIdentityAliases,
  buildNameToken,
  evaluateIdentityConflict,
  evaluateIdentityMatch,
  extractIdentitySignals,
  normalizeIdentityToken,
} from './member-identity';

const run = () => {
  assert.equal(normalizeIdentityToken('  A-123  '), 'a123');
  assert.equal(buildNameToken('Mary', "O'Neil"), 'mary|oneil');

  const expected = extractIdentitySignals({
    memberFirstName: 'Mary',
    memberLastName: 'Jones',
    memberMrn: 'MRN-100',
    memberMediCalNum: 'CIN-999',
    clientId2: '12345',
    memberDob: '01/02/1950',
  });
  const candidateMrn = extractIdentitySignals({
    Senior_First: 'Mary',
    Senior_Last: 'Jones',
    MRN: 'MRN-100',
    Client_ID2: '12345',
    Birth_Date: '01/02/1950',
  });
  const candidateConflict = extractIdentitySignals({
    Senior_First: 'Larry',
    Senior_Last: 'Moore',
    MRN: 'MRN-222',
    Client_ID2: '77777',
  });
  const candidateSameIdMissingMediCal = extractIdentitySignals({
    Senior_First: 'Mary',
    Senior_Last: 'Jones',
    Client_ID2: '12345',
    // Intentionally no Medi-Cal / differing-absent MRN on Caspio side
  });
  const candidateLeadingZeroMrn = extractIdentitySignals({
    Senior_First: 'Mary',
    Senior_Last: 'Jones',
    MRN: '17849828',
    Client_ID2: '12345',
  });
  const expectedWithLeadingZeroMrn = extractIdentitySignals({
    memberFirstName: 'Mary',
    memberLastName: 'Jones',
    memberMrn: '000017849828',
    memberMediCalNum: 'CIN-999',
    clientId2: '12345',
  });

  const mrnMatch = evaluateIdentityMatch(expected, candidateMrn);
  assert.equal(mrnMatch.reasonCode, 'match_by_client_id2');
  assert.ok(mrnMatch.score >= 500);

  const conflict = evaluateIdentityConflict(expected, candidateConflict);
  assert.equal(conflict.isConflict, true);
  assert.ok(conflict.reasonCodes.includes('conflict_name_mismatch'));

  const missingMediCalOk = evaluateIdentityConflict(expected, candidateSameIdMissingMediCal);
  assert.equal(missingMediCalOk.isConflict, false);

  const leadingZeroOk = evaluateIdentityConflict(expectedWithLeadingZeroMrn, candidateLeadingZeroMrn);
  assert.equal(leadingZeroOk.isConflict, false);

  const aliases = buildApplicationIdentityAliases({
    memberFirstName: 'Mary',
    memberLastName: 'Jones',
    memberDob: '1950-01-02',
    memberMrn: 'MRN-100',
    memberMediCalNum: 'CIN-999',
    clientId2: '12345',
    healthPlan: 'Kaiser',
    pathway: 'ILS',
  });
  assert.ok(aliases.has('mrn:mrn100'));
  assert.ok(aliases.has('client:12345'));
  assert.ok(aliases.has('medi:cin999'));
  assert.ok(Array.from(aliases).some((alias) => alias.startsWith('name_dob:')));
  assert.ok(Array.from(aliases).some((alias) => alias.startsWith('name_plan_path:')));
};

run();

