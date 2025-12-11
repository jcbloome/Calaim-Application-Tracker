
'use server';

import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeAdminApp } from '@/firebase/admin-init';

interface CreateUserPayload {
    email: string;
    firstName: string;
    lastName: string;
}

// This is a server-side action. It uses the Firebase Admin SDK.
export const createAdminUser = async (payload: CreateUserPayload) => {
    const { email, firstName, lastName } = payload;
    
    try {
        const adminApp = initializeAdminApp();
        const adminAuth = getAuth(adminApp);
        const adminFirestore = getFirestore(adminApp);

        // 1. Create the user in Firebase Authentication
        const userRecord = await adminAuth.createUser({
            email: email,
            displayName: `${firstName} ${lastName}`,
            // We are not setting a password, so Firebase will send an email
            // to the user to set their password. This is more secure.
            emailVerified: false, 
        });

        // 2. Create the user document in the `users` collection in Firestore.
        const userDocRef = adminFirestore.collection('users').doc(userRecord.uid);
        await userDocRef.set({
            id: userRecord.uid,
            firstName,
            lastName,
            displayName: `${firstName} ${lastName}`,
            email: userRecord.email,
        });

        // 3. Assign the 'admin' role in the `roles_admin` collection.
        const adminRoleRef = adminFirestore.collection('roles_admin').doc(userRecord.uid);
        await adminRoleRef.set({
            email: userRecord.email,
            role: 'admin',
            createdAt: Timestamp.now(),
        });
        
        // 4. Send a password reset email so the new user can set their password
        const link = await adminAuth.generatePasswordResetLink(email);
        // In a real app, you would use a service like Resend to email this link to the user.
        // For this demo, we'll just log it to the server console.
        console.log(`Password reset link for ${email}: ${link}`);

        return { success: true, userId: userRecord.uid };

    } catch (error: any) {
        console.error("Error creating admin user:", error);
        return { success: false, error: error.message || "An unknown error occurred" };
    }
};
