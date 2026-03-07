import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components';

type Props = {
  recipientName: string;
  recipientRoleLabel: string; // "RN" | "MSW"
  memberName: string;
  mrn?: string;
  reviewedDateLabel?: string;
  signUrl: string;
};

export default function AlftSignatureRequestEmail({
  recipientName,
  recipientRoleLabel,
  memberName,
  mrn,
  reviewedDateLabel,
  signUrl,
}: Props) {
  const previewText = `Signature requested (${recipientRoleLabel}): ${memberName}`;
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src="https://carehomefinders.com/calaimlogopdf.png"
              width="120"
              height="40"
              alt="CalAIM Logo"
              style={logo}
            />
            <Heading style={h1}>ALFT signature requested</Heading>
          </Section>

          <Section style={content}>
            <Text style={paragraph}>
              Hello <strong>{recipientName || 'there'}</strong> — please sign the ALFT signature page in the CalAIM Tracker.
            </Text>

            <Section style={card}>
              <Heading style={h2}>Member</Heading>
              <div style={row}>
                <Text style={label}>Name</Text>
                <Text style={value}>{memberName || 'Member'}</Text>
              </div>
              {mrn ? (
                <div style={row}>
                  <Text style={label}>MRN</Text>
                  <Text style={value}>{mrn}</Text>
                </div>
              ) : null}
              {reviewedDateLabel ? (
                <div style={row}>
                  <Text style={label}>Reviewed</Text>
                  <Text style={value}>{reviewedDateLabel}</Text>
                </div>
              ) : null}
              <div style={row}>
                <Text style={label}>Signer</Text>
                <Text style={value}>{recipientRoleLabel}</Text>
              </div>
            </Section>

            <Section style={buttonContainer}>
              <Button href={signUrl} style={button}>
                Review & sign
              </Button>
            </Section>

            <Text style={small}>
              If the button doesn’t work, copy/paste this link into your browser:
              <br />
              {signUrl}
            </Text>

            <Hr style={hr} />
            <Text style={footer}>This is an automated message from the CalAIM Tracker.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '24px 0 48px',
  maxWidth: '600px',
};

const header = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  padding: '20px 20px 12px',
};

const logo = {
  display: 'block',
  margin: '0 0 12px 0',
};

const h1 = {
  fontSize: '22px',
  lineHeight: '28px',
  margin: '0',
  color: '#0f172a',
};

const content = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  padding: '20px',
  marginTop: '14px',
};

const paragraph = {
  fontSize: '14px',
  lineHeight: '20px',
  margin: '0 0 14px 0',
  color: '#0f172a',
};

const small = {
  fontSize: '12px',
  lineHeight: '18px',
  margin: '12px 0 0 0',
  color: '#334155',
  wordBreak: 'break-word' as const,
};

const card = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  padding: '14px',
  marginTop: '12px',
};

const h2 = {
  fontSize: '14px',
  margin: '0 0 10px 0',
  color: '#0f172a',
};

const row = {
  display: 'flex',
  gap: '12px',
  alignItems: 'baseline',
  marginBottom: '6px',
};

const label = {
  width: '110px',
  fontSize: '12px',
  color: '#64748b',
  margin: 0,
};

const value = {
  fontSize: '13px',
  color: '#0f172a',
  margin: 0,
};

const buttonContainer = {
  marginTop: '16px',
  textAlign: 'center' as const,
};

const button = {
  backgroundColor: '#0f172a',
  borderRadius: '8px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '14px',
  fontWeight: 600,
  padding: '12px 18px',
  textDecoration: 'none',
};

const hr = {
  borderColor: '#e2e8f0',
  margin: '16px 0',
};

const footer = {
  fontSize: '12px',
  lineHeight: '16px',
  color: '#64748b',
  margin: 0,
  textAlign: 'center' as const,
};

