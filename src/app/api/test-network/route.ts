import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const results: any = {};
  
  try {
    // Test 1: Basic HTTP request
    console.log('🔍 Testing basic HTTP connectivity...');
    const httpTest = await fetch('https://httpbin.org/get', {
      method: 'GET',
      headers: { 'User-Agent': 'CalAIM-Network-Test' }
    });
    results.httpTest = {
      success: httpTest.ok,
      status: httpTest.status,
      statusText: httpTest.statusText
    };
    console.log('✅ HTTP test result:', results.httpTest);
  } catch (error: any) {
    results.httpTest = {
      success: false,
      error: error.message
    };
    console.log('❌ HTTP test failed:', error.message);
  }

  try {
    // Test 2: Test Caspio domain connectivity
    console.log('🔍 Testing Caspio domain connectivity...');
    const caspioTest = await fetch('https://c7ebl500.caspio.com', {
      method: 'GET',
      headers: { 'User-Agent': 'CalAIM-Caspio-Test' }
    });
    results.caspioTest = {
      success: caspioTest.ok,
      status: caspioTest.status,
      statusText: caspioTest.statusText
    };
    console.log('✅ Caspio domain test result:', results.caspioTest);
  } catch (error: any) {
    results.caspioTest = {
      success: false,
      error: error.message
    };
    console.log('❌ Caspio domain test failed:', error.message);
  }

  try {
    // Test 3: Check environment variables
    console.log('🔍 Checking environment variables...');
    results.envTest = {
      CASPIO_BASE_URL: !!process.env.CASPIO_BASE_URL,
      CASPIO_CLIENT_ID: !!process.env.CASPIO_CLIENT_ID,
      CASPIO_CLIENT_SECRET: !!process.env.CASPIO_CLIENT_SECRET,
      baseUrlValue: process.env.CASPIO_BASE_URL || 'NOT_SET',
      clientIdLength: process.env.CASPIO_CLIENT_ID?.length || 0,
      clientSecretLength: process.env.CASPIO_CLIENT_SECRET?.length || 0
    };
    console.log('✅ Environment variables:', results.envTest);
  } catch (error: any) {
    results.envTest = {
      success: false,
      error: error.message
    };
    console.log('❌ Environment test failed:', error.message);
  }

  return NextResponse.json({
    success: true,
    message: 'Network connectivity tests completed',
    results,
    timestamp: new Date().toISOString()
  });
}