import { NextResponse, type NextRequest } from 'next/server';
import { createLoginOptions } from '@/lib/auth-webauthn';

function getWebAuthnConfig() {
  return {
    rpId: process.env.RP_ID,
    rpName: process.env.RP_NAME,
    rpOrigin: process.env.RP_ORIGIN
  };
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { username?: string };
  const username = body.username?.trim();

  if (!username) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  const result = await createLoginOptions(username, getWebAuthnConfig());

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.options);
}
