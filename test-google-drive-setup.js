// Quick test script to verify Google Drive API setup
// Run with: node test-google-drive-setup.js
// This tests your service account credentials before deploying to Firebase

const { google } = require('googleapis');
const fs = require('fs');

async function testGoogleDriveSetup() {
  try {
    console.log('🔍 Testing Google Drive API setup...');
    
    // Check if service account key file exists
    const serviceAccountPath = './service-account-key.json'; // You'll need to save your JSON here
    
    if (!fs.existsSync(serviceAccountPath)) {
      console.log('❌ Service account key file not found');
      console.log('📝 Please save your downloaded JSON file as "service-account-key.json"');
      return;
    }
    
    // Load service account credentials
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    console.log('✅ Service account key loaded');
    console.log(`📧 Service account email: ${serviceAccount.client_email}`);
    
    // Initialize Google Drive API
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    
    const drive = google.drive({ version: 'v3', auth });
    console.log('✅ Google Drive API initialized');
    
    // Test folder access
    const folderId = '1WVNVYWDfzEmHkIK7dFBREIy2If8UnovG'; // Your CalAIM Members folder
    
    console.log('🔍 Testing access to CalAIM Members folder...');
    const folderResponse = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, mimeType'
    });
    
    console.log('✅ Folder access successful!');
    console.log(`📁 Folder name: ${folderResponse.data.name}`);
    
    // Test listing subfolders
    console.log('🔍 Testing subfolder listing...');
    const listResponse = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      pageSize: 10,
      fields: 'files(id, name)',
      orderBy: 'name'
    });
    
    const folders = listResponse.data.files || [];
    console.log(`✅ Found ${folders.length} subfolders (showing first 10):`);
    
    folders.forEach((folder, index) => {
      console.log(`   ${index + 1}. ${folder.name}`);
    });
    
    console.log('\n🎉 Google Drive setup is working correctly!');
    console.log('🚀 You can now run the real folder scan in your app');
    
  } catch (error) {
    console.error('❌ Setup test failed:', error.message);
    
    if (error.code === 403) {
      console.log('🔧 Permission issue - make sure:');
      console.log('   1. Service account email is shared with CalAIM Members folder');
      console.log('   2. Service account has Viewer permissions');
    } else if (error.code === 404) {
      console.log('🔧 Folder not found - check:');
      console.log('   1. Folder ID is correct');
      console.log('   2. Service account has access to the folder');
    }
  }
}

testGoogleDriveSetup();