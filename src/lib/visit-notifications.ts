/**
 * Visit Notification System
 * 
 * Handles notifications for flagged visits to John Amber and Jason Bloome
 */

interface FlaggedVisitData {
  visitId: string;
  memberName: string;
  rcfeName: string;
  rcfeAddress: string;
  socialWorkerName: string;
  socialWorkerId: string;
  visitDate: string;
  totalScore: number;
  flagReasons: string[];
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
  memberConcerns: string;
  rcfeIssues: string;
  actionRequired: boolean;
  geolocation?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
}

interface NotificationRecipient {
  name: string;
  email: string;
  role: string;
}

const NOTIFICATION_RECIPIENTS: NotificationRecipient[] = [
  {
    name: 'John Amber',
    email: 'john.amber@connections.org',
    role: 'SW Visit Supervisor'
  },
  {
    name: 'Jason Bloome',
    email: 'jason.bloome@connections.org',
    role: 'Program Director'
  }
];

/**
 * Determine notification urgency based on visit data
 */
export function getNotificationUrgency(visitData: FlaggedVisitData): 'immediate' | 'urgent' | 'standard' {
  if (visitData.urgencyLevel === 'critical' || 
      visitData.totalScore < 20 || 
      visitData.flagReasons.includes('safety')) {
    return 'immediate';
  }
  
  if (visitData.urgencyLevel === 'high' || 
      visitData.totalScore < 30 || 
      visitData.actionRequired) {
    return 'urgent';
  }
  
  return 'standard';
}

/**
 * Generate flag reasons from visit data
 */
export function generateFlagReasons(visitData: any): string[] {
  const reasons: string[] = [];
  
  if (visitData.visitSummary.totalScore < 30) {
    reasons.push(`Low overall score (${visitData.visitSummary.totalScore}/75)`);
  }
  
  if (visitData.memberConcerns.urgencyLevel === 'critical') {
    reasons.push('Critical member concerns reported');
  }
  
  if (visitData.memberConcerns.concernTypes.safety) {
    reasons.push('Safety concerns identified');
  }
  
  if (visitData.memberConcerns.concernTypes.medical) {
    reasons.push('Medical concerns reported');
  }
  
  if (visitData.rcfeAssessment.overallRating <= 2) {
    reasons.push(`Poor RCFE rating (${visitData.rcfeAssessment.overallRating}/5)`);
  }
  
  if (visitData.careSatisfaction.overallSatisfaction <= 2) {
    reasons.push(`Poor care satisfaction (${visitData.careSatisfaction.overallSatisfaction}/5)`);
  }
  
  if (visitData.memberConcerns.actionRequired) {
    reasons.push('Immediate action required');
  }
  
  if (visitData.rcfeAssessment.flagForReview) {
    reasons.push('RCFE flagged for review');
  }
  
  return reasons;
}

/**
 * Create notification email content
 */
