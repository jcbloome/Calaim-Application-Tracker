/**
 * List all available Gemini models
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function listAllModels() {
  const apiKey = process.env.GEMINI_API_KEY || '';
  
  if (!apiKey) {
    console.log('No API key found');
    return;
  }

  console.log('Fetching list of available models...\n');

  const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (response.ok && data.models) {
      console.log(`Found ${data.models.length} models:\n`);
      
      for (const model of data.models) {
        console.log(`✓ ${model.name}`);
        if (model.supportedGenerationMethods) {
          console.log(`  Methods: ${model.supportedGenerationMethods.join(', ')}`);
        }
        console.log('');
      }
    } else {
      console.log('Error:', data);
    }
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

listAllModels();
