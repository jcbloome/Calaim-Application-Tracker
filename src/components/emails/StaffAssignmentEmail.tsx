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

interface StaffAssignmentEmailProps {
  staffName: string;
  memberName: string;
  memberMrn: string;
  memberCounty: string;
  kaiserStatus: string;
  calaimStatus: string;
  assignedBy: string;
  nextStepsDate?: string;
  dashboardUrl?: string;
}

export default function StaffAssignmentEmail({
  staffName,
  memberName,
  memberMrn,
  memberCounty,
  kaiserStatus,
  calaimStatus,
  assignedBy,
  nextStepsDate,
  dashboardUrl = 'https://carehomefinders.com/admin/kaiser-tracker'
}: StaffAssignmentEmailProps) {
  const previewText = `New member assignment: ${memberName}`;

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
            <Heading style={h1}>New Member Assignment</Heading>
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Text style={greeting}>
              Hi {staffName},
            </Text>
            
            <Text style={paragraph}>
              You have been assigned a new CalAIM member to manage. Please review the member details below and take appropriate next steps.
            </Text>

            {/* Member Details Card */}
            <Section style={memberCard}>
              <Heading style={h2}>Member Information</Heading>
              
              <div style={detailRow}>
                <Text style={detailLabel}>Member Name:</Text>
                <Text style={detailValue}>{memberName}</Text>
              </div>
              
              <div style={detailRow}>
                <Text style={detailLabel}>MRN:</Text>
                <Text style={detailValue}>{memberMrn}</Text>
              </div>
              
              <div style={detailRow}>
                <Text style={detailLabel}>County:</Text>
                <Text style={detailValue}>{memberCounty}</Text>
              </div>
              
              <div style={detailRow}>
                <Text style={detailLabel}>Kaiser Status:</Text>
                <Text style={detailValue}>{kaiserStatus}</Text>
              </div>
              
              <div style={detailRow}>
                <Text style={detailLabel}>CalAIM Status:</Text>
                <Text style={detailValue}>{calaimStatus}</Text>
              </div>
              
              {nextStepsDate && (
                <div style={detailRow}>
                  <Text style={detailLabel}>Next Steps Due:</Text>
                  <Text style={detailValue}>{nextStepsDate}</Text>
                </div>
              )}
              
              <div style={detailRow}>
                <Text style={detailLabel}>Assigned By:</Text>
                <Text style={detailValue}>{assignedBy}</Text>
              </div>
            </Section>

            {/* Action Button */}
            <Section style={buttonContainer}>
              <Link href={dashboardUrl} style={button}>
                View Kaiser Tracker Dashboard
              </Link>
            </Section>

            <Text style={paragraph}>
              Please log into the CalAIM Application Portal to review this member's full details and update their status as needed.
            </Text>

            <Hr style={hr} />
            
            <Text style={footer}>
              This is an automated notification from the CalAIM Application Portal. 
              If you have questions, please contact your supervisor.
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
};

const header = {
  padding: '32px 24px',
  backgroundColor: '#1e40af',
  textAlign: 'center' as const,
};

const logo = {
  margin: '0 auto 16px',
};

const h1 = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: '600',
  lineHeight: '1.25',
  margin: '0',
};

const h2 = {
  color: '#1e40af',
  fontSize: '20px',
  fontWeight: '600',
  lineHeight: '1.25',
  margin: '0 0 16px 0',
};

const content = {
  padding: '24px',
};

const greeting = {
  fontSize: '16px',
  lineHeight: '1.4',
  color: '#374151',
  margin: '0 0 16px 0',
};

const paragraph = {
  fontSize: '14px',
  lineHeight: '1.5',
  color: '#6b7280',
  margin: '0 0 16px 0',
};

const memberCard = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const detailRow = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '12px',
  borderBottom: '1px solid #e5e7eb',
  paddingBottom: '8px',
};

const detailLabel = {
  fontSize: '14px',
  fontWeight: '600',
  color: '#374151',
  margin: '0',
  flex: '1',
};

const detailValue = {
  fontSize: '14px',
  color: '#1f2937',
  margin: '0',
  flex: '2',
  textAlign: 'right' as const,
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#1e40af',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
};

const hr = {
  borderColor: '#e5e7eb',
  margin: '32px 0',
};

const footer = {
  fontSize: '12px',
  lineHeight: '1.4',
  color: '#9ca3af',
  textAlign: 'center' as const,
  margin: '0',
};