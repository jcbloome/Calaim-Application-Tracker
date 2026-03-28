/**
 * Test script for Service Request PDF Extractor
 * 
 * Run this with:
 *   npx tsx scripts/pdf-extractor/test-extractor.ts
 * 
 * Or integrate into your Next.js page component
 */

import { ServiceRequestExtractor } from './service-request-extractor';
import * as fs from 'fs';
import * as path from 'path';

// Polyfill File for Node.js
class NodeFile {
  private buffer: Buffer;
  public name: string;
  public type: string;

  constructor(buffer: Buffer, name: string, options: { type: string }) {
    this.buffer = buffer;
    this.name = name;
    this.type = options.type;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.buffer.buffer.slice(
      this.buffer.byteOffset,
      this.buffer.byteOffset + this.buffer.byteLength
    );
  }
}

async function testExtractor() {
  // Path to your test PDF
  const pdfPath = 'c:\\Users\\Jason.Jason-PC\\AppData\\Roaming\\Cursor\\User\\workspaceStorage\\2871420c389bbb745bfd4b95a2ccaf63\\pdfs\\525fe811-013d-4835-a160-0636cc2c97a9\\02.05.26 JIM KOVACICH - ToCF Connections.pdf';
  
  console.log('Testing PDF Extractor...');
  console.log('PDF Path:', pdfPath);
  console.log('---\n');

  try {
    // Check if file exists
    if (!fs.existsSync(pdfPath)) {
      console.error('❌ PDF file not found at:', pdfPath);
      return;
    }

    // Read the PDF file
    const fileBuffer = fs.readFileSync(pdfPath);
    const fileName = path.basename(pdfPath);
    
    console.log(`📄 File loaded: ${fileName} (${fileBuffer.length} bytes)\n`);

    // Create a File-like object for Node.js
    const file = new NodeFile(fileBuffer, fileName, { type: 'application/pdf' }) as any;

    // Extract fields
    const extractor = new ServiceRequestExtractor();
    const result = await extractor.extractFromPdf(file);

    // Display results
    console.log('✅ EXTRACTION COMPLETE\n');
    
    console.log('📋 EXTRACTED FIELDS:');
    console.log(JSON.stringify(result.fields, null, 2));
    console.log('\n');

    console.log('🔑 PARSED FIELD KEYS:');
    console.log(result.parsedFieldKeys.join(', '));
    console.log('\n');

    if (result.warnings.length > 0) {
      console.log('⚠️  WARNINGS:');
      result.warnings.forEach(warning => console.log(`  - ${warning}`));
      console.log('\n');
    }

    console.log('📄 RAW TEXT PREVIEW (first 500 chars):');
    console.log(result.rawText.slice(0, 500));
    console.log('...\n');

    // Validation checks
    console.log('✓ VALIDATION:');
    const checks = [
      { field: 'Member Name', value: result.fields.memberFirstName && result.fields.memberLastName },
      { field: 'MRN', value: result.fields.memberMrn },
      { field: 'DOB', value: result.fields.memberDob },
      { field: 'Address', value: result.fields.memberCustomaryAddress },
      { field: 'Phone', value: result.fields.memberPhone || result.fields.contactPhone },
      { field: 'Email', value: result.fields.contactEmail },
      { field: 'Auth Number', value: result.fields.Authorization_Number_T038 },
      { field: 'Auth Start', value: result.fields.Authorization_Start_T2038 },
      { field: 'Auth End', value: result.fields.Authorization_End_T2038 },
      { field: 'Diagnostic Code', value: result.fields.Diagnostic_Code },
    ];

    checks.forEach(check => {
      const status = check.value ? '✓' : '✗';
      console.log(`  ${status} ${check.field}: ${check.value || 'NOT FOUND'}`);
    });

  } catch (error: any) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testExtractor();
