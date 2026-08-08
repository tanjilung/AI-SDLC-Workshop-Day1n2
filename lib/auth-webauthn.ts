import { randomUUID } from 'crypto';
import { sql, eq } from 'drizzle-orm';
import * as schema from './db-schema';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { hasRecentReauthentication, type SessionPayload } from './auth-core';
import {
  authChallengeStore,
  pendingRegistrationStore,
  type AuthChallengeStore,
  type PendingRegistrationStore
} from './auth-challenges';
import {
  getDb,
  getUserByUsername,
  getUserByCredentialId,
  createUser,
  createAuthenticator,
  getAuthenticatorsByUserId,
  deleteAuthenticator,
  type User,
  type Authenticator
} from './db';

export interface WebAuthnConfig {
  rpId: string;
  rpName: string;
  rpOrigin: string;
}

export interface RegistrationResponseBody {
  username: string;
  response: RegistrationResponseJSON;
}

export interface AuthenticationResponseBody {
  username: string;
  response: AuthenticationResponseJSON;
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function requireConfig(config: Partial<WebAuthnConfig>): WebAuthnConfig {
  const rpId = config.rpId?.trim();
  const rpName = config.rpName?.trim();
  const rpOrigin = config.rpOrigin?.trim();

  if (!rpId) throw new Error('RP_ID is required');
  if (!rpName) throw new Error('RP_NAME is required');
  if (!rpOrigin) throw new Error('RP_ORIGIN is required');

  return { rpId, rpName, rpOrigin };
}

function getChallengeKey(username: string, mode: 'register' | 'login'): string {
  return `${mode}:${normalizeUsername(username)}`;
}

export async function createRegistrationOptions(
  username: string,
  config: Partial<WebAuthnConfig> = {},
  deps: {
    challengeStore?: AuthChallengeStore;
    currentSession?: SessionPayload | null;
    pendingStore?: PendingRegistrationStore;
  } = {}
) {
  const {
    challengeStore = authChallengeStore,
    currentSession,
    pendingStore = pendingRegistrationStore
  } = deps;

  const normalizedUsername = normalizeUsername(username);

  // Check if username already exists
  const existingUser = await getUserByUsername(getDb(), normalizedUsername);

  if (existingUser) {
    if (!currentSession) {
      return { error: 'Username already taken' as const, status: 409 as const };
    }
    if (existingUser.id !== currentSession.userId) {
      return { error: 'Cannot register a passkey for another user' as const, status: 403 as const };
    }
    if (!hasRecentReauthentication(currentSession)) {
      return { error: 'Recent authentication required to add another passkey' as const, status: 401 as const };
    }
  }

  // Check for pending registration
  const existingPending = pendingStore.peek(normalizedUsername);
  if (existingPending) {
    return { error: 'Registration already in progress' as const, status: 409 as const };
  }

  const reservation = pendingStore.reserve(
    normalizedUsername,
    existingUser?.id ?? randomUUID()
  );
  if (!reservation) {
    return { error: 'Registration already in progress' as const, status: 409 as const };
  }

  const webAuthnConfig = requireConfig(config);

  try {
    // Get existing authenticators to exclude from registration
    let excludeCredentials: Array<{ id: string; type: string; transports?: AuthenticatorTransport[] }> = [];
    if (existingUser) {
      const existingAuthenticators = await getAuthenticatorsByUserId(getDb(), existingUser.id);
      excludeCredentials = existingAuthenticators.map((a) => ({
        id: a.credential_id,
        type: 'public-key',
        transports: a.transports ? (JSON.parse(a.transports) as AuthenticatorTransport[]) : undefined
      }));
    }

    const options = await generateRegistrationOptions({
      rpName: webAuthnConfig.rpName,
      rpID: webAuthnConfig.rpId,
      userName: normalizedUsername,
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred'
      }
    });

    if (!pendingStore.attachChallenge(normalizedUsername, reservation.attemptId, options.challenge)) {
      return { error: 'Registration already in progress' as const, status: 409 as const };
    }

    challengeStore.save(getChallengeKey(normalizedUsername, 'register'), options.challenge);

    return { options, status: 200 as const };
  } catch (_error) {
    pendingStore.release(normalizedUsername, reservation.attemptId);
    throw _error;
  }
}

export async function createLoginOptions(
  username: string,
  config: Partial<WebAuthnConfig> = {},
  challengeStore: AuthChallengeStore = authChallengeStore
) {
  const normalizedUsername = normalizeUsername(username);
  const user = await getUserByUsername(getDb(), normalizedUsername);

  if (!user) {
    return { error: 'User not found' as const, status: 404 as const };
  }

  const webAuthnConfig = requireConfig(config);
  const authenticators = await getAuthenticatorsByUserId(getDb(), user.id);

  const options = await generateAuthenticationOptions({
    rpID: webAuthnConfig.rpId,
    allowCredentials: authenticators.map((a) => ({
      id: a.credential_id,
      type: 'public-key',
      transports: a.transports ? (JSON.parse(a.transports) as AuthenticatorTransport[]) : undefined
    })),
    userVerification: 'preferred'
  });

  challengeStore.save(getChallengeKey(normalizedUsername, 'login'), options.challenge);

  return { options, status: 200 as const };
}

