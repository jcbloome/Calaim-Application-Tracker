# Caspio Webhook Setup Guide

This guide explains how to connect your Caspio note tables to the CalAIM Tracker notification system.

## Overview

The system connects to two Caspio tables:
1. **CalAIM_Members_Notes_ILS** - Member-specific notes
2. **connect_tbl_client_notes** - General client notes

When new notes are added to these tables, the system will:
- Send email notifications to designated staff
- Create in-app popup notifications
- Store notes in the app for viewing and management

## Webhook Endpoints

After deploying the Firebase functions, you'll have these webhook endpoints:

### CalAIM Members Notes
```
POST https://your-project.web.app/caspioCalAIMNotesWebhook
```

### Client Notes
```
POST https://your-project.web.app/caspioClientNotesWebhook
```

## Caspio Setup Instructions

### 1. Configure Webhooks in Caspio

For each table, you need to set up a webhook that triggers when new records are inserted:

#### CalAIM_Members_Notes_ILS Table:
1. Go to your Caspio account
2. Navigate to the CalAIM_Members_Notes_ILS table
3. Go to **Configure > Triggered Actions**
4. Create a new **Webhook** triggered action
5. Set trigger to **On Insert**
6. Set the webhook URL to: `https://your-project.web.app/caspioCalAIMNotesWebhook`
7. Set method to **POST**
8. Configure the payload to include these fields:
   ```json
   {
     "Client_ID2": "[@field:Client_ID2]",
     "Member_Name": "[@field:Member_Name]",
     "Note_Date": "[@field:Note_Date]",
     "Note_Content": "[@field:Note_Content]",
     "Staff_Name": "[@field:Staff_Name]",
     "Note_Type": "[@field:Note_Type]",
     "Priority": "[@field:Priority]",
     "Created_By": "[@field:Created_By]"
   }
   ```

#### connect_tbl_client_notes Table:
1. Navigate to the connect_tbl_client_notes table
2. Go to **Configure > Triggered Actions**
3. Create a new **Webhook** triggered action
4. Set trigger to **On Insert**
5. Set the webhook URL to: `https://your-project.web.app/caspioClientNotesWebhook`
6. Set method to **POST**
7. Configure the payload to include these fields (use Caspio's **Insert Field** button so tokens resolve):
   ```json
   {
     "secret": "[@out-hook:secret]",
      "Note_ID": "[@field:Note_ID]",
      "Client_ID": "[@field:Client_ID]",
      "Client_ID2": "[@field:Client_ID2]",
      "Client_Name": "[@field:Client_Name]",
      "Note_Date": "[@field:Note_Date]",
      "Note_Text": "[@field:Note_Text]",
      "Staff_Member": "[@field:Staff_Member]",
      "Note_Category": "[@field:Note_Category]",
      "Priority": "[@field:Priority]",
      "Follow_Up_Assignment": "[@field:Follow_Up_Assignment]",
      "Immediate": "[@field:Immediate]",
      "Immediate_Check": "[@field:Immediate_Check]",
      "Confirmed_Immediate_Sent": "[@field:Confirmed_Immediate_Sent]",
      "Created_By": "[@field:Created_By]"
   }
   ```

> If you see literal values like `[@field:Client_Name]` in Firebase logs, the tokens are not resolving. Re-open the webhook payload and re-insert each field using Caspio's **Insert Field** picker (do not hand-type). Also verify the field names exactly match your table column names.

### 2. Staff Email Mapping

The system is configured to send emails to these staff members:

- **JHernandez@ilshealth.com** - Primary recipient for CalAIM notes
- **jason@carehomefinders.com** - CC recipient
- **tang@carehomefinders.com** - CC recipient  
- **monica@carehomefinders.com** - CC recipient

### 3. User Account Setup

For staff to receive in-app notifications, they need user accounts in the CalAIM Tracker system:

1. Each staff member should create an account using their work email
2. Admin should assign appropriate roles (admin/super admin)
3. The system will automatically match emails to user accounts for notifications

## Testing the Integration

### 1. Test Webhook Endpoints

You can test the webhooks manually using curl or Postman:

```bash
# Test CalAIM Notes Webhook
curl -X POST https://your-project.web.app/caspioCalAIMNotesWebhook \
  -H "Content-Type: application/json" \
  -d '{
    "Client_ID2": "TEST123",
    "Member_Name": "Test Member",
    "Note_Date": "2026-01-11",
    "Note_Content": "This is a test note",
    "Staff_Name": "Test Staff",
    "Priority": "medium"
  }'

# Test Client Notes Webhook  
curl -X POST https://your-project.web.app/caspioClientNotesWebhook \
  -H "Content-Type: application/json" \
  -d '{
    "Client_ID": "TEST456",
    "Client_Name": "Test Client", 
    "Note_Date": "2026-01-11",
    "Note_Text": "This is a test client note",
    "Staff_Member": "Test Staff",
    "Priority": "high"
  }'
```

### 2. Verify Notifications

After setting up webhooks:

1. Add a new note in Caspio
2. Check that emails are sent to the configured recipients
3. Log into the CalAIM Tracker app
4. Verify that in-app notifications appear
5. Check the "My Notes" section to see stored notes
6. Super admins can view all notes in the "System Note Log"

## Notification Features

### Email Notifications
- Sent to all configured staff members
- Include note content, member/client info, and priority
- Professional HTML formatting

### In-App Notifications
- Real-time popup notifications (Cursor-style)
- Auto-dismiss after 8 seconds
- Click to view related application
- Sound notifications (configurable)

### Note Management
- **My Notes**: Personal view for each staff member
- **System Note Log**: Super admin view of all notes
- Search and filter capabilities
- Mark as read/unread
- Priority and type filtering

## Troubleshooting

### Common Issues

1. **Webhooks not firing**
   - Check Caspio webhook configuration
   - Verify trigger conditions
   - Test webhook URL manually

2. **Emails not sending**
   - Check Resend API key configuration
   - Verify email addresses in staff mapping
   - Check Firebase function logs

3. **In-app notifications not appearing**
   - Ensure user is logged in
   - Check user email matches staff mapping
   - Verify Firebase real-time listeners

4. **Notes not storing**
   - Check Firebase function logs
   - Verify Firestore permissions
   - Test webhook payload format

### Monitoring

- Firebase function logs: Check for webhook processing errors
- Firestore console: Verify notes are being stored
- Email delivery: Monitor Resend dashboard for email status

## Security Considerations

1. **Webhook Security**: Consider adding authentication to webhook endpoints
2. **Data Validation**: The system validates required fields before processing
3. **Email Privacy**: Emails contain sensitive patient information - ensure compliance
4. **Access Control**: Only authenticated staff can view notes

## Future Enhancements

Potential improvements:
- Webhook authentication/signatures
- Note editing capabilities
- Advanced filtering and search
- Mobile push notifications
- Integration with other Caspio tables
- Automated note categorization