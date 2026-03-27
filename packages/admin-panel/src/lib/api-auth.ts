import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const API_KEY = process.env.API_ACCESS_KEY || 'your-admin-api-key-here';

export function verifyApiKey(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  const apiKey = request.headers.get('x-api-key');
  return apiKey === API_KEY;
}

export function unauthorizedResponse(message: string = 'Unauthorized') {
  return NextResponse.json(
    { error: message },
    { status: 401 }
  );
}

export function requireApiKey(request: NextRequest): Response | null {
  if (!verifyApiKey(request)) {
    return unauthorizedResponse();
  }
  return null;
}
