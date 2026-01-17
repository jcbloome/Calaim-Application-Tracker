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
          {/* Main Content */}
          <Section style={content}>
            <Heading style={h1}>Change Your Password</Heading>
            
            <Text style={paragraph}>
              Hello,
            </Text>
            
            <Text style={paragraph}>
              You requested to change your password for your <strong>Connections CalAIM Application Portal</strong> account. Click the button below to create a new password:
            </Text>

            {/* Reset Button */}
            <Section style={buttonContainer}>
              <Button href={resetUrl} style={resetButton}>
                Create New Password
              </Button>
            </Section>

            <Text style={securityNote}>
              If you didn't request this, you can safely ignore this email. Your password won't change until you create a new one.
            </Text>

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

const h1 = {
  color: '#1f2937',
  fontSize: '28px',
  fontWeight: '700',
  lineHeight: '1.25',
  margin: '0 0 24px 0',
  textAlign: 'center' as const,
};

const content = {
  padding: '32px 24px',
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

const securityNote = {
  fontSize: '14px',
  lineHeight: '1.5',
  color: '#6b7280',
  textAlign: 'center' as const,
  margin: '24px 0 0 0',
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