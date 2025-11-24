
import * as React from 'react';

interface RevisionRequestEmailProps {
  memberName: string;
  formName: string;
  revisionNotes: string;
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
  backgroundColor: '#fffbe6',
  border: '1px solid #fde047',
  borderRadius: '4px',
  padding: '20px',
  marginBottom: '24px',
};

const highlightText = {
  ...paragraph,
  color: '#333',
  margin: 0,
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


const RevisionRequestEmail: React.FC<Readonly<RevisionRequestEmailProps>> = ({
  memberName,
  formName,
  revisionNotes,
}) => (
  <div style={container}>
    <div style={card}>
      <h1 style={heading}>Action Required for Your CalAIM Application</h1>
      <p style={paragraph}>Hello {memberName},</p>
      <p style={paragraph}>
        We have reviewed your application for the CalAIM program and a revision is required for the following form: <strong>{formName}</strong>.
      </p>
      <div style={highlightBox}>
        <p style={{ ...paragraph, fontWeight: 'bold', marginBottom: '8px' }}>Notes from our team:</p>
        <p style={highlightText}>
          {revisionNotes}
        </p>
      </div>
      <p style={paragraph}>
        Please log in to your dashboard to make the necessary changes and resubmit the form.
      </p>
      <a href="https://calaim-pathfinder.web.app/login" style={button}>
        Go to My Application
      </a>
      <p style={footer}>
        This is an automated message from CalAIM Pathfinder.
      </p>
    </div>
  </div>
);

export default RevisionRequestEmail;
