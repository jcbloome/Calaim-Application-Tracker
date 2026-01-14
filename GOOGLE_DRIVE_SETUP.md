# Google Drive API Setup Guide

## 🔧 Setting Up Real Google Drive Integration

To scan your actual 800+ CalAIM member folders, we need to set up Google Drive API credentials.

### Step 1: Create Google Cloud Project & Enable APIs

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing project
3. Enable the **Google Drive API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Drive API"
   - Click "Enable"

### Step 2: Create Service Account

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Fill in details:
   - **Name**: `calaim-drive-scanner`
   - **Description**: `Service account for scanning CalAIM member folders`
4. Click "Create and Continue"
5. Skip role assignment (click "Continue")
6. Click "Done"

### Step 3: Generate Service Account Key

1. Click on the created service account
2. Go to "Keys" tab
3. Click "Add Key" > "Create new key"
4. Select "JSON" format
5. Download the JSON file

### Step 4: Share Google Drive Folder

1. Open your CalAIM Members folder in Google Drive
2. Click "Share" button
3. Add the service account email (from the JSON file) as a **Viewer**
4. The email looks like: `calaim-drive-scanner@your-project.iam.gserviceaccount.com`

### Step 5: Set Firebase Secrets

Run these commands to set the secrets:

```bash
# Set the service account key (paste the entire JSON content)
firebase functions:secrets:set GOOGLE_SERVICE_ACCOUNT_KEY

# Set client credentials (from Google Cloud Console)
firebase functions:secrets:set GOOGLE_DRIVE_CLIENT_ID
firebase functions:secrets:set GOOGLE_DRIVE_CLIENT_SECRET
```

### Step 6: Deploy Functions

```bash
cd functions
npm run build
firebase deploy --only functions
```

## 🎯 What This Will Enable

Once set up, the scan will:

✅ **Connect to Real Google Drive**: Access your actual CalAIM Members folder
✅ **Scan 800+ Folders**: Process all member folders with pagination
✅ **Count Files**: Get actual file counts for each folder
✅ **Match Members**: Compare folder names with Caspio member records
✅ **Handle Rate Limits**: Respect Google API quotas and limits
✅ **Provide Real Data**: Show actual folder names, dates, and file counts

## 🔍 Expected Results

After running the real scan, you'll see:
- **Actual folder count** (should be 800+)
- **Real folder names** from your Google Drive
- **Accurate file counts** per folder
- **Match percentages** with Caspio members
- **Processing statistics** and performance metrics

## 🚨 Important Notes

- The service account needs **Viewer** access to the CalAIM Members folder
- API rate limits may slow down large scans (this is normal)
- The first scan may take 5-10 minutes for 800+ folders
- All data remains secure - we only read folder/file metadata

## 🔧 Troubleshooting

**"Folder not found"**: Check service account has access to the folder
**"API quota exceeded"**: Wait a few minutes and try again
**"Authentication failed"**: Verify the service account JSON is correct

Ready to proceed with setup? 🚀