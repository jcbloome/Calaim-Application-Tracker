import * as React from 'react';

interface EligibilityCheckConfirmationEmailProps {
  requesterName: string;
  requesterEmail: string;
  memberName: string;
  healthPlan: string;
  county: string;
  checkId: string;
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
  backgroundColor: '#eff6ff',
  border: '1px solid #bfdbfe',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '20px',
};

const highlightText = {
  ...paragraph,
  color: '#1e3a8a',
  margin: 0,
};

const footer = {
  marginTop: '32px',
  textAlign: 'center' as const,
  fontSize: '12px',
  color: '#888',
};

const EligibilityCheckConfirmationEmail: React.FC<Readonly<EligibilityCheckConfirmationEmailProps>> = ({
  requesterName,
  requesterEmail,
  memberName,
  healthPlan,
  county,
  checkId,
}) => {
  return (
    <div style={container}>
      <div style={card}>
        <h1 style={heading}>Eligibility Check Submitted</h1>

        <p style={paragraph}>Hello {requesterName},</p>

        <p style={paragraph}>
          We received your CalAIM Eligibility Check request. We’ll email results within <strong>1 business day</strong>.
        </p>

        <div style={highlightBox}>
          <p style={highlightText}>
            <strong>Reference ID:</strong> {checkId}
            <br />
            <strong>Member:</strong> {memberName}
            <br />
            <strong>Health plan:</strong> {healthPlan}
            <br />
            <strong>County:</strong> {county}
            <br />
            <strong>Requester email:</strong> {requesterEmail}
          </p>
        </div>

        <p style={paragraph}>
          If you need to update or correct any information, please reply to this email and include the reference ID.
        </p>

        <p style={paragraph}>Thank you,</p>
        <p style={paragraph}>CalAIM Support Team</p>

        <div style={footer}>
          <p>This email may contain confidential information intended only for the recipient.</p>
        </div>
      </div>
    </div>
  );
};

export default EligibilityCheckConfirmationEmail;

