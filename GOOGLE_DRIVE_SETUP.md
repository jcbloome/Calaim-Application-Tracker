# Google Drive API Setup Guide

## 🔧 Setting Up Real Google Drive Integration

To scan your actual 800+ CalAIM member folders, we need to set up Google Drive API credentials. We'll start with limited testing (10 folders) before scanning all folders.

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

Once set up, you can choose between:

### Test Scan (10 folders)
✅ **Quick Verification**: Test with just 10 folders to verify setup
✅ **Fast Results**: Complete in under 1 minute
✅ **Safe Testing**: No risk of hitting API limits
✅ **Real Data Preview**: See actual folder names and file counts

### Full Scan (800+ folders)
✅ **Complete Migration**: Process all member folders with pagination
✅ **Comprehensive Data**: Get file counts for every folder
✅ **Member Matching**: Compare all folders with Caspio records
✅ **Production Ready**: Handle rate limits and large datasets

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