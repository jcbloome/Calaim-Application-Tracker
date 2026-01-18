import React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Link,
  Img,
  Hr,
  Button,
} from '@react-email/components';

interface NoteAssignmentEmailProps {
  staffName: string;
  memberName: string;
  noteContent: string;
  priority: 'low' | 'medium' | 'high';
  assignedBy: string;
  noteType?: string;
  source?: 'portal' | 'caspio';
  clientId2?: string;
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
};

const box = {
  padding: '0 48px',
};

const hr = {
  borderColor: '#e6ebf1',
  margin: '20px 0',
};

const paragraph = {
  color: '#525f7f',
  fontSize: '16px',
  lineHeight: '1.4',
  textAlign: 'left' as const,
};

const anchor = {
  color: '#556cd6',
};

const button = {
  backgroundColor: '#656ee8',
  borderRadius: '5px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  width: '100%',
  padding: '10px',
  marginTop: '20px',
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '1.4',
  marginTop: '50px',
};

const priorityColors = {
  low: '#10b981',
  medium: '#f59e0b', 
  high: '#ef4444'
};

const priorityBadge = (priority: 'low' | 'medium' | 'high') => ({
  backgroundColor: priorityColors[priority],
  color: '#ffffff',
  padding: '4px 8px',
  borderRadius: '4px',
  fontSize: '12px',
  fontWeight: 'bold',
  textTransform: 'uppercase' as const,
  display: 'inline-block',
  marginLeft: '8px'
});

const noteBox = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '16px',
  margin: '16px 0',
};

export default function NoteAssignmentEmail({
  staffName,
  memberName,
  noteContent,
  priority,
  assignedBy,
  noteType = 'General',
  source = 'portal',
  clientId2
}: NoteAssignmentEmailProps) {
  const portalUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const noteUrl = clientId2 
    ? `${portalUrl}/admin/member-notes?search=${encodeURIComponent(memberName)}`
    : `${portalUrl}/admin/member-notes`;

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={box}>
            {/* Header */}
            <Img
              src={`${portalUrl}/calaimlogopdf.png`}
              width="200"
              height="50"
              alt="CalAIM Logo"
              style={{ margin: '0 auto 20px' }}
            />
            
            <Text style={{ ...paragraph, fontSize: '24px', fontWeight: 'bold', textAlign: 'center', color: '#1a202c' }}>
              📝 New Note Assignment
            </Text>

            <Hr style={hr} />

            {/* Greeting */}
            <Text style={paragraph}>
              Hello {staffName},
            </Text>

            <Text style={paragraph}>
              You have been assigned a new note for <strong>{memberName}</strong> from the CalAIM system.
            </Text>

            {/* Note Details */}
            <Section style={noteBox}>
              <Text style={{ ...paragraph, margin: '0 0 8px 0', fontWeight: 'bold' }}>
                Note Details:
              </Text>
              <Text style={{ ...paragraph, margin: '4px 0' }}>
                <strong>Member:</strong> {memberName}
              </Text>
              <Text style={{ ...paragraph, margin: '4px 0' }}>
                <strong>Type:</strong> {noteType}
                <span style={priorityBadge(priority)}>{priority}</span>
              </Text>
              <Text style={{ ...paragraph, margin: '4px 0' }}>
                <strong>Assigned by:</strong> {assignedBy}
              </Text>
              <Text style={{ ...paragraph, margin: '4px 0' }}>
                <strong>Source:</strong> {source === 'caspio' ? 'Caspio System' : 'CalAIM Portal'}
              </Text>
              
              <Hr style={{ ...hr, margin: '12px 0' }} />
              
              <Text style={{ ...paragraph, margin: '8px 0 0 0' }}>
                <strong>Note Content:</strong>
              </Text>
              <Text style={{ 
                ...paragraph, 
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                padding: '12px',
                margin: '8px 0',
                fontStyle: 'italic'
              }}>
                {noteContent}
              </Text>
            </Section>

            {/* Action Button */}
            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
              <Button href={noteUrl} style={button}>
                View Note in Portal
              </Button>
            </Section>

            {/* Instructions */}
            <Text style={paragraph}>
              Please log in to the CalAIM portal to view the full note details and take any necessary actions.
            </Text>

            <Text style={paragraph}>
              If you have any questions or need assistance, please contact the CalAIM support team.
            </Text>

            <Hr style={hr} />

            {/* Footer */}
            <Text style={footer}>
              This is an automated notification from the CalAIM Community Supports system.
              <br />
              You are receiving this email because you have been assigned a note in the system.
              <br />
              <Link href={`${portalUrl}/admin/profile`} style={anchor}>
                Update your notification preferences
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}