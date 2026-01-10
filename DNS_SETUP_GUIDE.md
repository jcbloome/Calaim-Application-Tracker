# DNS Configuration Guide for connectcalaim.com

## Current Issue
- `connectcalaim.com` works ✅
- `www.connectcalaim.com` doesn't work ❌

## Solution: Add WWW CNAME Record

### Steps to Fix:

1. **Go to your DNS provider** (where you registered connectcalaim.com)
   - This could be GoDaddy, Namecheap, Cloudflare, etc.

2. **Add a CNAME record:**
   ```
   Type: CNAME
   Name: www
   Value: connectcalaim.com
   TTL: Auto (or 3600)
   ```

3. **Alternative: Add A Records for www**
   If CNAME doesn't work, add these A records:
   ```
   Type: A
   Name: www
   Value: 199.36.158.100
   TTL: Auto (or 3600)
   ```

### Firebase App Hosting Configuration

Your Firebase App Hosting should already be configured correctly since the apex domain works. The issue is just the www subdomain not being properly redirected.

### Verification
After making the DNS changes:
1. Wait 5-15 minutes for DNS propagation
2. Test both URLs:
   - https://connectcalaim.com ✅
   - https://www.connectcalaim.com ✅

### Common DNS Providers:

**GoDaddy:**
1. Go to DNS Management
2. Add Record → CNAME
3. Host: www, Points to: connectcalaim.com

**Namecheap:**
1. Go to Advanced DNS
2. Add New Record → CNAME
3. Host: www, Value: connectcalaim.com

**Cloudflare:**
1. Go to DNS → Records
2. Add record → CNAME
3. Name: www, Target: connectcalaim.com

The key is making sure both the apex domain (connectcalaim.com) and the www subdomain (www.connectcalaim.com) point to your Firebase App Hosting.