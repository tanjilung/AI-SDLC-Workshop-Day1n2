import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth-server';
import { createRegistrationOptions } from '@/lib/auth-webauthn';

function getWebAuthnConfig() {
  return {
    rpId: process.env.RP_ID,
    rpName: process.env.RP_NAME,
    rpOrigin: process.env.RP_ORIGIN
  };
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const body = (await request.json()) as { username?: string };
  const username = body.username?.trim();

  if (!username) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  const result = await createRegistrationOptions(username, getWebAuthnConfig(), { currentSession: session });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.options);
}
