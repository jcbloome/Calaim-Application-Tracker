/**
 * Test Gemini API directly with fetch
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function testDirectAPI() {
  const apiKey = process.env.GEMINI_API_KEY || '';
  
  if (!apiKey) {
    console.log('No API key found');
    return;
  }

  console.log('Testing Gemini API with direct fetch...\n');
  console.log(`API Key: ${apiKey.substring(0, 20)}...\n`);

  // Try v1 API
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: 'Say hello in one word'
          }]
        }]
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ SUCCESS with v1 API!');
      console.log('Response:', JSON.stringify(data, null, 2));
    } else {
      console.log('❌ v1 API failed:', data);
      
      // Try v1beta
      const urlBeta = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const responseBeta = await fetch(urlBeta, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: 'Say hello in one word'
            }]
          }]
        })
      });
      
      const dataBeta = await responseBeta.json();
      
      if (responseBeta.ok) {
        console.log('✅ SUCCESS with v1beta API!');
        console.log('Response:', JSON.stringify(dataBeta, null, 2));
      } else {
        console.log('❌ v1beta API also failed:', dataBeta);
      }
    }
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

testDirectAPI();
