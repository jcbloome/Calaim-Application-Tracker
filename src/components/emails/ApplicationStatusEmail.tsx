
import * as React from 'react';

interface ApplicationStatusEmailProps {
  memberName: string;
  staffName: string;
  message: string;
  status: 'Deleted' | 'Approved' | 'Submitted' | 'Requires Revision' | 'In Progress' | 'Completed & Submitted';
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
  message,
  status,
}) => (
  <div style={container}>
    <div style={card}>
      <h1 style={heading}>An Update on Your CalAIM Application</h1>
      <p style={paragraph}>Hello {memberName},</p>
      <p style={paragraph}>
        This email is to inform you that your CalAIM application {getStatusMessage(status)}
      </p>
      
      {message && (
          <div style={highlightBox}>
            <p style={{ ...paragraph, fontWeight: 'bold', marginBottom: '8px' }}>A message from {staffName}:</p>
            <p style={highlightText}>
              {message}
            </p>
          </div>
      )}

      <p style={paragraph}>
        If you have any questions, please reply to this email or contact our office directly. You can view the full application status by logging into your dashboard.
      </p>
       <a href="https://calaim-pathfinder.web.app/login" style={button}>
        Go to My Dashboard
      </a>
      <p style={footer}>
        This is an automated message from CalAIM Pathfinder.
      </p>
    </div>
  </div>
);

export default ApplicationStatusEmail;
