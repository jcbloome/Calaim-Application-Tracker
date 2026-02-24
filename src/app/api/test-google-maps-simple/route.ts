import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiKey = process.env.GOOGLE_GEOCODING_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'Google Maps API key not configured',
        apiKey: null
      });
    }

    // Test a simple geocoding request
    const testUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=California&key=${apiKey}`;
    
    console.log('🧪 Testing Google Maps API with URL:', testUrl.replace(apiKey, 'API_KEY_HIDDEN'));
    
    const response = await fetch(testUrl);
    const data = await response.json();
    
    console.log('📊 Google Maps API Response:', {
      status: response.status,
      dataStatus: data.status,
      errorMessage: data.error_message
    });

    return NextResponse.json({
      success: response.ok && data.status === 'OK',
      status: response.status,
      apiResponse: data,
      keySource: process.env.GOOGLE_GEOCODING_API_KEY ? 'GOOGLE_GEOCODING_API_KEY' : 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
      apiKey: apiKey.substring(0, 10) + '...',
      testUrl: testUrl.replace(apiKey, 'API_KEY_HIDDEN')
    });

  } catch (error: any) {
    console.error('❌ Google Maps API test failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.substring(0, 10) + '...'
    });
  }
}