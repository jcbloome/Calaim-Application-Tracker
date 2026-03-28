# Kaiser Service Request PDF Extractor

A robust TypeScript extractor for Kaiser Permanente Service Request Forms that parses member information, authorization details, and diagnostic codes.

## Features

- ✅ Extracts all required fields from Kaiser Service Request PDFs
- ✅ Handles both text-layer PDFs and scanned documents (via vision/OCR)
- ✅ Only processes first page (second page is HIPAA notice)
- ✅ Parses addresses into separate components (street, city, state, zip, county)
- ✅ Formats dates to MM/DD/YYYY
- ✅ Extracts name from filename as fallback
- ✅ Returns warnings for missing or problematic data

## Two Extraction Methods

### 1. Text-Based Extraction (service-request-extractor.ts)
For PDFs with a text layer (digital PDFs, not scanned).

### 2. Vision-Based Extraction (vision-extractor.ts)
For scanned PDFs (image-based). Converts first page to image for AI vision processing.

## Extracted Fields

### Member Information
- `memberFirstName` - Member's first name
- `memberLastName` - Member's last name
- `memberMrn` - Medical Record Number
- `memberDob` - Date of Birth (MM/DD/YYYY)
- `memberCustomaryAddress` - Street address
- `memberCustomaryCity` - City
- `memberCustomaryState` - State (2-letter code)
- `memberCustomaryZip` - ZIP code
- `memberCustomaryCounty` - County
- `memberPhone` - Primary phone number
- `contactPhone` - Cell phone number
- `contactEmail` - Email address

### Authorization Information
- `Authorization_Number_T038` - Authorization number
- `Authorization_Start_T2038` - Start date (MM/DD/YYYY)
- `Authorization_End_T2038` - End date (MM/DD/YYYY)
- `Diagnostic_Code` - ICD-10 or diagnostic code

## Installation

Ensure you have `pdfjs-dist` installed:

```bash
npm install pdfjs-dist
```

## Usage

### In a Next.js Component

```typescript
import { ServiceRequestExtractor } from '@/scripts/pdf-extractor/service-request-extractor';

const YourComponent = () => {
  const [memberData, setMemberData] = useState({});
  const [isParsingPdf, setIsParsingPdf] = useState(false);

  const handlePdfUpload = async (file: File) => {
    setIsParsingPdf(true);
    
    try {
      const extractor = new ServiceRequestExtractor();
      const result = await extractor.extractFromPdf(file);
      
      // Check for warnings
      if (result.warnings.length > 0) {
        console.warn('PDF extraction warnings:', result.warnings);
      }
      
      // Apply extracted fields to form
      setMemberData(prev => ({ ...prev, ...result.fields }));
      
      // Show success message
      alert(`Extracted ${result.parsedFieldKeys.length} fields from PDF`);
      
    } catch (error) {
      console.error('PDF extraction failed:', error);
      alert('Failed to parse PDF. Please enter data manually.');
    } finally {
      setIsParsingPdf(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept=".pdf"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handlePdfUpload(file);
        }}
      />
      {isParsingPdf && <p>Parsing PDF...</p>}
    </div>
  );
};
```

### Integration with Existing Create Application Page

Replace your current `parseServiceRequestPdfAndApply` function in `src/app/admin/applications/create/page.tsx`:

```typescript
import { ServiceRequestExtractor } from '@/scripts/pdf-extractor/service-request-extractor';

const parseServiceRequestPdfAndApply = async () => {
  if (!serviceRequestFile) {
    toast({
      title: 'No file selected',
      description: 'Please select a PDF file first.',
      variant: 'destructive',
    });
    return;
  }

  setIsParsingServiceRequest(true);
  setServiceRequestWarnings([]);
  setServiceRequestParsedFields([]);

  try {
    const extractor = new ServiceRequestExtractor();
    const result = await extractor.extractFromPdf(serviceRequestFile);

    // Show raw text preview
    setServiceRequestTextPreview(result.rawText.slice(0, 8000));

    // Handle warnings
    if (result.warnings.length > 0) {
      setServiceRequestWarnings(result.warnings);
    }

    // Check if any fields were found
    if (result.parsedFieldKeys.length === 0) {
      toast({
        title: 'No fields extracted',
        description: 'The PDF may be scanned or use different labels. Please enter data manually.',
        variant: 'default',
      });
      return;
    }

    // Apply extracted fields to form
    setMemberData(prev => ({ ...prev, ...result.fields }));
    setServiceRequestParsedFields(result.parsedFieldKeys);

    toast({
      title: 'Service request parsed',
      description: `Autofilled ${result.parsedFieldKeys.length} field(s) from PDF.`,
    });

  } catch (error: any) {
    console.error('PDF parsing error:', error);
    setServiceRequestWarnings([
      'Failed to parse PDF',
      error.message || 'Unknown error occurred',
    ]);
    toast({
      title: 'PDF parsing failed',
      description: 'Please enter data manually.',
      variant: 'destructive',
    });
  } finally {
    setIsParsingServiceRequest(false);
  }
};
```

