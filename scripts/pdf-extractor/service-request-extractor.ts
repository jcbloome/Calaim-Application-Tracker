/**
 * Kaiser Service Request Form PDF Extractor
 * 
 * This extractor is designed for Kaiser Permanente Service Request Forms
 * with the following layout:
 * 
 * MEMBER INFORMATION section:
 *   - Member Name
 *   - MRN (Medical Record Number)
 *   - DOB (Date of Birth)
 *   - Member Address (street, city, state, zip, county)
 *   - Member Phone
 *   - Cell Phone
 *   - Email
 * 
 * AUTHORIZATION section:
 *   - Authorization Number
 *   - Start Date
 *   - End Date
 *   - Diagnostic Code
 * 
 * Usage:
 *   const extractor = new ServiceRequestExtractor();
 *   const result = await extractor.extractFromPdf(pdfFile);
 *   console.log(result.fields);
 */

export interface ExtractedFields {
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  memberDob: string; // MM/DD/YYYY
  memberCustomaryAddress: string;
  memberCustomaryCity: string;
  memberCustomaryState: string;
  memberCustomaryZip: string;
  memberCustomaryCounty: string;
  memberPhone: string;
  contactPhone: string; // Cell phone
  contactEmail: string;
  Authorization_Number_T038: string;
  Authorization_Start_T2038: string; // MM/DD/YYYY
  Authorization_End_T2038: string; // MM/DD/YYYY
  Diagnostic_Code: string;
}

export interface ExtractionResult {
  fields: Partial<ExtractedFields>;
  parsedFieldKeys: string[];
  warnings: string[];
  rawText: string;
}

export class ServiceRequestExtractor {
  /**
   * Extract fields from a PDF file
   * @param file - The PDF file to extract from
   * @returns Extraction result with fields, warnings, and raw text
   */
  async extractFromPdf(file: File): Promise<ExtractionResult> {
    const text = await this.extractTextFromPdf(file);
    return this.extractFieldsFromText(text, file.name);
  }

