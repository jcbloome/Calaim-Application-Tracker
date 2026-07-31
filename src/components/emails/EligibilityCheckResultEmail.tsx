import * as React from 'react';

interface EligibilityCheckResultEmailProps {
  requesterName: string;
  memberName: string;
  healthPlan: string;
  county: string;
  checkId: string;
  result: 'eligible' | 'not-eligible' | 'undetermined';
  resultMessage: string;
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

const pill = (result: 'eligible' | 'not-eligible' | 'undetermined') => ({
  backgroundColor:
    result === 'eligible' ? '#dcfce7' : result === 'not-eligible' ? '#fee2e2' : '#fef3c7',
  border: `1px solid ${result === 'eligible' ? '#16a34a' : result === 'not-eligible' ? '#dc2626' : '#d97706'}`,
  borderRadius: '9999px',
  padding: '8px 14px',
  display: 'inline-block',
  fontWeight: 700,
  color: result === 'eligible' ? '#166534' : result === 'not-eligible' ? '#991b1b' : '#92400e',
  marginBottom: '16px',
});

const monoBox = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '14px',
  marginTop: '12px',
  whiteSpace: 'pre-wrap' as const,
  fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
  fontSize: '13px',
  color: '#111827',
};

const footer = {
  marginTop: '32px',
  textAlign: 'center' as const,
  fontSize: '12px',
  color: '#888',
};

const EligibilityCheckResultEmail: React.FC<Readonly<EligibilityCheckResultEmailProps>> = ({
  requesterName,
  memberName,
  healthPlan,
  county,
  checkId,
  result,
  resultMessage,
}) => {
  const label =
    result === 'eligible'
      ? 'ELIGIBLE for CalAIM'
      : result === 'not-eligible'
        ? 'NOT ELIGIBLE for CalAIM'
        : 'UNDETERMINED - NEED MORE INFORMATION';
  return (
    <div style={container}>
      <div style={card}>
        <h1 style={heading}>Eligibility Check Results</h1>

        <p style={paragraph}>Hello {requesterName},</p>

        <p style={paragraph}>
          We’ve completed the CalAIM eligibility check you requested.
        </p>

        <div style={pill(result)}>{label}</div>

        <p style={paragraph}>
          <strong>Reference ID:</strong> {checkId}
          <br />
          <strong>Member:</strong> {memberName}
          <br />
          <strong>Health plan:</strong> {healthPlan}
          <br />
          <strong>County:</strong> {county}
        </p>

        <p style={paragraph}>
          <strong>Details:</strong>
        </p>
        <div style={monoBox}>{resultMessage}</div>

        <p style={paragraph} className="">
          Thank you,
          <br />
          CalAIM Support Team
        </p>

        <div style={footer}>
          <p>This email may contain confidential information intended only for the recipient.</p>
        </div>
      </div>
    </div>
  );
};

export default EligibilityCheckResultEmail;

