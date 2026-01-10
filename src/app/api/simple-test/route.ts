import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const results: any = {};
  
  try {
    console.log('🔍 Testing basic connectivity...');
    
    // Test 1: Simple HTTP request to a reliable endpoint
    const response = await fetch('https://httpbin.org/get', {
      method: 'GET',
      headers: {
        'User-Agent': 'CalAIM-Test'
      }
    });
    
    results.httpTest = {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url
    };
    
    if (response.ok) {
      const data = await response.json();
      results.httpTest.data = data;
    }
    
  } catch (error: any) {
    results.httpTest = {
      success: false,
      error: error.message,
      name: error.name,
      stack: error.stack?.substring(0, 200)
    };
  }

  try {
    console.log('🔍 Testing Caspio domain...');
    
    // Test 2: Try to reach Caspio domain (just the homepage)
    const caspioResponse = await fetch('https://c7ebl500.caspio.com', {
      method: 'GET',
      headers: {
        'User-Agent': 'CalAIM-Caspio-Test'
      }
    });
    
    results.caspioTest = {
      success: caspioResponse.ok,
      status: caspioResponse.status,
      statusText: caspioResponse.statusText,
      url: caspioResponse.url
    };
    
  } catch (error: any) {
    results.caspioTest = {
      success: false,
      error: error.message,
      name: error.name,
      stack: error.stack?.substring(0, 200)
    };
  }

  return NextResponse.json({
    success: true,
    message: 'Simple connectivity tests completed',
    results,
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform
    }
  });
}