## Testing

Run the test script to verify extraction from a specific PDF:

```bash
npx tsx scripts/pdf-extractor/test-extractor.ts
```

The test will:
1. Load the specified PDF
2. Extract all fields
3. Display results and validation checks
4. Show warnings if any

## Expected Output Format

```json
{
  "fields": {
    "memberFirstName": "Jim",
    "memberLastName": "Kovacich",
    "memberMrn": "ABC123456",
    "memberDob": "01/15/1960",
    "memberCustomaryAddress": "123 Main St",
    "memberCustomaryCity": "Los Angeles",
    "memberCustomaryState": "CA",
    "memberCustomaryZip": "90001",
    "memberPhone": "555-123-4567",
    "contactPhone": "555-987-6543",
    "contactEmail": "jim.kovacich@example.com",
    "Authorization_Number_T038": "AUTH123456",
    "Authorization_Start_T2038": "02/05/2026",
    "Authorization_End_T2038": "08/05/2026",
    "Diagnostic_Code": "F20.9"
  },
  "parsedFieldKeys": [
    "memberFirstName",
    "memberLastName",
    "memberMrn",
    "memberDob",
    "memberCustomaryAddress",
    "memberCustomaryCity",
    "memberCustomaryState",
    "memberCustomaryZip",
    "memberPhone",
    "contactPhone",
    "contactEmail",
    "Authorization_Number_T038",
    "Authorization_Start_T2038",
    "Authorization_End_T2038",
    "Diagnostic_Code"
  ],
  "warnings": []
}
```

## Handling Scanned PDFs

For scanned PDFs (like the Jim Kovacich example), use the `VisionServiceRequestExtractor`:

```typescript
import { VisionServiceRequestExtractor } from '@/scripts/pdf-extractor/vision-extractor';

const extractor = new VisionServiceRequestExtractor();
const result = await extractor.extractFromPdf(pdfPath);

// result.imagePath contains the path to the generated image
// result.fields contains the extracted data
```

The vision extractor:
1. Converts only the first page to a high-quality PNG
2. Provides the image path for AI vision processing
3. Returns structured field data

### Integration with AI Vision

To use with Claude/Gemini/GPT-4 Vision:

```typescript
// 1. Convert PDF to image
const extractor = new VisionServiceRequestExtractor();
const imagePath = await extractor.convertFirstPageToImage(pdfPath);

// 2. Read image as base64
const imageBuffer = fs.readFileSync(imagePath);
const base64Image = imageBuffer.toString('base64');

// 3. Send to AI vision API with prompt
const prompt = `Extract the following fields from this Kaiser Service Request Form:
- Member First Name
- Member Last Name
- MRN
- DOB (format: MM/DD/YYYY)
- Member Address (street)
- City
- State
- Zip
- Member Phone
- Cell Phone
- Email
- Authorization Number
- Authorization Start Date (format: MM/DD/YYYY)
- Authorization End Date (format: MM/DD/YYYY)
- DX Code (Diagnostic Code)

Return as JSON.`;

// 4. Parse AI response and apply to form
```

## Troubleshooting

### No fields extracted
- Check if the PDF has a text layer (try copying text from the PDF)
- If scanned, implement OCR fallback
- Verify the PDF follows the expected Kaiser Service Request Form layout

### Incorrect field values
- Check the `rawText` in the result to see what was extracted
- Adjust regex patterns in the extractor if labels differ
- File an issue with the specific PDF format

### Performance issues
- The extractor processes up to 8 pages by default
- For large PDFs, consider processing only the first 2-3 pages
- Use `disableWorker: true` for more stable extraction

## License

Internal use only - CalAIM Application Tracker
