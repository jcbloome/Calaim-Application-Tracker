/**
 * Convert PDF to images for AI vision processing
 */

import * as fs from 'fs';
import * as path from 'path';
import { convert } from 'pdf-poppler';

async function convertPdfToImages() {
  const pdfPath = 'c:\\Users\\Jason.Jason-PC\\AppData\\Roaming\\Cursor\\User\\workspaceStorage\\2871420c389bbb745bfd4b95a2ccaf63\\pdfs\\525fe811-013d-4835-a160-0636cc2c97a9\\02.05.26 JIM KOVACICH - ToCF Connections.pdf';
  
  // Output directory
  const outputDir = path.join(process.cwd(), 'scripts', 'pdf-extractor', 'output-images');
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Converting PDF to images...');
  console.log('PDF Path:', pdfPath);
  console.log('Output Dir:', outputDir);
  console.log('---\n');

  try {
    const options = {
      format: 'png',
      out_dir: outputDir,
      out_prefix: 'page',
      page: 1, // Only convert first page (second page is just HIPAA notice)
      scale: 2048, // High quality
    };

    console.log('Starting conversion with pdf-poppler (first page only)...\n');
    
    const result = await convert(pdfPath, options);
    
    console.log('\n✅ Conversion complete!');
    console.log(`\nImages saved to: ${outputDir}`);
    
    // List the generated files
    const files = fs.readdirSync(outputDir);
    console.log('\nGenerated files:');
    files.forEach(file => {
      const filePath = path.join(outputDir, file);
      const stats = fs.statSync(filePath);
      console.log(`  - ${file} (${Math.round(stats.size / 1024)} KB)`);
    });

  } catch (error: any) {
    console.error('❌ ERROR:', error.message);
    
    if (error.message.includes('spawn') || error.message.includes('pdftoppm')) {
      console.error('\n⚠️  pdf-poppler requires poppler-utils to be installed.');
      console.error('This is a system dependency that needs to be installed separately.');
      console.error('\nAlternative: I can create images using a different method.');
    }
    
    console.error(error.stack);
  }
}

convertPdfToImages();
