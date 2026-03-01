import React from 'react';
import { Html, Head, Body, Container, Section, Text, Link, Hr } from '@react-email/components';

export type SwClaimReminderItem = {
  claimId: string;
  claimMonth?: string;
  claimDay?: string;
  rcfeName?: string;
  totalAmount?: number;
};

export type SwClaimReminderEmailProps = {
  socialWorkerName: string;
  items: SwClaimReminderItem[];
  portalUrl: string;
};

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 32px',
  marginBottom: '24px',
};

const box = {
  padding: '0 32px',
};

const h1 = {
  fontSize: '20px',
  fontWeight: 700,
  color: '#0f172a',
  margin: '0 0 12px',
};

const p = {
  color: '#334155',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0 0 12px',
};

const listItem = {
  ...p,
  margin: '0 0 8px',
};

const mono = {
  fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
  fontSize: '12px',
  color: '#0f172a',
};

const hr = {
  borderColor: '#e2e8f0',
  margin: '16px 0',
};

export default function SwClaimReminderEmail(props: Readonly<SwClaimReminderEmailProps>) {
  const { socialWorkerName, items, portalUrl } = props;
  const submitUrl = `${portalUrl.replace(/\/$/, '')}/sw-portal/submit-claims`;
  const statusLogUrl = `${portalUrl.replace(/\/$/, '')}/sw-portal/status-log`;

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={box}>
            <Text style={h1}>Claim submission reminder</Text>
            <Text style={p}>
              Hi {socialWorkerName || 'there'}, this is a reminder that you have claim(s) ready to submit in the Social Worker Portal.
            </Text>
            <Text style={p}>
              Please open <Link href={submitUrl}>Submit Claims</Link> to submit these items. You can also verify statuses in{' '}
              <Link href={statusLogUrl}>Status Log</Link>.
            </Text>

            <Hr style={hr} />

            <Text style={p}>
              <strong>Unsubmitted claim(s)</strong>
            </Text>

            {items.slice(0, 25).map((it) => (
              <Text key={it.claimId} style={listItem}>
                - {it.claimDay || it.claimMonth || '—'} • {it.rcfeName || 'RCFE'} •{' '}
                <span style={mono}>{it.claimId}</span>
                {typeof it.totalAmount === 'number' && Number.isFinite(it.totalAmount) ? ` • $${it.totalAmount.toFixed(2)}` : ''}
              </Text>
            ))}
            {items.length > 25 ? <Text style={p}>+ {items.length - 25} more…</Text> : null}

            <Hr style={hr} />

            <Text style={p}>
              If you believe this is an error, please contact your administrator.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

