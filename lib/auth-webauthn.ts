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

// Debug helper: only logs when DEBUG_WEBAUTHN env var is set
function debug(...args: any[]): void {
  if (process.env.DEBUG_WEBAUTHN) {
    console.error('[WebAuthn]', ...args);
  }
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
  debug('createRegistrationOptions', { username, normalizedUsername });

  // Check if username already exists
  const existingUser = await getUserByUsername(getDb(), normalizedUsername);
  debug('createRegistrationOptions -> existingUser', existingUser ? 'found' : 'none');

  if (existingUser) {
    if (!currentSession) {
      debug('createRegistrationOptions -> REJECT: no session for existing user');
      return { error: 'Username already taken' as const, status: 409 as const };
    }
    if (existingUser.id !== currentSession.userId) {
      debug('createRegistrationOptions -> REJECT: session user mismatch');
      return { error: 'Cannot register a passkey for another user' as const, status: 403 as const };
    }
    if (!hasRecentReauthentication(currentSession)) {
      debug('createRegistrationOptions -> REJECT: no recent re-authentication');
      return { error: 'Recent authentication required to add another passkey' as const, status: 401 as const };
    }
  }

  // Check for pending registration
  const existingPending = pendingStore.peek(normalizedUsername);
  if (existingPending) {
    debug('createRegistrationOptions -> REJECT: pending registration exists');
    return { error: 'Registration already in progress' as const, status: 409 as const };
  }

  const reservation = pendingStore.reserve(
    normalizedUsername,
    existingUser?.id ?? randomUUID()
  );
  if (!reservation) {
    debug('createRegistrationOptions -> REJECT: reservation failed');
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
  debug('createLoginOptions', { username, normalizedUsername });

  const user = await getUserByUsername(getDb(), normalizedUsername);
  debug('createLoginOptions -> user lookup', user ? 'found' : 'not found');

  if (!user) {
    return { error: 'User not found' as const, status: 404 as const };
  }

  const webAuthnConfig = requireConfig(config);
  const authenticators = await getAuthenticatorsByUserId(getDb(), user.id);
  debug('createLoginOptions -> authenticators count', authenticators.length);

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
  debug('createLoginOptions -> success');

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
  debug('verifyRegistration', { username: normalizedUsername });

  const existingUser = await getUserByUsername(getDb(), normalizedUsername);
  debug('verifyRegistration -> existingUser', existingUser ? 'found' : 'none');

  if (existingUser) {
    if (!currentSession || currentSession.userId !== existingUser.id) {
      debug('verifyRegistration -> REJECT: session mismatch');
      return { verified: false, error: 'Authentication required to add another passkey' };
    }
    if (!hasRecentReauthentication(currentSession)) {
      debug('verifyRegistration -> REJECT: no recent re-auth');
      return { verified: false, error: 'Recent authentication required to add another passkey' };
    }
  }

  const expectedChallenge = challengeStore.consume(getChallengeKey(normalizedUsername, 'register'));
  if (!expectedChallenge) {
    debug('verifyRegistration -> REJECT: challenge expired');
    return { verified: false, error: 'Registration challenge expired' };
  }

  const webAuthnConfig = requireConfig(config);
  const pendingRegistration = pendingStore.consume(normalizedUsername);
  debug('verifyRegistration -> pendingRegistration', pendingRegistration ? 'consumed' : 'none');

  if (!pendingRegistration || pendingRegistration.challenge !== expectedChallenge) {
    debug('verifyRegistration -> REJECT: pending/challenge mismatch', {
      hasPending: !!pendingRegistration,
      challengeMatch: pendingRegistration ? pendingRegistration.challenge === expectedChallenge : null,
    });
    return { verified: false, error: 'Registration expired' };
  }

  if (existingUser && pendingRegistration.reservedUserId !== existingUser.id) {
    debug('verifyRegistration -> REJECT: userId mismatch', {
      reserved: pendingRegistration.reservedUserId,
      existing: existingUser.id,
    });
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
    debug('verifyRegistration -> REJECT: verification not verified or no registrationInfo');
    return { verified: false, error: 'Verification failed' };
  }

  debug('verifyRegistration -> verification OK, credentialId:', verification.registrationInfo.credential.id);

  const db = getDb();
  try {
    const { id: credId, publicKey, counter } = verification.registrationInfo.credential;
    // Normalize credential ID to ensure consistent base64url encoding across registration and login.
    // The @simplewebauthn/server library may produce different padding than the browser sends,
    // so we normalize by round-tripping through the helper.
    const normalizedCredId = isoBase64URL.fromBuffer(isoBase64URL.toBuffer(credId));
    debug('verifyRegistration -> DB branch', existingUser ? 'add passkey' : 'create user');

    if (existingUser) {
      // Adding a new passkey to an existing user
      await createAuthenticator(db, {
        credential_id: normalizedCredId,
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
        credential_id: normalizedCredId,
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
  debug('verifyLogin', { username: normalizedUsername });

  const expectedChallenge = challengeStore.consume(getChallengeKey(normalizedUsername, 'login'));
  if (!expectedChallenge) {
    debug('verifyLogin -> REJECT: login challenge expired');
    return { verified: false, error: 'Login challenge expired' };
  }
  debug('verifyLogin -> challenge consumed OK');

  // Normalize credential ID: browser may use different base64url padding than what was stored,
  // so convert string -> Buffer -> normalized base64url to ensure consistent comparison.
  const rawCredentialId = body.response.id;
  const responseId = isoBase64URL.fromBuffer(isoBase64URL.toBuffer(rawCredentialId));

  debug('verifyLogin -> credential ID comparison', {
    rawLength: rawCredentialId.length,
    normalizedLength: responseId.length,
  });

  const user = await getUserByCredentialId(getDb(), responseId);
  if (!user) {
    debug('verifyLogin -> REJECT: user not found for credential_id:', responseId);
    return { verified: false, error: 'User not found' };
  }
  debug('verifyLogin -> user found', user.id);

  const authenticators = await getAuthenticatorsByUserId(getDb(), user.id);
  debug('verifyLogin -> authenticators count', authenticators.length);
  const authenticator = authenticators.find((a) => a.credential_id === responseId);

  if (!authenticator) {
    debug('verifyLogin -> REJECT: authenticator not recognized for credential_id:', responseId);
    return { verified: false, error: 'Authenticator not recognized' };
  }
  debug('verifyLogin -> authenticator found', authenticator.credential_id.slice(0, 16) + '...');

  const webAuthnConfig = requireConfig(config);
  let verification: VerifiedAuthenticationResponse;
  try {
    verification = await verifyAuthenticationResponse({
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
  } catch (error) {
    debug('verifyLogin -> REJECT: verifyAuthenticationResponse threw', error);
    return { verified: false, error: 'Verification failed' };
  }

  if (!verification.verified || !verification.authenticationInfo) {
    debug('verifyLogin -> REJECT: verification not verified or no authenticationInfo');
    return { verified: false, error: 'Verification failed' };
  }
  debug('verifyLogin -> verification OK, newCounter:', verification.authenticationInfo.newCounter);

  const newCounter = verification.authenticationInfo.newCounter ?? 0;
  const db = getDb();

  try {
    await db.execute(sql`UPDATE authenticators SET counter = ${newCounter} WHERE credential_id = ${authenticator.credential_id}`);
    debug('verifyLogin -> counter updated to', newCounter);
  } catch (error) {
    debug('verifyLogin -> WARNING: counter update failed (non-fatal)', error);
  }

  debug('verifyLogin -> SUCCESS, user:', user.id);
  return { verified: true, user };
}
