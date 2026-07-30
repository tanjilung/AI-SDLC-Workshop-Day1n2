import { cookies } from 'next/headers';
import { buildSessionCookie, SESSION_COOKIE_NAME, createSessionToken, type SessionPayload } from './auth-core';
import { getSessionFromCookieStore } from './auth-core';

export async function getSession() {
  return getSessionFromCookieStore(await cookies());
}

export async function createSession(user: SessionPayload): Promise<void> {
  const token = await createSessionToken(user);
  const cookieStore = await cookies();
  cookieStore.set(buildSessionCookie(token));
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(0),
    maxAge: 0
  });
}
