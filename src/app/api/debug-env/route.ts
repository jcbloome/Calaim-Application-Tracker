import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    envVars: {
      CASPIO_BASE_URL: process.env.CASPIO_BASE_URL || 'NOT SET',
      CASPIO_CLIENT_ID: process.env.CASPIO_CLIENT_ID ? `SET (${process.env.CASPIO_CLIENT_ID.length} chars)` : 'NOT SET',
      CASPIO_CLIENT_SECRET: process.env.CASPIO_CLIENT_SECRET ? `SET (${process.env.CASPIO_CLIENT_SECRET.length} chars)` : 'NOT SET',
      CASPIO_TABLE_NAME: process.env.CASPIO_TABLE_NAME || 'NOT SET',
    },
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
}