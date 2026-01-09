# Caspio API Integration Setup

This document explains how to set up the direct Caspio API integration that replaces Make.com.

## 🔧 Environment Variables Required

Add these environment variables to your `.env` file:

```bash
# Caspio API Configuration
CASPIO_BASE_URL=https://c1abc123.caspio.com/rest/v2
CASPIO_CLIENT_ID=your_caspio_client_id
CASPIO_CLIENT_SECRET=your_caspio_client_secret
CASPIO_TABLE_NAME=Applications
```

## 🏗️ Caspio Database Setup

### 1. Create Application Table

Create a table in Caspio with the following fields:

| Field Name | Data Type | Length | Required | Notes |
|------------|-----------|---------|----------|-------|
| ApplicationID | Text | 50 | Yes | Primary Key |
| UserID | Text | 50 | Yes | Firebase UID |
| Status | Text | 20 | Yes | Application status |
| DateCreated | Date/Time | - | Yes | Creation timestamp |
| LastUpdated | Date/Time | - | Yes | Last update timestamp |
| MemberFirstName | Text | 100 | Yes | Member's first name |
| MemberLastName | Text | 100 | Yes | Member's last name |
| MemberDOB | Text | 10 | Yes | MM/DD/YYYY format |
| MemberAge | Number | - | No | Member's age |
| MemberMediCalNum | Text | 10 | Yes | Medi-Cal number |
| MemberMRN | Text | 50 | Yes | Medical record number |
| MemberLanguage | Text | 50 | Yes | Preferred language |
| MemberCounty | Text | 100 | Yes | County |
| ReferrerFirstName | Text | 100 | Yes | Referrer's first name |
| ReferrerLastName | Text | 100 | Yes | Referrer's last name |
| ReferrerEmail | Text | 255 | Yes | Referrer's email |
| ReferrerPhone | Text | 20 | Yes | Referrer's phone |
| ReferrerRelationship | Text | 100 | Yes | Relationship to member |
| Agency | Text | 255 | No | Referring agency |
| PrimaryContactFirstName | Text | 100 | Yes | Primary contact first name |
| PrimaryContactLastName | Text | 100 | Yes | Primary contact last name |
| PrimaryContactRelationship | Text | 100 | Yes | Relationship to member |
| PrimaryContactPhone | Text | 20 | Yes | Primary contact phone |
| PrimaryContactEmail | Text | 255 | Yes | Primary contact email |
| PrimaryContactLanguage | Text | 50 | Yes | Primary contact language |
| SecondaryContactFirstName | Text | 100 | No | Secondary contact first name |
| SecondaryContactLastName | Text | 100 | No | Secondary contact last name |
| SecondaryContactRelationship | Text | 100 | No | Relationship to member |
| SecondaryContactPhone | Text | 20 | No | Secondary contact phone |
| SecondaryContactEmail | Text | 255 | No | Secondary contact email |
| SecondaryContactLanguage | Text | 50 | No | Secondary contact language |
| HasCapacity | Text | 3 | Yes | Yes/No |
| HasLegalRep | Text | 3 | No | Yes/No |
| LegalRepFirstName | Text | 100 | No | Legal rep first name |
| LegalRepLastName | Text | 100 | No | Legal rep last name |
| LegalRepRelationship | Text | 100 | No | Relationship to member |
| LegalRepPhone | Text | 20 | No | Legal rep phone |
| LegalRepEmail | Text | 255 | No | Legal rep email |
| CurrentLocation | Text | 255 | Yes | Current location |
| CurrentAddress | Text | 255 | Yes | Current address |
| CurrentCity | Text | 100 | Yes | Current city |
| CurrentState | Text | 50 | Yes | Current state |
| CurrentZip | Text | 10 | Yes | Current ZIP code |
| CurrentCounty | Text | 100 | Yes | Current county |
| CustomaryLocationType | Text | 100 | Yes | Customary location type |
| CustomaryAddress | Text | 255 | Yes | Customary address |
| CustomaryCity | Text | 100 | Yes | Customary city |
| CustomaryState | Text | 50 | Yes | Customary state |
| CustomaryZip | Text | 10 | Yes | Customary ZIP code |
| CustomaryCounty | Text | 100 | Yes | Customary county |
| HealthPlan | Text | 50 | Yes | Kaiser/Health Net/Other |
| ExistingHealthPlan | Text | 100 | No | Existing health plan |
| SwitchingHealthPlan | Text | 3 | No | Yes/No/N/A |
| Pathway | Text | 50 | Yes | SNF Transition/SNF Diversion |
| MeetsPathwayCriteria | Yes/No | - | No | Boolean |
| SNFDiversionReason | Text | 500 | No | Reason for SNF diversion |
| ISPFirstName | Text | 100 | Yes | ISP first name |
| ISPLastName | Text | 100 | Yes | ISP last name |
| ISPRelationship | Text | 100 | Yes | ISP relationship |
| ISPPhone | Text | 20 | Yes | ISP phone |
| ISPEmail | Text | 255 | Yes | ISP email |
| ISPLocationType | Text | 100 | Yes | ISP location type |
| ISPAddress | Text | 255 | Yes | ISP address |
| ISPFacilityName | Text | 255 | Yes | ISP facility name |
| OnALWWaitlist | Text | 10 | Yes | Yes/No/Unknown |
| HasPrefRCFE | Text | 3 | Yes | Yes/No |
| RCFEName | Text | 255 | No | RCFE name |
| RCFEAddress | Text | 255 | No | RCFE address |
| RCFEAdminName | Text | 100 | No | RCFE admin name |
| RCFEAdminPhone | Text | 20 | No | RCFE admin phone |
| RCFEAdminEmail | Text | 255 | No | RCFE admin email |

