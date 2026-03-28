/**
 * List available Gemini models for your API key
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function listModels() {
  const apiKey = process.env.FIREBASE_API_KEY || '';
  
  if (!apiKey) {
    console.log('No API key found');
    return;
  }

  console.log('Checking available models...\n');

  const genAI = new GoogleGenerativeAI(apiKey);
  
  try {
    // Try different model names
    const modelsToTry = [
      'gemini-pro',
      'gemini-pro-vision',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest',
      'gemini-1.0-pro',
    ];

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent('Hi');
        const response = await result.response;
        console.log(`✅ ${modelName} - WORKS!`);
      } catch (error: any) {
        console.log(`❌ ${modelName} - ${error.message.split('\n')[0]}`);
      }
    }
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

listModels();
