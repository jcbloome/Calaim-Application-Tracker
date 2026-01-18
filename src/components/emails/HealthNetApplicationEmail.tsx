import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Hr,
  Button,
} from '@react-email/components';

interface HealthNetApplicationEmailProps {
  memberName: string;
  memberClientId?: string;
  applicationId: string;
  submittedBy: string;
  submittedDate: string;
  pathway: string;
  currentLocation: string;
  healthPlan: string;
  applicationUrl: string;
  recipientName: string;
}

export default function HealthNetApplicationEmail({
  memberName,
  memberClientId,
  applicationId,
  submittedBy,
  submittedDate,
  pathway,
  currentLocation,
  healthPlan,
  applicationUrl,
  recipientName,
}: HealthNetApplicationEmailProps) {
  const previewText = `New ${healthPlan} CalAIM Application: ${memberName}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={h1}>🏥 New Health Net Application</Heading>
            <Text style={subtitle}>CalAIM Application Portal Notification</Text>
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Text style={greeting}>
              Hello {recipientName},
            </Text>
            
            <Text style={paragraph}>
              A new <strong>{healthPlan}</strong> CalAIM application has been submitted and requires your attention.
            </Text>

            {/* Application Details Card */}
            <Section style={applicationCard}>
              <Heading style={cardTitle}>📋 Application Details</Heading>
              
              <div style={detailRow}>
                <strong>Member:</strong> {memberName}
                {memberClientId && <span style={clientId}> ({memberClientId})</span>}
              </div>
              
              <div style={detailRow}>
                <strong>Application ID:</strong> {applicationId}
              </div>
              
              <div style={detailRow}>
                <strong>Health Plan:</strong> <span style={healthPlanBadge}>{healthPlan}</span>
              </div>
              
              <div style={detailRow}>
                <strong>Pathway:</strong> {pathway}
              </div>
              
              <div style={detailRow}>
                <strong>Current Location:</strong> {currentLocation}
              </div>
              
              <div style={detailRow}>
                <strong>Submitted By:</strong> {submittedBy}
              </div>
              
              <div style={detailRow}>
                <strong>Submitted Date:</strong> {submittedDate}
              </div>
            </Section>

            {/* Action Button */}
            <Section style={buttonContainer}>
              <Button href={applicationUrl} style={actionButton}>
                📱 Review Application
              </Button>
            </Section>

            <Text style={urgencyNote}>
              ⚡ <strong>Action Required:</strong> Please review this application within 24 hours to ensure timely processing for the member.
            </Text>

            <Hr style={hr} />
            
            <Text style={footer}>
              <strong>Connections CalAIM Application Portal</strong><br />
              This notification was sent to {recipientName} for Health Net applications.<br />
              <Link href={applicationUrl} style={footerLink}>View Application Details</Link>
            </Text>
            
            <Text style={disclaimer}>
              This is an automated notification. Please do not reply to this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '600px',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
};

const header = {
  padding: '32px 24px 24px',
  textAlign: 'center' as const,
  backgroundColor: '#1e40af',
  color: '#ffffff',
  borderRadius: '8px 8px 0 0',
};

const h1 = {
  color: '#ffffff',
  fontSize: '28px',
  fontWeight: '700',
  lineHeight: '1.25',
  margin: '0 0 8px 0',
};

const subtitle = {
  color: '#e0e7ff',
  fontSize: '16px',
  margin: '0',
};

const content = {
  padding: '32px 24px',
};

const greeting = {
  fontSize: '18px',
  fontWeight: '600',
  color: '#1f2937',
  margin: '0 0 16px 0',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#374151',
  margin: '0 0 24px 0',
};

const applicationCard = {
  backgroundColor: '#f8fafc',
  border: '2px solid #e2e8f0',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const cardTitle = {
  fontSize: '18px',
  fontWeight: '600',
  color: '#1e40af',
  margin: '0 0 16px 0',
};

const detailRow = {
  fontSize: '14px',
  lineHeight: '1.5',
  color: '#374151',
  margin: '8px 0',
  padding: '4px 0',
  borderBottom: '1px solid #e5e7eb',
};

const clientId = {
  color: '#6b7280',
  fontSize: '13px',
};

const healthPlanBadge = {
  backgroundColor: '#fbbf24',
  color: '#92400e',
  padding: '2px 8px',
  borderRadius: '12px',
  fontSize: '12px',
  fontWeight: '600',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const actionButton = {
  backgroundColor: '#1e40af',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '16px 32px',
  boxShadow: '0 4px 14px 0 rgba(30, 64, 175, 0.3)',
};

const urgencyNote = {
  fontSize: '14px',
  lineHeight: '1.5',
  color: '#dc2626',
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '6px',
  padding: '12px',
  margin: '24px 0',
};

const hr = {
  borderColor: '#e5e7eb',
  margin: '32px 0',
};

const footer = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#6b7280',
  textAlign: 'center' as const,
  margin: '0 0 16px 0',
};

const footerLink = {
  color: '#1e40af',
  textDecoration: 'underline',
};

const disclaimer = {
  fontSize: '12px',
  lineHeight: '1.4',
  color: '#9ca3af',
  textAlign: 'center' as const,
  margin: '0',
};