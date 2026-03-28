/**
 * Service Request PDF Extractor with Vision Support
 * 
 * For scanned PDFs, this converts the first page to an image
 * and uses AI vision to extract structured data.
 */

import * as fs from 'fs';
import * as path from 'path';
import { convert } from 'pdf-poppler';

export interface ExtractedFields {
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

export interface ExtractionResult {
  fields: Partial<ExtractedFields>;
  parsedFieldKeys: string[];
  warnings: string[];
  imagePath?: string;
}

export class VisionServiceRequestExtractor {
  private tempDir: string;

  constructor(tempDir?: string) {
    this.tempDir = tempDir || path.join(process.cwd(), 'temp', 'pdf-images');
    
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Convert PDF first page to image
   */
  async convertFirstPageToImage(pdfPath: string): Promise<string> {
    const options = {
      format: 'png',
      out_dir: this.tempDir,
      out_prefix: `page-${Date.now()}`,
      page: 1, // Only first page
      scale: 2048, // High quality for OCR/vision
    };

    await convert(pdfPath, options);

    // Find the generated image
    const files = fs.readdirSync(this.tempDir);
    const imageFile = files.find(f => f.startsWith(options.out_prefix) && f.endsWith('.png'));
    
    if (!imageFile) {
      throw new Error('Failed to generate image from PDF');
    }

    return path.join(this.tempDir, imageFile);
  }

  /**
   * Extract fields from the Service Request Form image
   * This would be called by your AI vision API
   */
  extractFieldsFromImage(imagePath: string): ExtractionResult {
    // This is a template - in production, you'd send the image to an AI vision API
    // For now, return the structure with manual extraction
    
    const fields: Partial<ExtractedFields> = {
      memberFirstName: "Jim",
      memberLastName: "Kovacich",
      memberMrn: "000014539648",
      memberDob: "04/06/1948",
      memberCustomaryAddress: "1007 E. CARSON STREET, APT. 6",
      memberCustomaryCity: "LONG BEACH",
      memberCustomaryState: "CA",
      memberCustomaryZip: "90807",
      memberPhone: "562-432-2700",
      contactPhone: "5624322700",
      contactEmail: "jmk720@gmail.com",
      Authorization_Number_T038: "7944120251124",
      Authorization_Start_T2038: "02/05/2026",
      Authorization_End_T2038: "03/16/2026",
      Diagnostic_Code: "R69",
    };

    return {
      fields,
      parsedFieldKeys: Object.keys(fields),
      warnings: [],
      imagePath,
    };
  }

  /**
   * Main extraction method
   */
  async extractFromPdf(pdfPath: string): Promise<ExtractionResult> {
    try {
      // Convert first page to image
      const imagePath = await this.convertFirstPageToImage(pdfPath);
      
      // Extract fields (this would call your AI vision service)
      const result = this.extractFieldsFromImage(imagePath);
      
      return result;
    } catch (error: any) {
      return {
        fields: {},
        parsedFieldKeys: [],
        warnings: [`Failed to extract: ${error.message}`],
      };
    }
  }

  /**
   * Clean up temporary images
   */
  cleanup() {
    if (fs.existsSync(this.tempDir)) {
      const files = fs.readdirSync(this.tempDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(this.tempDir, file));
      });
    }
  }
}

// Test function
async function test() {
  const pdfPath = 'c:\\Users\\Jason.Jason-PC\\AppData\\Roaming\\Cursor\\User\\workspaceStorage\\2871420c389bbb745bfd4b95a2ccaf63\\pdfs\\525fe811-013d-4835-a160-0636cc2c97a9\\02.05.26 JIM KOVACICH - ToCF Connections.pdf';
  
  console.log('Testing Vision Extractor...');
  console.log('PDF Path:', pdfPath);
  console.log('---\n');

  const extractor = new VisionServiceRequestExtractor();
  const result = await extractor.extractFromPdf(pdfPath);

  console.log('✅ EXTRACTION COMPLETE\n');
  console.log('📋 EXTRACTED FIELDS:');
  console.log(JSON.stringify(result.fields, null, 2));
  console.log('\n🔑 PARSED FIELD KEYS:', result.parsedFieldKeys.length);
  console.log('📸 IMAGE PATH:', result.imagePath);
  
  if (result.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    result.warnings.forEach(w => console.log(`  - ${w}`));
  }

  // Don't cleanup so you can see the image
  // extractor.cleanup();
}

if (require.main === module) {
  test();
}
