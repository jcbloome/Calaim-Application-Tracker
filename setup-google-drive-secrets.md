# Google Drive API Setup Commands

## Step 1: Set Service Account Key
Copy the entire contents of your downloaded JSON file and run:

```bash
firebase functions:secrets:set GOOGLE_SERVICE_ACCOUNT_KEY
```

When prompted, paste the entire JSON content (it should look like):
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "calaim-drive-scanner@your-project.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

## Step 2: Set Client Credentials (Optional - for OAuth if needed)
```bash
firebase functions:secrets:set GOOGLE_DRIVE_CLIENT_ID
firebase functions:secrets:set GOOGLE_DRIVE_CLIENT_SECRET
```

## Step 3: Deploy Updated Functions
```bash
cd functions
npm run build
firebase deploy --only functions:scanCalAIMDriveFolders
```

## Step 4: Test Real Scan
Navigate to `/admin/migrate-drive` and click "Scan CalAIM Members Folder"

You should see real results like:
```
📂 Starting REAL scan of CalAIM Members folder: 1WVNVYWDfzEmHkIK7dFBREIy2If8UnovG
📄 Processing batch 1 (first batch)
📁 Found 127 folders in batch 1
📊 Progress: 50 folders processed...
📊 Progress: 100 folders processed...
📄 Processing batch 2 (token: AbCdEf...)
📁 Found 98 folders in batch 2
... (continues for all your folders)
✅ REAL SCAN COMPLETE! Processed 847 actual member folders across 9 batches
```