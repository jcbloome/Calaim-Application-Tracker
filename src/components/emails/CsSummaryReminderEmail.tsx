import React from 'react';

interface CsSummaryReminderEmailProps {
  userName: string;
  memberName: string;
  applicationId: string;
  confirmationUrl: string;
  supportEmail: string;
}

export function CsSummaryReminderEmail({
  userName,
  memberName,
  applicationId,
  confirmationUrl,
  supportEmail
}: CsSummaryReminderEmailProps) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <img 
          src="https://your-domain.com/calaimlogopdf.png" 
          alt="CalAIM Logo" 
          style={{ height: '60px', marginBottom: '10px' }}
        />
        <h1 style={{ color: '#1f2937', margin: '0', fontSize: '24px' }}>
          CalAIM Application - Action Required
        </h1>
      </div>

      {/* Main Content */}
      <div style={{ backgroundColor: '#f9fafb', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
        <h2 style={{ color: '#1f2937', marginTop: '0' }}>Hello {userName},</h2>
        
        <p style={{ color: '#4b5563', lineHeight: '1.6' }}>
          We noticed that you've completed the CS Member Summary form for <strong>{memberName}</strong>, 
          but it hasn't been confirmed yet.
        </p>

        <div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '6px', padding: '15px', margin: '20px 0' }}>
          <h3 style={{ color: '#92400e', margin: '0 0 10px 0', fontSize: '16px' }}>
            ⚠️ Action Required
          </h3>
          <p style={{ color: '#92400e', margin: '0', fontSize: '14px' }}>
            To complete your CalAIM application, you need to review and confirm your CS Member Summary form.
          </p>
        </div>

        <p style={{ color: '#4b5563', lineHeight: '1.6' }}>
          <strong>What you need to do:</strong>
        </p>
        <ol style={{ color: '#4b5563', lineHeight: '1.6', paddingLeft: '20px' }}>
          <li>Click the "Complete Confirmation" button below</li>
          <li>Review your CS Member Summary information</li>
          <li>Click "Confirm" to finalize your application</li>
        </ol>

        <div style={{ textAlign: 'center', margin: '30px 0' }}>
          <a 
            href={confirmationUrl}
            style={{
              backgroundColor: '#10b981',
              color: 'white',
              padding: '12px 24px',
              textDecoration: 'none',
              borderRadius: '6px',
              fontWeight: 'bold',
              display: 'inline-block'
            }}
          >
            Complete Confirmation
          </a>
        </div>

        <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: '1.6' }}>
          <strong>Application Details:</strong><br />
          Member: {memberName}<br />
          Application ID: {applicationId}
        </p>
      </div>

      {/* Important Notice */}
      <div style={{ backgroundColor: '#fee2e2', border: '1px solid #f87171', borderRadius: '6px', padding: '15px', marginBottom: '20px' }}>
        <h3 style={{ color: '#dc2626', margin: '0 0 10px 0', fontSize: '16px' }}>
          📋 Important Notice
        </h3>
        <p style={{ color: '#dc2626', margin: '0', fontSize: '14px' }}>
          Your application cannot proceed to the next steps until the CS Member Summary is confirmed. 
          Please complete this step as soon as possible to avoid delays in processing.
        </p>
      </div>

      {/* Help Section */}
      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '20px' }}>
        <h3 style={{ color: '#1f2937', fontSize: '16px' }}>Need Help?</h3>
        <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: '1.6' }}>
          If you have any questions or need assistance completing your application, please contact our support team:
        </p>
        <p style={{ color: '#6b7280', fontSize: '14px' }}>
          📧 Email: <a href={`mailto:${supportEmail}`} style={{ color: '#3b82f6' }}>{supportEmail}</a><br />
          📞 Phone: (555) 123-4567
        </p>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '20px', textAlign: 'center' }}>
        <p style={{ color: '#9ca3af', fontSize: '12px', margin: '0' }}>
          This is an automated message from the CalAIM Application System.<br />
          Please do not reply to this email.
        </p>
        <p style={{ color: '#9ca3af', fontSize: '12px', margin: '10px 0 0 0' }}>
          © 2024 Connections Care Home Consultants. All rights reserved.
        </p>
      </div>
    </div>
  );
}

// Plain text version for email clients that don't support HTML
export function getCsSummaryReminderEmailText({
  userName,
  memberName,
  applicationId,
  confirmationUrl,
  supportEmail
}: CsSummaryReminderEmailProps): string {
  return `
CalAIM Application - Action Required

Hello ${userName},

We noticed that you've completed the CS Member Summary form for ${memberName}, but it hasn't been confirmed yet.

ACTION REQUIRED:
To complete your CalAIM application, you need to review and confirm your CS Member Summary form.

What you need to do:
1. Visit: ${confirmationUrl}
2. Review your CS Member Summary information
3. Click "Confirm" to finalize your application

Application Details:
Member: ${memberName}
Application ID: ${applicationId}

IMPORTANT NOTICE:
Your application cannot proceed to the next steps until the CS Member Summary is confirmed. Please complete this step as soon as possible to avoid delays in processing.

Need Help?
If you have any questions or need assistance, please contact our support team:
Email: ${supportEmail}
Phone: (555) 123-4567

This is an automated message from the CalAIM Application System.
© 2024 Connections Care Home Consultants. All rights reserved.
  `.trim();
}