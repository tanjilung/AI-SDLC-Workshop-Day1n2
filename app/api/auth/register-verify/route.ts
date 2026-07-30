import { NextResponse, type NextRequest } from 'next/server';
import { createSession, getSession } from '@/lib/auth-server';
import { verifyRegistration, type RegistrationResponseBody } from '@/lib/auth-webauthn';

function getWebAuthnConfig() {
  return {
    rpId: process.env.RP_ID,
    rpName: process.env.RP_NAME,
    rpOrigin: process.env.RP_ORIGIN
  };
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const body = (await request.json()) as Partial<RegistrationResponseBody>;
  const username = body.username?.trim();

  if (!username || !body.response) {
    return NextResponse.json({ error: 'Username and response are required' }, { status: 400 });
  }

  const result = await verifyRegistration(
    { username, response: body.response },
    getWebAuthnConfig(),
    { currentSession: session }
  );

  if (!result.verified || !result.user) {
    return NextResponse.json({ error: result.error ?? 'Verification failed' }, { status: 401 });
  }

  await createSession({
    userId: result.user.id,
    username: result.user.username
  });

  return NextResponse.json({ success: true });
}
