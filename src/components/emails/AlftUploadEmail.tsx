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
} from '@react-email/components';

type Props = {
  memberName: string;
  uploadDate: string;
  kaiserMrn?: string;
  uploaderName: string;
  uploaderEmail?: string;
  intakeUrl: string;
};

export default function AlftUploadEmail({
  memberName,
  uploadDate,
  kaiserMrn,
  uploaderName,
  uploaderEmail,
  intakeUrl,
}: Props) {
  const previewText = `ALFT Tool uploaded: ${memberName}`;
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
            <Heading style={h1}>ALFT Tool uploaded</Heading>
          </Section>

          <Section style={content}>
            <Text style={paragraph}>
              A Social Worker uploaded an <strong>Assisted Living Facility Transitions (ALFT)</strong> tool for a Kaiser
              member. Please review and process it in the portal.
            </Text>

            <Section style={card}>
              <Heading style={h2}>Member</Heading>
              <div style={row}>
                <Text style={label}>Name</Text>
                <Text style={value}>{memberName}</Text>
              </div>
              <div style={row}>
                <Text style={label}>Upload date</Text>
                <Text style={value}>{uploadDate}</Text>
              </div>
              {kaiserMrn ? (
                <div style={row}>
                  <Text style={label}>Kaiser MRN</Text>
                  <Text style={value}>{kaiserMrn}</Text>
                </div>
              ) : null}
            </Section>

            <Section style={card}>
              <Heading style={h2}>Uploaded by</Heading>
              <div style={row}>
                <Text style={label}>Name</Text>
                <Text style={value}>{uploaderName}</Text>
              </div>
              {uploaderEmail ? (
                <div style={row}>
                  <Text style={label}>Email</Text>
                  <Text style={value}>{uploaderEmail}</Text>
                </div>
              ) : null}
            </Section>

            <Section style={buttonContainer}>
              <Link href={intakeUrl} style={button}>
                Open ALFT intake
              </Link>
            </Section>

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

