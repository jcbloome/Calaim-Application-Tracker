
'use client';

// This is a wrapper around the main HIPAA form page component.
// It ensures that the form page is loaded within the admin layout.
import HipaaAuthorizationPage from '@/app/forms/hipaa-authorization/page';

export default function AdminHipaaAuthorizationPage() {
    return <HipaaAuthorizationPage />;
}
