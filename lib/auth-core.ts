import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE_NAME = 'todo_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const RECENT_REAUTH_WINDOW_MS = 5 * 60 * 1000;

export interface SessionPayload {
  userId: string;
  username: string;
  reauthenticatedAt?: number;
}

export interface SessionCookie {
  name: string;
  value: string;
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge: number;
}

function getSessionSecret(secret = process.env.JWT_SECRET): Uint8Array {
  if (!secret || secret.trim().length === 0) {
    throw new Error('JWT_SECRET is required');
  }

  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  payload: SessionPayload,
  secret = process.env.JWT_SECRET
): Promise<string> {
  return new SignJWT({
    username: payload.username,
    reauthenticatedAt: payload.reauthenticatedAt ?? Date.now()
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSessionSecret(secret));
}

export async function verifySessionToken(
  token: string,
  secret = process.env.JWT_SECRET
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(secret));
    const userId = payload.sub;
    const username = payload.username;
    const reauthenticatedAt = payload.reauthenticatedAt;

    if (typeof userId !== 'string' || typeof username !== 'string') {
      return null;
    }

    if (reauthenticatedAt !== undefined && typeof reauthenticatedAt !== 'number') {
      return null;
    }

    return {
      userId,
      username,
      reauthenticatedAt
    };
  } catch {
    return null;
  }
}

export function hasRecentReauthentication(
  session: SessionPayload | null | undefined,
  now = Date.now()
): boolean {
  if (!session || typeof session.reauthenticatedAt !== 'number' || !Number.isFinite(session.reauthenticatedAt)) {
    return false;
  }

  return session.reauthenticatedAt <= now && now - session.reauthenticatedAt <= RECENT_REAUTH_WINDOW_MS;
}

export function buildSessionCookie(token: string): SessionCookie {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS
  };
}

export async function getSessionFromCookieStore(
  cookieStore: { get(name: string): { value: string } | undefined }
): Promise<SessionPayload | null> {
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}