### 2. Create API Credentials

1. Go to your Caspio account
2. Navigate to **Account** > **API & Security**
3. Click **Create New App**
4. Note down the **Client ID** and **Client Secret**
5. Set the appropriate permissions for your table

## 🚀 Benefits Over Make.com

### Cost Savings
- ❌ **Make.com**: $9-29/month + per-operation costs
- ✅ **Direct API**: Only Caspio costs (no middleman)

### Performance
- ❌ **Make.com**: 2-5 second delays through webhook processing
- ✅ **Direct API**: Sub-second response times

### Reliability
- ❌ **Make.com**: Multiple points of failure (Make.com + Caspio)
- ✅ **Direct API**: Single point of failure (just Caspio)

### Error Handling
- ❌ **Make.com**: Limited error visibility and debugging
- ✅ **Direct API**: Full error logs and detailed debugging

### Data Validation
- ❌ **Make.com**: Basic validation, potential data loss
- ✅ **Direct API**: Zod schema validation, guaranteed data integrity

## 🧪 Testing the Integration

### 1. Test Connection
Use the Super Admin page to test the Caspio connection:
- Go to `/admin/super`
- Click "Test Connection" button
- Verify successful connection

### 2. Test Data Sync
- Click "Send Test Data" button
- Check your Caspio table for the test record
- Verify all fields are populated correctly

### 3. Test Form Submission
- Submit a real application through the form
- Check that data appears in Caspio automatically
- Verify sync status in Firebase

## 🔄 Migration from Make.com

### 1. Backup Current Data
- Export all existing data from Caspio
- Document current Make.com workflows

### 2. Set Up New Integration
- Add environment variables
- Create Caspio table structure
- Test connection and data sync

### 3. Switch Over
- Update environment variables
- Deploy new code
- Monitor for any issues

### 4. Clean Up
- Disable Make.com scenarios
- Remove old webhook URLs
- Cancel Make.com subscription (if no longer needed)

## 🛠️ Troubleshooting

### Common Issues

**Connection Failed**
- Check `CASPIO_CLIENT_ID` and `CASPIO_CLIENT_SECRET`
- Verify `CASPIO_BASE_URL` is correct
- Ensure API credentials have proper permissions

**Data Not Syncing**
- Check Firebase logs for sync errors
- Verify table structure matches schema
- Check field name mappings

**Authentication Errors**
- Regenerate API credentials in Caspio
- Update environment variables
- Restart application

### Support
For technical support, check the application logs or contact the development team.