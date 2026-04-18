
import * as React from 'react';

interface ApplicationStatusEmailProps {
  memberName: string;
  staffName: string;
  staffTitle?: string;
  staffEmail?: string;
  message: string;
  status: 'Deleted' | 'Approved' | 'Submitted' | 'Requires Revision' | 'In Progress' | 'Completed & Submitted';
  portalUrl?: string;
  surveyUrl?: string;
  supportEmail?: string;
  supportSubject?: string;
}

const container = {
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
  backgroundColor: '#f0f0f0',
  padding: '40px 20px',
};

const card = {
  backgroundColor: '#ffffff',
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  maxWidth: '600px',
  margin: '0 auto',
  padding: '40px',
};

const heading = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: '#333',
  marginBottom: '16px',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '1.5',
  color: '#555',
  marginBottom: '16px',
};

const highlightBox = {
  backgroundColor: '#f1f5f9',
  border: '1px solid #e2e8f0',
  borderRadius: '4px',
  padding: '20px',
  marginBottom: '24px',
};

const highlightText = {
  ...paragraph,
  color: '#333',
  margin: 0,
  whiteSpace: 'pre-wrap' as const,
};

const button = {
  backgroundColor: '#4782D1',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '4px',
  textDecoration: 'none',
  display: 'inline-block',
  marginTop: '16px',
};

const footer = {
  marginTop: '32px',
  textAlign: 'center' as const,
  fontSize: '12px',
  color: '#888',
};

const signatureBlock = {
  marginTop: '8px',
  marginBottom: '8px',
  fontSize: '14px',
  color: '#334155',
  lineHeight: '1.5',
};

const getStatusMessage = (status: ApplicationStatusEmailProps['status']) => {
  switch (status) {
    case 'Deleted':
      return 'has been deleted from our system.';
    case 'Approved':
      return 'has been approved!';
    case 'Submitted':
    case 'Completed & Submitted':
        return 'has been successfully submitted for review.'
    case 'Requires Revision':
        return 'has been marked as requiring revision.'
    default:
      return 'has been updated.';
  }
};


const ApplicationStatusEmail: React.FC<Readonly<ApplicationStatusEmailProps>> = ({
  memberName,
  staffName,
  staffTitle,
  staffEmail,
  message,
  status,
  portalUrl,
  surveyUrl,
  supportEmail,
  supportSubject,
}) => (
  <div style={container}>
    <div style={card}>
      <h1 style={heading}>An Update on Your CalAIM Application</h1>
      <p style={paragraph}>Dear {memberName},</p>
      <p style={paragraph}>
        This email is to inform you that your CalAIM application {getStatusMessage(status)}
      </p>
      
      {message && (
          <div style={highlightBox}>
            <p style={{ ...paragraph, fontWeight: 'bold', marginBottom: '8px' }}>A message from {staffName}:</p>
            <p style={highlightText}>
              {message}
            </p>
            <div style={signatureBlock}>
              {staffTitle ? <div>{staffTitle}</div> : null}
              <div>
                <a href={`mailto:${staffEmail || supportEmail || 'calaim@carehomefinders.com'}`}>
                  {staffEmail || supportEmail || 'calaim@carehomefinders.com'}
                </a>
              </div>
              <div>
                <a href="https://connectcalaim.com">connectcalaim.com</a>
              </div>
            </div>
          </div>
      )}

      <p style={paragraph}>
        If you have any questions, please contact our office directly at{' '}
        <a
          href={`mailto:${supportEmail || 'calaim@carehomefinders.com'}?subject=${encodeURIComponent(
            supportSubject || 'CalAIM Question'
          )}`}
        >
          {supportEmail || 'calaim@carehomefinders.com'}
        </a>
        . You can view the full application status by logging into your dashboard.
      </p>
      <a href={portalUrl || 'https://connectcalaim.com/login'} style={button}>
        Go to My Dashboard
      </a>
      {status === 'Approved' && surveyUrl ? (
        <div style={{ marginTop: '18px' }}>
          <p style={{ ...paragraph, marginBottom: '8px' }}>
            We would also love your feedback about the application process.
          </p>
          <a href={surveyUrl} style={{ ...button, backgroundColor: '#0f766e', marginTop: 0 }}>
            Complete Feedback Survey
          </a>
        </div>
      ) : null}
      <p style={footer}>
        Connect CalAIM | Connections Care Home Consultants <br />
        <a href="https://connectcalaim.com">https://connectcalaim.com</a>
      </p>
    </div>
  </div>
);

export default ApplicationStatusEmail;
