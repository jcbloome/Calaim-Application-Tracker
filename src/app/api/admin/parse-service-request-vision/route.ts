/**
 * API Route: Parse Service Request Form Image using Vision
 * 
 * Accepts an image (converted from PDF in browser) and uses
 * Gemini Vision to extract structured data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Try multiple possible API key sources
const apiKey = process.env.GEMINI_API_KEY 
  || process.env.GOOGLE_API_KEY 
  || process.env.FIREBASE_API_KEY 
  || '';

const genAI = new GoogleGenerativeAI(apiKey);

interface ExtractedFields {
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  memberDob: string;
  memberCustomaryAddress: string;
  memberCustomaryCity: string;
  memberCustomaryState: string;
  memberCustomaryZip: string;
  memberCustomaryCounty: string;
  memberPhone: string;
  contactPhone: string;
  contactEmail: string;
  Authorization_Number_T038: string;
  Authorization_Start_T2038: string;
  Authorization_End_T2038: string;
  Diagnostic_Code: string;
}

export async function POST(request: NextRequest) {
  try {
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
  "memberDob": "",
  "memberCustomaryAddress": "",
  "memberCustomaryCity": "",
  "memberCustomaryState": "",
  "memberCustomaryZip": "",
  "memberCustomaryCounty": "",
  "memberPhone": "",
  "contactPhone": "",
  "contactEmail": "",
  "Authorization_Number_T038": "",
  "Authorization_Start_T2038": "",
  "Authorization_End_T2038": "",
  "Diagnostic_Code": ""
}

Instructions:
- Member Name: Split into first and last name
- MRN: Medical Record Number
- DOB: Format as MM/DD/YYYY
- Address: Split into street, city, state, zip (county can be empty)
- Member Phone: Format with dashes (e.g., 562-432-2700)
- Cell Phone: Use for contactPhone, format as digits only (e.g., 5624322700)
- Email: Lowercase
- Authorization Number: From "Authorization #" field
- Authorization Start/End: Format as MM/DD/YYYY
- Diagnostic Code: From "DX Code" field

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
    return NextResponse.json(
      { 
        error: 'Failed to parse PDF with vision',
        details: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
