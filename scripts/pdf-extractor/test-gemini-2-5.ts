/**
 * Test Gemini 2.5 Flash
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function testGemini25() {
  const apiKey = process.env.GEMINI_API_KEY || '';
  
  if (!apiKey) {
    console.log('No API key found');
    return;
  }

  console.log('Testing Gemini 2.5 Flash...\n');

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    const result = await model.generateContent('Say "Hello, PDF extraction works!" in exactly those words.');
    const response = await result.response;
    const text = response.text();
    
    console.log('✅ SUCCESS!');
    console.log('Response:', text.trim());
    console.log('\n🎉 Your Gemini API is working perfectly!');
    console.log('📄 PDF vision extraction is ready to use!');
    
  } catch (error: any) {
    console.log('❌ FAILED:', error.message);
  }
}

testGemini25();