export async function verifyRegistration(
  body: RegistrationResponseBody,
  config: Partial<WebAuthnConfig> = {},
  deps: {
    challengeStore?: AuthChallengeStore;
    pendingStore?: PendingRegistrationStore;
    currentSession?: SessionPayload | null;
  } = {}
): Promise<{ user?: User; verified: boolean; error?: string }> {
  const {
    challengeStore = authChallengeStore,
    pendingStore = pendingRegistrationStore,
    currentSession
  } = deps;

  const normalizedUsername = normalizeUsername(body.username);
  const existingUser = await getUserByUsername(getDb(), normalizedUsername);

  if (existingUser) {
    if (!currentSession || currentSession.userId !== existingUser.id) {
      return { verified: false, error: 'Authentication required to add another passkey' };
    }
    if (!hasRecentReauthentication(currentSession)) {
      return { verified: false, error: 'Recent authentication required to add another passkey' };
    }
  }

  const expectedChallenge = challengeStore.consume(getChallengeKey(normalizedUsername, 'register'));
  if (!expectedChallenge) {
    return { verified: false, error: 'Registration challenge expired' };
  }

  const webAuthnConfig = requireConfig(config);
  const pendingRegistration = pendingStore.consume(normalizedUsername);

  if (!pendingRegistration || pendingRegistration.challenge !== expectedChallenge) {
    return { verified: false, error: 'Registration expired' };
  }

  if (existingUser && pendingRegistration.reservedUserId !== existingUser.id) {
    return { verified: false, error: 'Registration expired' };
  }

  let verification: VerifiedRegistrationResponse;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: webAuthnConfig.rpOrigin,
      expectedRPID: webAuthnConfig.rpId,
      requireUserVerification: false
    });
  } catch {
    return { verified: false, error: 'Verification failed' };
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { verified: false, error: 'Verification failed' };
  }

  const db = getDb();
  try {
    const { id: credId, publicKey, counter } = verification.registrationInfo.credential;

    if (existingUser) {
      // Adding a new passkey to an existing user
      await createAuthenticator(db, {
        credential_id: credId,
        user_id: existingUser.id,
        public_key: isoBase64URL.fromBuffer(publicKey.slice()),
        counter: counter ?? 0,
        transports: null
      });
    } else {
      // Creating a new account
      await createUser(db, { username: normalizedUsername, password_hash: '', id: pendingRegistration.reservedUserId } as any);
      const newUser = await getUserByUsername(db, normalizedUsername);
      if (!newUser) throw new Error('Failed to create user');
      await createAuthenticator(db, {
        credential_id: credId,
        user_id: newUser.id,
        public_key: isoBase64URL.fromBuffer(publicKey.slice()),
        counter: counter ?? 0,
        transports: null
      });
    }

    const user = await getUserByUsername(db, normalizedUsername);
    return { verified: true, user: user! };
  } catch {
    return { verified: false, error: 'Registration failed' };
  }
}

export async function verifyLogin(
  body: AuthenticationResponseBody,
  config: Partial<WebAuthnConfig> = {},
  challengeStore: AuthChallengeStore = authChallengeStore
): Promise<{ user?: User; authenticator?: Authenticator; verified: boolean; error?: string }> {
  const normalizedUsername = normalizeUsername(body.username);

  const expectedChallenge = challengeStore.consume(getChallengeKey(normalizedUsername, 'login'));
  if (!expectedChallenge) {
    return { verified: false, error: 'Login challenge expired' };
  }

  const responseId = String(body.response.id ?? '');

  const user = await getUserByCredentialId(getDb(), responseId);
  if (!user) {
    return { verified: false, error: 'User not found' };
  }

  const authenticators = await getAuthenticatorsByUserId(getDb(), user.id);
  const authenticator = authenticators.find((a) => a.credential_id === responseId);

  if (!authenticator) {
    return { verified: false, error: 'Authenticator not recognized' };
  }

  const webAuthnConfig = requireConfig(config);
  const verification = await verifyAuthenticationResponse({
    response: body.response,
    expectedChallenge,
    expectedOrigin: webAuthnConfig.rpOrigin,
    expectedRPID: webAuthnConfig.rpId,
    credential: {
      id: authenticator.credential_id,
      publicKey: isoBase64URL.toBuffer(authenticator.public_key).slice(),
      counter: authenticator.counter ?? 0
    }
  });

  if (!verification.verified || !verification.authenticationInfo) {
    return { verified: false, error: 'Verification failed' };
  }

  const newCounter = verification.authenticationInfo.newCounter ?? 0;
  const db = getDb();

  try {
    await db.update(schema.authenticators).set({ counter: newCounter }).where(eq(schema.authenticators.credentialId, authenticator.credential_id)).run();
  } catch {
    // Counter update failure is non-fatal
  }

  return { verified: true, user };
}
