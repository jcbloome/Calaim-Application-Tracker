
import { notFound } from 'next/navigation';
import { initializeAdminApp } from '@/firebase/admin-init';
import { getFirestore, collectionGroup, query, where, getDocs } from 'firebase-admin/firestore';
import { ApplicationDetailClientView } from './ApplicationDetailClientView';
import type { Application } from '@/lib/definitions';

// This is now a Server Component. It fetches data on the server.
export default async function AdminApplicationDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;

  if (!id) {
    // If we don't have an ID, we can't fetch the data.
    notFound();
  }

  let applicationData: Application | null = null;
  
  try {
    const adminApp = initializeAdminApp();
    const adminFirestore = getFirestore(adminApp);
    
    // Query the 'applications' collection group to find the document by its ID
    const applicationsCollection = collectionGroup(adminFirestore, 'applications');
    const q = query(applicationsCollection, where('id', '==', id));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const docSnap = querySnapshot.docs[0];
      // Manually converting Firestore data to a plain object
      const data = docSnap.data();
      applicationData = {
        id: docSnap.id,
        ...data,
        // The userId is part of the document path, so we can get it from the ref
        userId: docSnap.ref.parent.parent?.id,
        // Convert Timestamps to ISO strings for serialization
        lastUpdated: data?.lastUpdated?.toDate().toISOString(),
        memberDob: data?.memberDob?.toDate().toISOString(),
        forms: data?.forms?.map((form: any) => ({
          ...form,
          dateCompleted: form.dateCompleted?.toDate().toISOString() || null,
        })),
      } as Application;
    }
  } catch (error) {
    console.error("Failed to fetch application data on server:", error);
    // If fetching fails, we can't render the page.
    notFound();
  }

  if (!applicationData) {
    notFound();
  }

  // Pass the server-fetched data to the client component.
  return <ApplicationDetailClientView initialApplication={applicationData} />;
}