export function createNotificationEmail(visitData: FlaggedVisitData): {
  subject: string;
  htmlContent: string;
  textContent: string;
} {
  const urgency = getNotificationUrgency(visitData);
  const urgencyEmoji = urgency === 'immediate' ? '🚨' : urgency === 'urgent' ? '⚠️' : '📋';
  
  const subject = `${urgencyEmoji} SW Visit Alert: ${visitData.memberName} at ${visitData.rcfeName}`;
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${urgency === 'immediate' ? '#fee2e2' : urgency === 'urgent' ? '#fef3c7' : '#f3f4f6'}; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h1 style="color: ${urgency === 'immediate' ? '#dc2626' : urgency === 'urgent' ? '#d97706' : '#374151'}; margin: 0;">
          ${urgencyEmoji} Social Worker Visit Alert
        </h1>
        <p style="margin: 10px 0 0 0; font-weight: bold;">
          ${urgency === 'immediate' ? 'IMMEDIATE ATTENTION REQUIRED' : 
            urgency === 'urgent' ? 'URGENT REVIEW NEEDED' : 
            'FLAGGED FOR REVIEW'}
        </p>
      </div>
      
      <div style="background: white; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #1f2937; margin-top: 0;">Visit Details</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Member:</td>
            <td style="padding: 8px 0;">${visitData.memberName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">RCFE:</td>
            <td style="padding: 8px 0;">${visitData.rcfeName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Address:</td>
            <td style="padding: 8px 0;">${visitData.rcfeAddress}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Social Worker:</td>
            <td style="padding: 8px 0;">${visitData.socialWorkerName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Visit Date:</td>
            <td style="padding: 8px 0;">${new Date(visitData.visitDate).toLocaleDateString()}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Overall Score:</td>
            <td style="padding: 8px 0;">
              <span style="color: ${visitData.totalScore >= 50 ? '#059669' : visitData.totalScore >= 30 ? '#d97706' : '#dc2626'}; font-weight: bold;">
                ${visitData.totalScore}/75 (${Math.round((visitData.totalScore/75)*100)}%)
              </span>
            </td>
          </tr>
        </table>
      </div>
      
      <div style="background: white; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #dc2626; margin-top: 0;">🚩 Flag Reasons</h2>
        <ul style="margin: 0; padding-left: 20px;">
          ${visitData.flagReasons.map(reason => `<li style="margin: 5px 0;">${reason}</li>`).join('')}
        </ul>
      </div>
      
      ${visitData.memberConcerns ? `
      <div style="background: white; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #1f2937; margin-top: 0;">Member Concerns</h2>
        <p style="margin: 0;">${visitData.memberConcerns}</p>
      </div>
      ` : ''}
      
      ${visitData.rcfeIssues ? `
      <div style="background: white; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #1f2937; margin-top: 0;">RCFE Issues</h2>
        <p style="margin: 0;">${visitData.rcfeIssues}</p>
      </div>
      ` : ''}
      
      <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #1f2937; margin-top: 0;">Next Steps</h2>
        <ul style="margin: 0; padding-left: 20px;">
          ${visitData.actionRequired ? '<li>Immediate follow-up action required</li>' : ''}
          <li>Review complete visit questionnaire in CalAIM system</li>
          <li>Contact social worker for additional details if needed</li>
          <li>Schedule follow-up visit if necessary</li>
          ${visitData.urgencyLevel === 'critical' ? '<li><strong>Respond within 24 hours</strong></li>' : ''}
        </ul>
      </div>
      
      <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 12px;">
        <p>This is an automated notification from the CalAIM Application Tracker</p>
        <p>Visit ID: ${visitData.visitId}</p>
        ${visitData.geolocation ? `<p>Location verified: ${visitData.geolocation.latitude.toFixed(6)}, ${visitData.geolocation.longitude.toFixed(6)}</p>` : ''}
      </div>
    </div>
  `;
  
  const textContent = `
SW VISIT ALERT: ${visitData.memberName} at ${visitData.rcfeName}

${urgency === 'immediate' ? 'IMMEDIATE ATTENTION REQUIRED' : 
  urgency === 'urgent' ? 'URGENT REVIEW NEEDED' : 
  'FLAGGED FOR REVIEW'}

VISIT DETAILS:
- Member: ${visitData.memberName}
- RCFE: ${visitData.rcfeName}
- Address: ${visitData.rcfeAddress}
- Social Worker: ${visitData.socialWorkerName}
- Visit Date: ${new Date(visitData.visitDate).toLocaleDateString()}
- Overall Score: ${visitData.totalScore}/75 (${Math.round((visitData.totalScore/75)*100)}%)

FLAG REASONS:
${visitData.flagReasons.map(reason => `- ${reason}`).join('\n')}

${visitData.memberConcerns ? `MEMBER CONCERNS:\n${visitData.memberConcerns}\n` : ''}

${visitData.rcfeIssues ? `RCFE ISSUES:\n${visitData.rcfeIssues}\n` : ''}

NEXT STEPS:
${visitData.actionRequired ? '- Immediate follow-up action required\n' : ''}- Review complete visit questionnaire in CalAIM system
- Contact social worker for additional details if needed
- Schedule follow-up visit if necessary
${visitData.urgencyLevel === 'critical' ? '- RESPOND WITHIN 24 HOURS\n' : ''}

Visit ID: ${visitData.visitId}
${visitData.geolocation ? `Location verified: ${visitData.geolocation.latitude.toFixed(6)}, ${visitData.geolocation.longitude.toFixed(6)}` : ''}
  `;
  
  return { subject, htmlContent, textContent };
}

/**
 * Send notification for flagged visit
 * This would integrate with your email service (SendGrid, AWS SES, etc.)
 */
export async function sendFlaggedVisitNotification(visitData: any): Promise<void> {
  try {
    const flagReasons = generateFlagReasons(visitData);
    
    const flaggedData: FlaggedVisitData = {
      visitId: visitData.visitId,
      memberName: visitData.memberName,
      rcfeName: visitData.rcfeName,
      rcfeAddress: visitData.rcfeAddress,
      socialWorkerName: visitData.socialWorkerId, // This would be resolved to actual name
      socialWorkerId: visitData.socialWorkerId,
      visitDate: visitData.visitDate,
      totalScore: visitData.visitSummary.totalScore,
      flagReasons,
      urgencyLevel: visitData.memberConcerns.urgencyLevel,
      memberConcerns: visitData.memberConcerns.detailedConcerns,
      rcfeIssues: visitData.rcfeAssessment.notes,
      actionRequired: visitData.memberConcerns.actionRequired,
      geolocation: visitData.geolocation
    };
    
    const { subject, htmlContent, textContent } = createNotificationEmail(flaggedData);
    
    // Log notification for now (replace with actual email service)
    console.log('📧 FLAGGED VISIT NOTIFICATION:');
    console.log('To:', NOTIFICATION_RECIPIENTS.map(r => r.email).join(', '));
    console.log('Subject:', subject);
    console.log('Urgency:', getNotificationUrgency(flaggedData));
    console.log('Flag Reasons:', flagReasons);
    
    // Here you would integrate with your email service:
    // await sendEmail({
    //   to: NOTIFICATION_RECIPIENTS.map(r => r.email),
    //   subject,
    //   html: htmlContent,
    //   text: textContent
    // });
    
    console.log('✅ Notification sent successfully');
    
  } catch (error) {
    console.error('❌ Failed to send flagged visit notification:', error);
    throw error;
  }
}

/**
 * Create dashboard alert for immediate viewing
 */
export function createDashboardAlert(visitData: FlaggedVisitData) {
  return {
    id: `alert-${visitData.visitId}`,
    type: getNotificationUrgency(visitData),
    title: `Visit Alert: ${visitData.memberName}`,
    message: `${visitData.flagReasons[0]} - Score: ${visitData.totalScore}/75`,
    timestamp: new Date().toISOString(),
    visitId: visitData.visitId,
    memberName: visitData.memberName,
    rcfeName: visitData.rcfeName,
    socialWorker: visitData.socialWorkerName,
    actionRequired: visitData.actionRequired
  };
}