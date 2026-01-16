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

interface PasswordResetEmailProps {
  resetUrl: string;
  userEmail: string;
}

export default function PasswordResetEmail({
  resetUrl,
  userEmail,
}: PasswordResetEmailProps) {
  const previewText = 'Reset your CalAIM Application Portal password';

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Img
              src="https://carehomefinders.com/calaimlogopdf.png"
              width="120"
              height="40"
              alt="CalAIM Logo"
              style={logo}
            />
            <Heading style={h1}>Reset Your Password</Heading>
            <Text style={headerSubtitle}>We received a request to reset your password</Text>
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Text style={greeting}>
              Hello,
            </Text>
            
            <Text style={paragraph}>
              You recently requested to reset your password for your <strong>Connections CalAIM Application Portal</strong> account. Click the button below to create a new password:
            </Text>

            {/* Reset Button */}
            <Section style={buttonContainer}>
              <Button href={resetUrl} style={resetButton}>
                Reset My Password
              </Button>
            </Section>

            {/* Security Information */}
            <Section style={infoBox}>
              <Text style={infoTitle}>🔒 Security Information:</Text>
              <ul style={infoList}>
                <li>This link will take you to the password reset page</li>
                <li>If you didn't request this reset, you can safely ignore this email</li>
                <li>Your password won't change until you create a new one</li>
                <li>This link is secure and will expire after use</li>
              </ul>
            </Section>

            {/* Backup Link */}
            <Section style={backupSection}>
              <Text style={backupTitle}>⚠️ Can't click the button?</Text>
              <Text style={backupText}>
                Copy and paste this link into your browser:
              </Text>
              <Text style={backupLink}>{resetUrl}</Text>
            </Section>

            <Hr style={hr} />
            
            <Text style={footer}>
              <strong>Connections CalAIM Application Portal Team</strong><br />
              This email was sent to {userEmail}<br />
              If you have any questions, please contact our support team.
            </Text>
            
            <Text style={disclaimer}>
              This is an automated message. Please do not reply to this email.
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
};

const header = {
  padding: '32px 24px',
  background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
  textAlign: 'center' as const,
  borderRadius: '12px 12px 0 0',
};

const logo = {
  margin: '0 auto 16px',
};

const h1 = {
  color: '#ffffff',
  fontSize: '28px',
  fontWeight: '700',
  lineHeight: '1.25',
  margin: '0 0 8px 0',
};

const headerSubtitle = {
  color: '#e0e7ff',
  fontSize: '16px',
  lineHeight: '1.4',
  margin: '0',
};

const content = {
  padding: '32px 24px',
};

const greeting = {
  fontSize: '16px',
  lineHeight: '1.4',
  color: '#374151',
  margin: '0 0 16px 0',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#374151',
  margin: '0 0 24px 0',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const resetButton = {
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

const infoBox = {
  backgroundColor: '#f1f5f9',
  border: '1px solid #cbd5e1',
  borderLeft: '4px solid #1e40af',
  borderRadius: '6px',
  padding: '20px',
  margin: '24px 0',
};

const infoTitle = {
  fontSize: '14px',
  fontWeight: '600',
  color: '#1e40af',
  margin: '0 0 12px 0',
};

const infoList = {
  fontSize: '14px',
  lineHeight: '1.5',
  color: '#475569',
  margin: '0',
  paddingLeft: '20px',
};

const backupSection = {
  backgroundColor: '#fef3c7',
  border: '1px solid #f59e0b',
  borderRadius: '6px',
  padding: '16px',
  margin: '24px 0',
};

const backupTitle = {
  fontSize: '14px',
  fontWeight: '600',
  color: '#92400e',
  margin: '0 0 8px 0',
};

const backupText = {
  fontSize: '14px',
  color: '#92400e',
  margin: '0 0 8px 0',
};

const backupLink = {
  fontSize: '12px',
  fontFamily: 'monospace',
  color: '#92400e',
  wordBreak: 'break-all' as const,
  margin: '0',
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

const disclaimer = {
  fontSize: '12px',
  lineHeight: '1.4',
  color: '#9ca3af',
  textAlign: 'center' as const,
  margin: '0',
};