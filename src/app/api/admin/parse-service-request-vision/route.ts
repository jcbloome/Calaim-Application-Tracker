/**
 * API Route: Parse Service Request Form Image using Vision
 * 
 * Accepts an image (converted from PDF in browser) and uses
 * Gemini Vision to extract structured data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Vision parser should only use Gemini/Google AI keys.
// Do not fall back to unrelated keys (like Firebase web keys), which can point to
// the wrong project/quota and cause confusing 429 errors.
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

const genAI = new GoogleGenerativeAI(apiKey);

interface ExtractedFields {
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  memberMediCalNum: string;
  confirmMemberMediCalNum: string;
  memberDob: string;
  memberCustomaryAddress: string;
  memberCustomaryCity: string;
  memberCustomaryState: string;
  memberCustomaryZip: string;
  memberCustomaryCounty: string;
  memberPhone: string;
  memberEmail: string;
  contactPhone: string;
  contactEmail: string;
  Authorization_Number_T038: string;
  Authorization_Start_T2038: string;
  Authorization_End_T2038: string;
  Diagnostic_Code: string;
  notes?: string;
}

const cleanText = (value: unknown) => String(value ?? '').trim();

const normalizeMediCalNumber = (value: string): string => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  const compact = raw.replace(/[^A-Z0-9]/g, '');
  if (/^9\d{7}[A-Z]$/.test(compact)) return compact;
  return raw;
};

const pickFirstNonEmpty = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = cleanText(source[key]);
    if (value) return value;
  }
  return '';
};

const splitAddressBlock = (raw: string) => {
  const input = cleanText(raw).replace(/\r/g, '\n');
  if (!input) return { street: '', city: '', state: '', zip: '' };

  const lines = input.split('\n').map((line) => line.trim()).filter(Boolean);
  const oneLine = lines.join(' ').replace(/\s{2,}/g, ' ').trim();
  const cityStateZipRegex = /(?:,\s*)?([A-Za-z][A-Za-z .'-]*?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/;

  const parseLine = (line: string) => {
    const match = line.match(cityStateZipRegex);
    if (!match) return { street: '', city: '', state: '', zip: '' };
    const street = line.slice(0, match.index || 0).replace(/[,\s]+$/, '').trim();
    return {
      street,
      city: cleanText(match[1]),
      state: cleanText(match[2]).toUpperCase(),
      zip: cleanText(match[3]),
    };
  };

  if (lines.length > 1) {
    const lastParsed = parseLine(lines[lines.length - 1]);
    if (lastParsed.city || lastParsed.state || lastParsed.zip) {
      const streetLines = lines.slice(0, -1).join(' ').trim();
      return {
        street: streetLines || lastParsed.street,
        city: lastParsed.city,
        state: lastParsed.state,
        zip: lastParsed.zip,
      };
    }
  }

  const parsed = parseLine(oneLine);
  if (parsed.city || parsed.state || parsed.zip || parsed.street) return parsed;
  return { street: oneLine, city: '', state: '', zip: '' };
};

export async function POST(request: NextRequest) {
  try {
    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'Vision parsing is not configured. Missing GEMINI_API_KEY or GOOGLE_API_KEY.',
          details: 'Set GEMINI_API_KEY (preferred) or GOOGLE_API_KEY for the parser route.',
        },
        { status: 503 }
      );
    }

    // Get the image file from the request
    const formData = await request.formData();
    const file = formData.get('image') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      );
    }

    console.log('[Vision API] Received image:', file.name, file.size, 'bytes');
    
    // Convert image to buffer
    const imageBuffer = Buffer.from(await file.arrayBuffer());
    console.log(`[Vision API] Image buffer ready: ${imageBuffer.length} bytes`);

    // Use Gemini Vision to extract fields
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are extracting data from a Kaiser Permanente Service Request Form.

Extract the following fields from the image and return ONLY a valid JSON object with these exact keys:

{
  "memberFirstName": "",
  "memberLastName": "",
  "memberMrn": "",
  "memberMediCalNum": "",
  "confirmMemberMediCalNum": "",
  "memberDob": "",
  "memberCustomaryAddress": "",
  "memberCustomaryCity": "",
  "memberCustomaryState": "",
  "memberCustomaryZip": "",
  "memberCustomaryCounty": "",
  "memberPhone": "",
  "memberEmail": "",
  "contactPhone": "",
  "contactEmail": "",
  "Authorization_Number_T038": "",
  "Authorization_Start_T2038": "",
  "Authorization_End_T2038": "",
  "Diagnostic_Code": "",
  "preferredLanguage": "",
  "age": "",
  "planId": "",
  "populationOfFocus": "",
  "providerName": "",
  "cptCode": "",
  "specialInstructions": ""
}

Instructions:
- Member Name: Split into first and last name, use Title Case (e.g., "Jim Kovacich" not "JIM KOVACICH")
- MRN: Medical Record Number (keep as-is)
- Medi-Cal Number: Use the value under CIN (if present), normalize to 9XXXXXXXX format ending with a letter when possible
- Do not copy MRN into Medi-Cal Number unless the form explicitly shows the same value for both
- DOB: Format as MM/DD/YYYY
- Address: Split into street, city, state, zip (county can be empty), use Title Case for street and city
- State: Two-letter uppercase code (e.g., "CA")
- Member Phone: Format with dashes (e.g., 562-432-2700)
- Cell Phone: Use for contactPhone, format as digits only (e.g., 5624322700)
- Member Email: Extract from the "Email" field under Member Information and return as lowercase
- Contact Email: Leave empty unless the form explicitly has a separate contact-person email field
- Authorization Number: From "Authorization #" field (keep as-is)
- Authorization Start/End: Format as MM/DD/YYYY
- Diagnostic Code: From "DX Code" field (keep as-is)
- Preferred Language, Age, Plan ID, Population of Focus, Provider, CPT Code, and Special Instructions/Comments: extract if present; leave empty if not shown

IMPORTANT: Use proper Title Case for names, addresses, and cities (First Letter Of Each Word Capitalized).
Do NOT return ALL CAPS text.

Return ONLY the JSON object, no other text.`;

    const imagePart = {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType: 'image/png',
      },
    };

    console.log('[Vision API] Sending to Gemini...');
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const responseText = response.text();
    console.log('[Vision API] Gemini response received');

    // Extract JSON from response (in case there's extra text)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from AI response');
    }

    const extractedFields: Partial<ExtractedFields> = JSON.parse(jsonMatch[0]);
    const extractedAny = extractedFields as Record<string, unknown>;

    // Address fallback: Vision responses occasionally place address in alternate keys
    // or as a single combined block. Normalize into memberCustomary* fields.
    const addressRaw =
      cleanText(extractedFields.memberCustomaryAddress) ||
      pickFirstNonEmpty(extractedAny, [
        'memberAddress',
        'member_address',
        'memberStreetAddress',
        'memberStreet',
        'address',
        'Address',
        'Member Address',
      ]);
    const splitAddress = splitAddressBlock(addressRaw);
    const cityFallback = pickFirstNonEmpty(extractedAny, ['memberCity', 'city', 'City']);
    const stateFallback = pickFirstNonEmpty(extractedAny, ['memberState', 'state', 'State']).toUpperCase();
    const zipFallback = pickFirstNonEmpty(extractedAny, ['memberZip', 'zip', 'Zip']);

    if (!cleanText(extractedFields.memberCustomaryAddress) && splitAddress.street) {
      extractedFields.memberCustomaryAddress = splitAddress.street;
    }
    if (!cleanText(extractedFields.memberCustomaryCity) && (splitAddress.city || cityFallback)) {
      extractedFields.memberCustomaryCity = splitAddress.city || cityFallback;
    }
    if (!cleanText(extractedFields.memberCustomaryState) && (splitAddress.state || stateFallback)) {
      extractedFields.memberCustomaryState = splitAddress.state || stateFallback;
    }
    if (!cleanText(extractedFields.memberCustomaryZip) && (splitAddress.zip || zipFallback)) {
      extractedFields.memberCustomaryZip = splitAddress.zip || zipFallback;
    }

    // Format fields to proper case (Title Case for names/addresses, etc.)
    const formatToTitleCase = (text: string): string => {
      if (!text) return text;
      return text
        .toLowerCase()
        .split(' ')
        .map(word => {
          // Keep common abbreviations uppercase
          if (['apt', 'ste', 'po', 'ca', 'st', 'rd', 'ave', 'dr', 'ln', 'blvd'].includes(word.toLowerCase())) {
            return word.toUpperCase();
          }
          // Capitalize first letter of each word
          return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
    };

    // Apply formatting to name and address fields
    if (extractedFields.memberFirstName) {
      extractedFields.memberFirstName = formatToTitleCase(extractedFields.memberFirstName);
    }
    if (extractedFields.memberLastName) {
      extractedFields.memberLastName = formatToTitleCase(extractedFields.memberLastName);
    }
    if (extractedFields.memberCustomaryAddress) {
      extractedFields.memberCustomaryAddress = formatToTitleCase(extractedFields.memberCustomaryAddress);
    }
    if (extractedFields.memberCustomaryCity) {
      extractedFields.memberCustomaryCity = formatToTitleCase(extractedFields.memberCustomaryCity);
    }
    if (extractedFields.memberCustomaryCounty) {
      extractedFields.memberCustomaryCounty = formatToTitleCase(extractedFields.memberCustomaryCounty);
    }
    // State should always be uppercase
    if (extractedFields.memberCustomaryState) {
      extractedFields.memberCustomaryState = extractedFields.memberCustomaryState.toUpperCase();
    }
    const memberEmailFallback = pickFirstNonEmpty(extractedAny, [
      'memberEmail',
      'Member Email',
      'email',
      'Email',
    ]);
    if (!cleanText(extractedFields.memberEmail) && memberEmailFallback) {
      extractedFields.memberEmail = memberEmailFallback;
    }
    if (extractedFields.memberEmail) {
      extractedFields.memberEmail = extractedFields.memberEmail.toLowerCase();
    }
    // Email should always be lowercase
    if (extractedFields.contactEmail) {
      extractedFields.contactEmail = extractedFields.contactEmail.toLowerCase();
    }
    if (extractedFields.memberMediCalNum) {
      extractedFields.memberMediCalNum = normalizeMediCalNumber(extractedFields.memberMediCalNum);
      extractedFields.confirmMemberMediCalNum = extractedFields.memberMediCalNum;
    }

    const extraNoteLines = [
      'Single Auth PDF Details',
      cleanText(extractedAny.preferredLanguage) ? `Preferred Language: ${cleanText(extractedAny.preferredLanguage)}` : '',
      cleanText(extractedAny.age) ? `Age: ${cleanText(extractedAny.age)}` : '',
      cleanText(extractedAny.planId) ? `Plan ID: ${cleanText(extractedAny.planId)}` : '',
      cleanText(extractedAny.populationOfFocus) ? `Population of Focus: ${cleanText(extractedAny.populationOfFocus)}` : '',
      cleanText(extractedAny.providerName) ? `Provider: ${cleanText(extractedAny.providerName)}` : '',
      cleanText(extractedAny.cptCode) ? `CPT Code: ${cleanText(extractedAny.cptCode)}` : '',
      cleanText(extractedAny.specialInstructions) ? `Special Instructions: ${cleanText(extractedAny.specialInstructions)}` : '',
    ].filter(Boolean);
    if (extraNoteLines.length > 1) {
      extractedFields.notes = extraNoteLines.join('\n');
    }
    [
      'preferredLanguage',
      'age',
      'planId',
      'populationOfFocus',
      'providerName',
      'cptCode',
      'specialInstructions',
    ].forEach((key) => {
      delete extractedAny[key];
    });

    // Filter out empty fields
    const parsedFieldKeys = Object.keys(extractedFields).filter(
      key => extractedFields[key as keyof ExtractedFields]
    );

    return NextResponse.json({
      fields: extractedFields,
      parsedFieldKeys,
      warnings: parsedFieldKeys.length === 0 
        ? ['No fields could be extracted from the PDF'] 
        : [],
    });

  } catch (error: any) {
    console.error('[Vision API] Error:', error);
    console.error('[Vision API] Stack:', error.stack);
    const details = String(error?.message || '').trim();
    const lowered = details.toLowerCase();
    const isQuotaError =
      lowered.includes('prepayment credits are depleted') ||
      lowered.includes('quota') ||
      lowered.includes('too many requests');
    const status = isQuotaError ? 429 : 500;
    const publicError = isQuotaError
      ? 'Vision parsing is temporarily unavailable (Gemini credits/quota reached).'
      : 'Failed to parse PDF with vision';
    return NextResponse.json(
      { 
        error: publicError,
        details: details || 'Unknown vision parser error.',
        stack: error.stack,
      },
      { status }
    );
  }
}