  /**
   * Extract text from PDF using pdf.js
   * This assumes you have pdfjs-dist installed
   */
  private async extractTextFromPdf(file: File): Promise<string> {
    // Dynamic import - use legacy build for Node.js
    let pdfjs: any;
    
    if (typeof window === 'undefined') {
      // Node.js environment - use legacy build
      pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    } else {
      // Browser environment
      pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
    }

    const bytes = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      disableWorker: true,
    });

    const pdf = await loadingTask.promise;
    const lines: string[] = [];
    const maxPages = Math.min(pdf.numPages, 8);

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      for (const item of textContent.items) {
        if ('str' in item && item.str.trim()) {
          lines.push(item.str.trim());
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Extract structured fields from raw PDF text
   */
  extractFieldsFromText(text: string, fileName: string = ''): ExtractionResult {
    const lines = text
      .split(/\r?\n/)
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const fields: Partial<ExtractedFields> = {};
    const parsedFieldKeys: string[] = [];
    const warnings: string[] = [];

    // Get sections
    const memberSection = this.getSectionLines(
      lines,
      [/^\s*member\s*information\s*$/i, /^\s*patient\s*information\s*$/i],
      [/^\s*authorization\s*$/i, /^\s*provider\s*$/i]
    );

    const authSection = this.getSectionLines(
      lines,
      [/^\s*authorization\s*$/i],
      [/^\s*provider\s*$/i, /^\s*population\s*of\s*focus\s*$/i]
    );

    // Extract Member Name
    const memberNameRaw = this.extractField(
      memberSection,
      [/^\s*member\s*name\s*$/i, /^\s*patient\s*name\s*$/i],
      [/^\s*mrn\s*$/i, /^\s*dob\s*$/i]
    ) || this.extractFromFileName(fileName);

    if (memberNameRaw) {
      const parsedName = this.parseName(memberNameRaw);
      if (parsedName.firstName) {
        fields.memberFirstName = parsedName.firstName;
        parsedFieldKeys.push('memberFirstName');
      }
      if (parsedName.lastName) {
        fields.memberLastName = parsedName.lastName;
        parsedFieldKeys.push('memberLastName');
      }
    }

    // Extract MRN
    const mrn = this.extractField(
      memberSection,
      [/^\s*mrn\s*$/i, /\bmedical\s*record\s*(?:number|no\.?|#)\b/i],
      [/^\s*dob\s*$/i]
    ) || this.findPattern(text, [/\bmrn\b\s*[:#-]?\s*([A-Z0-9-]{4,})/i]);

    if (mrn) {
      fields.memberMrn = mrn;
      parsedFieldKeys.push('memberMrn');
    }

    // Extract DOB
    const dob = this.extractField(
      memberSection,
      [/^\s*dob\s*$/i, /\bdate\s*of\s*birth\b/i],
      [/^\s*member\s*address\s*$/i]
    ) || this.findPattern(text, [/\b(?:dob|date\s*of\s*birth)\b\s*[:#-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i]);

    if (dob) {
      fields.memberDob = this.formatDate(dob);
      parsedFieldKeys.push('memberDob');
    }

    // Extract Address
    const address = this.extractAddress(memberSection);
    if (address.street) {
      fields.memberCustomaryAddress = address.street;
      parsedFieldKeys.push('memberCustomaryAddress');
    }
    if (address.city) {
      fields.memberCustomaryCity = address.city;
      parsedFieldKeys.push('memberCustomaryCity');
    }
    if (address.state) {
      fields.memberCustomaryState = address.state;
      parsedFieldKeys.push('memberCustomaryState');
    }
    if (address.zip) {
      fields.memberCustomaryZip = address.zip;
      parsedFieldKeys.push('memberCustomaryZip');
    }
    if (address.county) {
      fields.memberCustomaryCounty = address.county;
      parsedFieldKeys.push('memberCustomaryCounty');
    }

    // Extract Phones
    const memberPhone = this.extractField(
      memberSection,
      [/^\s*member\s*phone\s*$/i, /^\s*patient\s*phone\s*$/i, /^\s*phone\s*$/i],
      [/^\s*cell\s*phone\s*$/i, /^\s*email\s*$/i]
    );

    const cellPhone = this.extractField(
      memberSection,
      [/^\s*cell\s*phone\s*$/i, /^\s*mobile\s*phone\s*$/i],
      [/^\s*email\s*$/i]
    );

    const effectivePhone = cellPhone || memberPhone;
    if (effectivePhone) {
      const cleanPhone = effectivePhone.replace(/[^\d\-]/g, '');
      fields.memberPhone = cleanPhone;
      fields.contactPhone = effectivePhone.replace(/[^\d.()-]/g, '');
      parsedFieldKeys.push('memberPhone', 'contactPhone');
    }

    // Extract Email
    const email = this.extractField(
      memberSection,
      [/^\s*member\s*email\s*$/i, /^\s*patient\s*email\s*$/i, /^\s*email\s*$/i],
      []
    ) || this.findPattern(text, [/([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})/i]);

    if (email) {
      fields.contactEmail = email.toLowerCase();
      parsedFieldKeys.push('contactEmail');
    }

    // Extract Authorization Number
    const authNumber = this.extractField(
      authSection,
      [/^\s*authorization\s*(?:number|no\.?|#)\s*$/i, /^\s*ref(?:erence)?\s*(?:number|no\.?|#)\s*$/i],
      [/^\s*start\s*$/i, /^\s*end\s*$/i]
    ) || this.findPattern(text, [/\b(?:authorization|auth|reference)\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9\-]{4,})/i]);

    if (authNumber) {
      fields.Authorization_Number_T038 = authNumber;
      parsedFieldKeys.push('Authorization_Number_T038');
    }

    // Extract Authorization Start Date
    const authStart = this.extractField(
      authSection,
      [/^\s*authorization\s*start\b/i, /^\s*effective\s*date\b/i, /^\s*start\s*date\b/i],
      [/^\s*end\s*date\s*$/i]
    ) || this.findPattern(text, [/\b(?:authorization\s*start|effective\s*date|start\s*date)\b\s*[:#-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i]);

    if (authStart) {
      fields.Authorization_Start_T2038 = this.formatDate(authStart);
      parsedFieldKeys.push('Authorization_Start_T2038');
    }

    // Extract Authorization End Date
    const authEnd = this.extractField(
      authSection,
      [/^\s*authorization\s*end\b/i, /^\s*end\s*date\b/i, /^\s*termination\s*date\b/i],
      []
    ) || this.findPattern(text, [/\b(?:authorization\s*end|end\s*date|termination\s*date)\b\s*[:#-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i]);

    if (authEnd) {
      fields.Authorization_End_T2038 = this.formatDate(authEnd);
      parsedFieldKeys.push('Authorization_End_T2038');
    }

    // Extract Diagnostic Code
    const diagnosticCode = this.extractField(
      memberSection,
      [/^\s*diagnostic\s*code\b/i, /^\s*diagnosis\s*code\b/i, /^\s*icd(?:-10)?\b/i],
      [/^\s*authorization\s*$/i]
    ) || this.findPattern(text, [/\b(?:diagnostic|diagnosis|dx)\s*code\b\s*[:#-]?\s*([A-Z0-9.\-]{3,10})/i, /\bicd(?:-10)?\s*[:#-]?\s*([A-Z0-9.\-]{3,10})/i]);

    if (diagnosticCode) {
      fields.Diagnostic_Code = diagnosticCode;
      parsedFieldKeys.push('Diagnostic_Code');
    }

    // Add warnings
    if (parsedFieldKeys.length === 0) {
      warnings.push('No recognizable fields found. The PDF may be scanned or use different labels.');
    }

    if (!text || text.length < 50) {
      warnings.push('Very little text extracted. This may be a scanned PDF requiring OCR.');
    }

    return {
      fields,
      parsedFieldKeys,
      warnings,
      rawText: text,
    };
  }

  /**
   * Get lines between section markers
   */
  private getSectionLines(
    lines: string[],
    startPatterns: RegExp[],
    endPatterns: RegExp[]
  ): string[] {
    if (lines.length === 0) return [];

    const startIndex = lines.findIndex(line =>
      startPatterns.some(pattern => pattern.test(line))
    );

    if (startIndex < 0) return [];

    let endIndex = lines.length;
    for (let i = startIndex + 1; i < lines.length; i++) {
      if (endPatterns.some(pattern => pattern.test(lines[i]))) {
        endIndex = i;
        break;
      }
    }

    return lines.slice(startIndex, endIndex);
  }

  /**
   * Extract a field value from lines using label patterns
   */
  private extractField(
    lines: string[],
    labelPatterns: RegExp[],
    stopPatterns: RegExp[] = []
  ): string {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matchingLabel = labelPatterns.find(pattern => pattern.test(line));
      
      if (!matchingLabel) continue;

      // Try same-line value
      const sameLineValue = line
        .replace(matchingLabel, '')
        .replace(/^[:#\-\s]+/, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (sameLineValue) return sameLineValue;

      // Try next line
      const nextLine = String(lines[i + 1] || '').trim();
      if (nextLine && !stopPatterns.some(pattern => pattern.test(nextLine))) {
        return nextLine;
      }
    }

    return '';
  }

  /**
   * Find a pattern in text using regex
   */
  private findPattern(text: string, patterns: RegExp[]): string {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return '';
  }

  /**
   * Extract address with separate components
   */
  private extractAddress(lines: string[]): {
    street: string;
    city: string;
    state: string;
    zip: string;
    county: string;
  } {
    const addressLabelPatterns = [
      /^\s*address\s*$/i,
      /\bmember\s*address\b/i,
      /\bpatient\s*address\b/i,
    ];

    const stopPatterns = [
      /\bmember\s*phone\b/i,
      /\bpatient\s*phone\b/i,
      /\bcell\s*phone\b/i,
      /\bemail\b/i,
      /\bdob\b/i,
    ];

    let fullAddress = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!addressLabelPatterns.some(pattern => pattern.test(line))) continue;

      const sameLineValue = line
        .replace(/\b(?:member|patient)?\s*address\b/i, '')
        .replace(/^[:#\-\s]+/, '')
        .trim();

      if (sameLineValue) {
        fullAddress = sameLineValue;
        break;
      }

      // Capture next 1-2 lines
      const captured: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const candidate = String(lines[j] || '').trim();
        if (!candidate) continue;
        if (stopPatterns.some(pattern => pattern.test(candidate))) break;
        captured.push(candidate);
        if (captured.length >= 2) break;
      }

      fullAddress = captured.join(' ').trim();
      break;
    }

    return this.parseAddress(fullAddress);
  }

  /**
   * Parse full address into components
   */
  private parseAddress(address: string): {
    street: string;
    city: string;
    state: string;
    zip: string;
    county: string;
  } {
    const result = {
      street: '',
      city: '',
      state: '',
      zip: '',
      county: '',
    };

    if (!address) return result;

    // Match: "123 Main St, Los Angeles, CA 90001"
    const match = address.match(/^(.+?),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/i);
    
    if (match) {
      result.street = match[1].trim();
      result.city = match[2].trim();
      result.state = match[3].toUpperCase();
      result.zip = match[4];
    } else {
      // Fallback: just store as street
      result.street = address;
    }

    return result;
  }

  /**
   * Parse member name into first and last
   */
  private parseName(name: string): { firstName: string; lastName: string } {
    const cleaned = name.replace(/\(.*?\)|\s+kp$/gi, '').trim();
    const parts = cleaned.split(/\s+/).filter(w => /^[A-Za-z'-]+$/.test(w));

    if (parts.length === 0) {
      return { firstName: '', lastName: '' };
    }

    if (parts.length === 1) {
      return { firstName: '', lastName: this.toNameCase(parts[0]) };
    }

    // Last word is last name, rest is first name
    const lastName = parts.pop()!;
    const firstName = parts.join(' ');

    return {
      firstName: this.toNameCase(firstName),
      lastName: this.toNameCase(lastName),
    };
  }

  /**
   * Extract name from filename
   */
  private extractFromFileName(fileName: string): string {
    const fileBase = fileName.replace(/\.pdf$/i, '').trim();
    const noDatePrefix = fileBase.replace(/^\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\s+/, '');
    const candidate = noDatePrefix.split('-')[0].replace(/\(.*?\)|\s+kp/gi, '').trim();
    
    if (!candidate) return '';

    return candidate
      .split(' ')
      .filter(w => /^[A-Za-z'-]+$/.test(w))
      .slice(0, 3)
      .join(' ');
  }

  /**
   * Convert to proper name case
   */
  private toNameCase(str: string): string {
    return str
      .split(/\s+/)
      .map(word => {
        if (word.length === 0) return word;
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  }

  /**
   * Format date to MM/DD/YYYY
   */
  private formatDate(date: string): string {
    const cleaned = date.replace(/[^\d\/\-]/g, '');
    const parts = cleaned.split(/[\/\-]/);

    if (parts.length !== 3) return cleaned;

    let [month, day, year] = parts;

    // Handle 2-digit years
    if (year.length === 2) {
      const currentYear = new Date().getFullYear();
      const century = Math.floor(currentYear / 100) * 100;
      const twoDigitYear = parseInt(year, 10);
      year = String(century + twoDigitYear);
    }

    // Pad month and day
    month = month.padStart(2, '0');
    day = day.padStart(2, '0');

    return `${month}/${day}/${year}`;
  }
}

// Example usage in your Next.js component:
/*
import { ServiceRequestExtractor } from '@/scripts/pdf-extractor/service-request-extractor';

const handlePdfUpload = async (file: File) => {
  const extractor = new ServiceRequestExtractor();
  const result = await extractor.extractFromPdf(file);
  
  console.log('Extracted fields:', result.fields);
  console.log('Parsed field keys:', result.parsedFieldKeys);
  console.log('Warnings:', result.warnings);
  
  // Apply to your form state
  setMemberData(prev => ({ ...prev, ...result.fields }));
};
*/
