
import * as React from 'react';

interface ReminderEmailProps {
  referrerName: string;
  memberName: string;
  applicationId: string;
  incompleteItems: string[];
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

const list = {
    paddingLeft: '20px',
    margin: 0,
};

const listItem = {
    ...paragraph,
    color: '#333',
    margin: '4px 0',
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

const ReminderEmail: React.FC<Readonly<ReminderEmailProps>> = ({
  referrerName,
  memberName,
  applicationId,
  incompleteItems,
}) => (
  <div style={container}>
    <div style={card}>
      <h1 style={heading}>Friendly Reminder for Your CalAIM Application</h1>
      <p style={paragraph}>Hello {referrerName},</p>
      <p style={paragraph}>
        This is a friendly reminder that the CalAIM application for <strong>{memberName}</strong> still has some items that need your attention.
      </p>
      
      <div style={highlightBox}>
        <p style={{ ...paragraph, fontWeight: 'bold', marginBottom: '8px' }}>The following items are still pending:</p>
        <ul style={list}>
            {incompleteItems.map(item => (
                <li key={item} style={listItem}>{item}</li>
            ))}
        </ul>
      </div>

      <p style={paragraph}>
        Please log in to your dashboard to complete these items and move the application forward.
      </p>
       <a href={`https://calaim-pathfinder.web.app/pathway?applicationId=${applicationId}`} style={button}>
        Continue Application
      </a>
      <p style={footer}>
        You are receiving this email because automated reminders are enabled.
        <br />
        This is an automated message from CalAIM Pathfinder.
      </p>
    </div>
  </div>
);

export default ReminderEmail;

    