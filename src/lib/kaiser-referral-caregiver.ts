/**
 * Kaiser referral Caregiver/Support Person should be blank unless there is an
 * authorized representative — never default to primary contact alone.
 */

const clean = (value: unknown) => String(value || '').trim();

export type ReferralAuthorizedCaregiver = {
  name: string;
  contact: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  relationship: string;
};

function packContact(parts: { phone?: string; email?: string; relationship?: string }) {
  const phone = clean(parts.phone);
  const email = clean(parts.email);
  const relationship = clean(parts.relationship);
  return [phone, email, relationship ? `Relationship: ${relationship}` : '']
    .filter(Boolean)
    .join(' | ');
}

function fromPerson(parts: {
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
  email?: unknown;
  relationship?: unknown;
}): ReferralAuthorizedCaregiver {
  const firstName = clean(parts.firstName);
  const lastName = clean(parts.lastName);
  const phone = clean(parts.phone);
  const email = clean(parts.email);
  const relationship = clean(parts.relationship);
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return {
    name,
    contact: name ? packContact({ phone, email, relationship }) : '',
    firstName,
    lastName,
    phone,
    email,
    relationship,
  };
}

const emptyCaregiver = (): ReferralAuthorizedCaregiver => ({
  name: '',
  contact: '',
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  relationship: '',
});

/**
 * Resolve caregiver/support person for Kaiser referral from authorized
 * representative data only. Returns blank name/contact when none.
 */
export function resolveReferralAuthorizedCaregiver(
  source: Record<string, unknown> | null | undefined
): ReferralAuthorizedCaregiver {
  if (!source || typeof source !== 'object') return emptyCaregiver();

  const hasLegalRep = clean(source.hasLegalRep).toLowerCase();

  const fromCaspio = fromPerson({
    firstName: source.Authorized_Party_First || source.authorizedPartyFirst,
    lastName: source.Authorized_Party_Last || source.authorizedPartyLast,
    phone: source.Authorized_Party_Phone || source.authorizedPartyPhone,
    email: source.Authorized_Party_Email || source.authorizedPartyEmail,
    relationship: source.Authorized_Party_Relationship || source.authorizedPartyRelationship,
  });
  if (fromCaspio.name) return fromCaspio;

  const fromRepFields = fromPerson({
    firstName: source.repFirstName || source.healthPoaFirstName,
    lastName: source.repLastName || source.healthPoaLastName,
    phone: source.repPhone || source.healthPoaPhone,
    email: source.repEmail || source.healthPoaEmail,
    relationship: source.repRelationship || source.healthPoaRelationship,
  });

  if (hasLegalRep === 'same_as_primary') {
    return fromPerson({
      firstName: source.bestContactFirstName,
      lastName: source.bestContactLastName,
      phone: source.bestContactPhone,
      email: source.bestContactEmail,
      relationship: source.bestContactRelationship || 'Authorized Representative',
    });
  }

  if (hasLegalRep === 'same_as_submitter') {
    return fromPerson({
      firstName: source.referrerFirstName,
      lastName: source.referrerLastName,
      phone: source.referrerPhone,
      email: source.referrerEmail,
      relationship: source.referrerRelationship || 'Authorized Representative',
    });
  }

  if (
    hasLegalRep === 'different' ||
    hasLegalRep === 'no_capacity_has_rep' ||
    hasLegalRep === 'no_has_rep'
  ) {
    return fromRepFields.name ? fromRepFields : emptyCaregiver();
  }

  // Unknown / not applicable / no legal rep: only use explicit rep fields if present.
  if (fromRepFields.name) return fromRepFields;
  return emptyCaregiver();
}
