import { addDoc, collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

type Role = 'Admin' | 'Super Admin' | 'Staff' | 'Social Worker' | 'User';
type Action = 'login' | 'logout';

type TrackPayload = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  role: Role;
  action: Action;
  portal: 'admin' | 'sw' | 'user';
  success?: boolean;
  failureReason?: string | null;
};

const toSafe = (value: unknown) => String(value || '').trim();

export async function trackLoginActivityClient(firestore: any, payload: TrackPayload) {
  if (!firestore) return;
  const uid = toSafe(payload.uid);
  if (!uid) return;

  const email = toSafe(payload.email || '');
  const displayName = toSafe(payload.displayName || '');
  const role = toSafe(payload.role || 'User');
  const action = toSafe(payload.action || 'login');

  try {
    await addDoc(collection(firestore, 'loginLogs'), {
      userId: uid,
      userEmail: email || null,
      userName: displayName || email || null,
      userRole: role,
      role,
      action,
      portal: payload.portal,
      success: payload.success !== false,
      failureReason: payload.failureReason || null,
      timestamp: serverTimestamp(),
      userAgent: typeof window !== 'undefined' ? navigator.userAgent : null,
    });
  } catch (error) {
    console.warn('[login-activity] Failed to write login log (non-blocking):', error);
  }
}

export async function setPortalSessionOnlineClient(
  firestore: any,
  payload: Omit<TrackPayload, 'action' | 'success' | 'failureReason'> & { sessionType?: 'admin' | 'sw' | 'user' }
) {
  if (!firestore) return;
  const uid = toSafe(payload.uid);
  if (!uid) return;

  const email = toSafe(payload.email || '');
  const displayName = toSafe(payload.displayName || '');
  const role = toSafe(payload.role || 'User');

  try {
    await setDoc(
      doc(firestore, 'activeSessions', uid),
      {
        userId: uid,
        userEmail: email || null,
        userName: displayName || email || null,
        userRole: role,
        isOnline: true,
        portal: payload.portal,
        sessionType: payload.sessionType || payload.portal,
        loginTime: serverTimestamp(),
        lastActivity: serverTimestamp(),
        updatedAt: serverTimestamp(),
        userAgent: typeof window !== 'undefined' ? navigator.userAgent : null,
      },
      { merge: true }
    );
  } catch (error) {
    console.warn('[login-activity] Failed to update active session (non-blocking):', error);
  }
}

export async function setPortalSessionOfflineClient(firestore: any, uid: string) {
  if (!firestore) return;
  const cleanUid = toSafe(uid);
  if (!cleanUid) return;

  try {
    await updateDoc(doc(firestore, 'activeSessions', cleanUid), {
      isOnline: false,
      signedOutAt: serverTimestamp(),
      lastActivity: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('[login-activity] Failed to mark session offline (non-blocking):', error);
  }
}

