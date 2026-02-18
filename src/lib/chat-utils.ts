export type ChatParticipantInfo = {
  uid: string;
  email?: string;
  name?: string;
};

export function getDirectConversationId(aUid: string, bUid: string) {
  const a = String(aUid || '').trim();
  const b = String(bUid || '').trim();
  if (!a || !b) return null;
  if (a === b) return `${a}__${b}`;
  return [a, b].sort().join('__');
}

export function getOtherParticipantUid(participants: string[], myUid: string) {
  const me = String(myUid || '').trim();
  const list = Array.isArray(participants) ? participants : [];
  const other = list.find((uid) => String(uid || '').trim() && String(uid || '').trim() !== me) || null;
  return other ? String(other).trim() : null;
}

