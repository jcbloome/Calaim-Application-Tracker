/**
 * Test if your existing API keys work with Gemini
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function testGeminiKey() {
  console.log('Testing Gemini API Keys...\n');

  const keys = [
    { name: 'GEMINI_API_KEY', value: process.env.GEMINI_API_KEY },
    { name: 'GOOGLE_API_KEY', value: process.env.GOOGLE_API_KEY },
    { name: 'FIREBASE_API_KEY', value: process.env.FIREBASE_API_KEY },
  ];

  console.log('Available keys:');
  keys.forEach(key => {
    if (key.value && key.value !== 'your_gemini_api_key_here') {
      console.log(`  ✓ ${key.name}: ${key.value.substring(0, 20)}...`);
    } else {
      console.log(`  ✗ ${key.name}: Not set`);
    }
  });
  console.log('\n');

  // Try each key
  for (const key of keys) {
    if (!key.value || key.value === 'your_gemini_api_key_here') {
      continue;
    }

    console.log(`Testing ${key.name}...`);
    
    try {
      const genAI = new GoogleGenerativeAI(key.value);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const result = await model.generateContent('Say "Hello" in one word.');
      const response = await result.response;
      const text = response.text();
      
      console.log(`  ✅ SUCCESS! Response: ${text.trim()}`);
      console.log(`  → Use this key: ${key.name}\n`);
      return;
      
    } catch (error: any) {
      console.log(`  ❌ FAILED: ${error.message}\n`);
    }
  }

  console.log('❌ None of the API keys work with Gemini.');
  console.log('\n📝 You need to get a Gemini API key from:');
  console.log('   https://aistudio.google.com/app/apikey\n');
}

testGeminiKey();
