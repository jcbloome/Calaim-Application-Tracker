import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not found in environment variables',
        instructions: 'Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key to .env.local file'
      });
    }

    // Test the API key by making a simple request to Google Maps API
    const testUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=California&key=${apiKey}`;
    
    const response = await fetch(testUrl);
    const data = await response.json();
    
    if (data.status === 'OK') {
      return NextResponse.json({
        success: true,
        message: 'Google Maps API key is working correctly',
        apiKey: `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`,
        testResult: data.status
      });
    } else {
      return NextResponse.json({
        success: false,
        error: `Google Maps API returned status: ${data.status}`,
        message: data.error_message || 'Unknown error',
        apiKey: `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`
      });
    }

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: 'Failed to test Google Maps API',
      details: error.message
    });
  }
}