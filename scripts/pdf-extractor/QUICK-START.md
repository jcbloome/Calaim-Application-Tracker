# Quick Start - PDF Vision Extraction with Gemini

## ✅ What's Ready

Your application now automatically extracts data from **scanned** Kaiser Service Request PDFs using Google Gemini Vision.

## 🚀 Setup (2 minutes)

### Step 1: Get Your Gemini API Key

1. Go to https://aistudio.google.com/app/apikey
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Copy the key (starts with `AIzaSy...`)

### Step 2: Add to Environment

Open `.env.local` and add:

```bash
GEMINI_API_KEY=AIzaSy...your-actual-key-here
```

### Step 3: Restart Dev Server

```bash
npm run dev
```

## 🧪 Test It

1. Go to **Admin → Applications → Create Application**
2. Select **"Kaiser Auth Received (via ILS)"**
3. Upload a scanned PDF (like `02.05.26 JIM KOVACICH - ToCF Connections.pdf`)
4. Click **"Parse PDF & Autofill"**
5. Watch it extract all 14 fields automatically!

## 💰 Cost

- **FREE**: 15 requests per minute
- After free tier: ~$0.0001 per PDF (essentially free)
- No credit card required for free tier

## 🎯 What Gets Extracted

From scanned PDFs:
- ✅ Member Name (First/Last)
- ✅ MRN
- ✅ DOB
- ✅ Full Address (street, city, state, zip)
- ✅ Phone & Cell Phone
- ✅ Email
- ✅ Authorization Number
- ✅ Authorization Start/End Dates
- ✅ Diagnostic Code

## 🔄 How It Works

1. **Digital PDFs** (with text): Uses fast text extraction (free, instant)
2. **Scanned PDFs** (images): Automatically detects and uses Gemini Vision (free tier)

You don't need to do anything - it chooses the right method automatically!

## ❓ Troubleshooting

### "No API key" error
- Make sure you added `GEMINI_API_KEY` to `.env.local`
- Restart your dev server

### "API quota exceeded"
- Free tier limit: 15 requests/minute
- Wait a minute or enable billing (still very cheap)

### Not extracting fields
- Check if the PDF is truly scanned (try copying text from it)
- Verify your API key is valid

## 📚 More Info

- Full documentation: `scripts/pdf-extractor/INTEGRATION-COMPLETE.md`
- Example extraction: `scripts/pdf-extractor/EXTRACTION-EXAMPLE.md`
- Test utilities: `scripts/pdf-extractor/test-extractor.ts`

---

**Status**: ✅ Ready to use - just add your Gemini API key!
