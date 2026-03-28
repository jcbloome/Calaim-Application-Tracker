# PDF Vision Extraction - Integration Complete ✅

## What Was Integrated

The Kaiser Service Request PDF extractor with AI vision support has been fully integrated into your application.

## How It Works

### Automatic Detection
When you upload a PDF on the "Create Application for Member" page:

1. **Text-based PDFs** (digital): Extracts text directly using the existing parser
2. **Scanned PDFs** (image-based): Automatically detects no text layer and uses AI vision

### Vision Extraction Process
For scanned PDFs like the Jim Kovacich example:

1. PDF is sent to the server
2. First page is converted to high-quality PNG (page 2 is skipped - it's just HIPAA notice)
3. Image is sent to Claude Vision API
4. AI extracts all 14 required fields
5. Fields are automatically populated in the form

## Files Modified

### 1. Create Application Page
**File**: `src/app/admin/applications/create/page.tsx`

- Added vision fallback when no text layer is detected
- Updated parse mode to include 'vision' option
- Shows "Using AI vision to extract fields..." toast for scanned PDFs

### 2. Vision API Route
**File**: `src/app/api/admin/parse-service-request-vision/route.ts`

- New API endpoint for vision-based extraction
- Converts PDF first page to image
- Uses Claude 3.5 Sonnet for field extraction
- Returns structured JSON matching your field names

### 3. Environment Variables
**File**: `.env.local`

- Added `ANTHROPIC_API_KEY` placeholder

## Setup Required

### 1. Get Anthropic API Key

1. Go to https://console.anthropic.com/
2. Sign up or log in
3. Create a new API key
4. Copy the key

### 2. Add to Environment

Update `.env.local`:

```bash
ANTHROPIC_API_KEY=sk-ant-api03-your-actual-key-here
```

### 3. Restart Dev Server

```bash
npm run dev
```

## Testing

### Test with the Jim Kovacich PDF

1. Go to Admin → Applications → Create Application
2. Select "Kaiser Auth Received (via ILS)"
3. Upload: `02.05.26 JIM KOVACICH - ToCF Connections.pdf`
4. Click "Parse PDF & Autofill"
5. Should see: "Using AI vision to extract fields..."
6. All 14 fields should be populated:
   - ✅ Member Name: Jim Kovacich
   - ✅ MRN: 000014539648
   - ✅ DOB: 04/06/1948
   - ✅ Address: 1007 E. CARSON STREET, APT. 6, LONG BEACH, CA 90807
   - ✅ Phone: 562-432-2700
   - ✅ Cell: 5624322700
   - ✅ Email: jmk720@gmail.com
   - ✅ Auth #: 7944120251124
   - ✅ Auth Start: 02/05/2026
   - ✅ Auth End: 03/16/2026
   - ✅ Diagnostic Code: R69

## Features

### ✅ Automatic Fallback
- Tries text extraction first (fast, free)
- Falls back to vision for scanned PDFs (accurate, uses API credits)

### ✅ Smart Page Selection
- Only processes page 1 (data)
- Skips page 2 (HIPAA notice)

### ✅ Comprehensive Field Extraction
- All 14 required fields
- Proper date formatting (MM/DD/YYYY)
- Address parsing (street, city, state, zip)
- Phone number formatting

### ✅ Error Handling
- Graceful fallback if vision fails
- Clear user feedback via toasts
- Temp file cleanup

## Cost Considerations

### Anthropic API Pricing (as of 2026)
- Claude 3.5 Sonnet: ~$3 per 1M input tokens
- Each PDF image: ~1,500 tokens
- **Cost per PDF**: ~$0.0045 (less than half a cent)

### When Vision is Used
- Only for scanned PDFs (no text layer)
- Not used for digital PDFs with text

## Troubleshooting

### "No API key" error
- Make sure `ANTHROPIC_API_KEY` is set in `.env.local`
- Restart your dev server after adding the key

### "Failed to convert PDF"
- Ensure `pdf-poppler` is installed: `npm install pdf-poppler`
- Requires system poppler-utils (should work on Windows with the npm package)

### "No fields extracted"
- Check if the PDF format is different from Kaiser Service Request Form
- May need to adjust the AI prompt in the API route

### Vision not triggering
- Check browser console for errors
- Verify the PDF truly has no text layer (try copying text from it)

## Next Steps

1. **Add your Anthropic API key** to `.env.local`
2. **Test with a scanned PDF** to verify it works
3. **Monitor API usage** in Anthropic console if needed

## Support Files

All extraction logic and utilities are in:
- `scripts/pdf-extractor/service-request-extractor.ts` - Text extraction
- `scripts/pdf-extractor/vision-extractor.ts` - Vision extraction utilities
- `scripts/pdf-extractor/EXTRACTION-EXAMPLE.md` - Example output
- `scripts/pdf-extractor/extracted-data.json` - Sample extracted data

---

**Status**: ✅ Ready to use (just add API key)
