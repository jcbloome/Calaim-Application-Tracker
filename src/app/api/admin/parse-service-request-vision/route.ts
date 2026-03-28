/**
 * API Route: Parse Service Request PDF using Vision
 * 
 * For scanned PDFs, this converts the first page to an image
 * and uses AI vision (Claude) to extract structured data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { convert } from 'pdf-poppler';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

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
  let tempPdfPath: string | null = null;
  let tempImageDir: string | null = null;

  try {
    // Get the PDF file from the request
    const formData = await request.formData();
    const file = formData.get('pdf') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No PDF file provided' },
        { status: 400 }
      );
    }

    // Create temp directory for processing
    tempImageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-vision-'));
    
    // Save PDF to temp file
    const pdfBuffer = Buffer.from(await file.arrayBuffer());
    tempPdfPath = path.join(tempImageDir, 'temp.pdf');
    fs.writeFileSync(tempPdfPath, pdfBuffer);

    // Convert first page to PNG
    const options = {
      format: 'png',
      out_dir: tempImageDir,
      out_prefix: 'page',
      page: 1, // Only first page (second page is HIPAA notice)
      scale: 2048, // High quality for vision
    };

    await convert(tempPdfPath, options);

    // Find the generated image
    const files = fs.readdirSync(tempImageDir);
    const imageFile = files.find(f => f.startsWith('page') && f.endsWith('.png'));

    if (!imageFile) {
      return NextResponse.json(
        { error: 'Failed to convert PDF to image' },
        { status: 500 }
      );
    }

    const imagePath = path.join(tempImageDir, imageFile);
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    // Use Claude Vision to extract fields
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

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    // Parse the response
    const responseText = message.content[0].type === 'text' 
      ? message.content[0].text 
      : '';

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
    console.error('Vision PDF parsing error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to parse PDF with vision',
        details: error.message,
      },
      { status: 500 }
    );
  } finally {
    // Cleanup temp files
    if (tempImageDir && fs.existsSync(tempImageDir)) {
      try {
        const files = fs.readdirSync(tempImageDir);
        files.forEach(file => {
          fs.unlinkSync(path.join(tempImageDir!, file));
        });
        fs.rmdirSync(tempImageDir);
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }
  }
}
