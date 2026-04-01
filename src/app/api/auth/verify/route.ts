import { NextRequest, NextResponse } from 'next/server';
import { createAuthVerificationService } from '@agentic-sdk/services/auth-verification';

/** Read env at request time — module-level reads may miss dotenv values in Next.js dev mode. */
function getAuthService() {
  return createAuthVerificationService(process.env.API_ACCESS_KEY);
}

function isSandboxMode() {
  return !!process.env.NEXT_PUBLIC_PROXY_URL;
}

/**
 * Verify API key endpoint
 * POST /api/auth/verify
 * Body: { apiKey: string }
 * Returns: { valid: boolean, authRequired: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    if (isSandboxMode()) return NextResponse.json({ valid: true, authRequired: false });
    const authService = getAuthService();
    const body = await request.json();
    const { apiKey } = body;
    const authRequired = authService.isAuthEnabled();
    if (!authRequired) {
      return NextResponse.json({ valid: true, authRequired: false });
    }
    const valid = typeof apiKey === 'string' && authService.verifyKeyValue(apiKey);
    return NextResponse.json({ valid, authRequired: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

/**
 * Check if auth is required
 * GET /api/auth/verify
 * Returns: { authRequired: boolean }
 */
export async function GET() {
  if (isSandboxMode()) return NextResponse.json({ authRequired: false });
  return NextResponse.json({ authRequired: getAuthService().isAuthEnabled() });
}
