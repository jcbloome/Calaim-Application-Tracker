import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

let resendClient: Resend | null = null;
function getResendClient(): Resend | null {
  if (resendClient) return resendClient;
  const key = String(process.env.RESEND_API_KEY || '').trim();
  if (!key) return null;
  resendClient = new Resend(key);
  return resendClient;
}

interface BulkEmailPayload {
  subject: string;
  message: string;
  recipients: string[];
  isTest?: boolean;
}

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export async function POST(request: NextRequest) {
  try {
    const resend = getResendClient();
    if (!resend) {
      return NextResponse.json(
        { success: false, error: 'Resend API key is not configured' },
        { status: 500 }
      );
    }

    const body = (await request.json()) as BulkEmailPayload;
    const subject = String(body.subject || '').trim();
    const message = String(body.message || '').trim();
    const recipients = Array.isArray(body.recipients) ? body.recipients.filter(Boolean) : [];

    if (!subject || !message || recipients.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Subject, message, and recipients are required' },
        { status: 400 }
      );
    }

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <p style="white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${message}</p>
      </div>
    `;

    const chunks = chunkArray(recipients, 50);
    const results: Array<{ to: string[]; id?: string; error?: string }> = [];

    for (const chunk of chunks) {
      const { data, error } = await resend.emails.send({
        from: 'Connections CalAIM <noreply@carehomefinders.com>',
        to: chunk,
        subject,
        html: htmlBody
      });

      if (error) {
        results.push({ to: chunk, error: error.message });
      } else {
        results.push({ to: chunk, id: data?.id });
      }
    }

    return NextResponse.json({
      success: true,
      sent: recipients.length,
      batches: results
    });
  } catch (error: any) {
    console.error('Error sending bulk RCFE email:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to send bulk email' },
      { status: 500 }
    );
  }
}
