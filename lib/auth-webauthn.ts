import { randomUUID } from 'crypto';
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
  getDatabase,
  getAuthenticatorDB,
  getUserDB,
  type DatabaseInstance,
  type Authenticator,
  type User
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

interface CreateRegistrationOptionsDeps {
  challengeStore?: AuthChallengeStore;
  userDB?: ReturnType<typeof getUserDB>;
  registrationStore?: PendingRegistrationStore;
  currentSession?: SessionPayload | null;
  authenticatorStore?: ReturnType<typeof getAuthenticatorDB>;
}

interface VerifyRegistrationDeps {
  challengeStore?: AuthChallengeStore;
  userDB?: ReturnType<typeof getUserDB>;
  authenticatorStore?: ReturnType<typeof getAuthenticatorDB>;
  registrationStore?: PendingRegistrationStore;
  currentSession?: SessionPayload | null;
  db?: DatabaseInstance;
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function requireConfig(config: Partial<WebAuthnConfig>): WebAuthnConfig {
  const rpId = config.rpId?.trim();
  const rpName = config.rpName?.trim();
  const rpOrigin = config.rpOrigin?.trim();

  if (!rpId) {
    throw new Error('RP_ID is required');
  }

  if (!rpName) {
    throw new Error('RP_NAME is required');
  }

  if (!rpOrigin) {
    throw new Error('RP_ORIGIN is required');
  }

  return { rpId, rpName, rpOrigin };
}

function getChallengeKey(username: string, mode: 'register' | 'login'): string {
  return `${mode}:${normalizeUsername(username)}`;
}

function getAuthenticatorPublicKey(authenticator: Authenticator): ReturnType<Uint8Array['slice']> {
  return isoBase64URL.toBuffer(authenticator.public_key).slice();
}

export function getAuthenticatorForUserCredential(
  userId: string,
  credentialId: string,
  authenticatorStore = getAuthenticatorDB()
): Authenticator | null {
  const authenticator = authenticatorStore.findByCredentialId(credentialId);

  if (!authenticator || authenticator.user_id !== userId) {
    return null;
  }

  return authenticator;
}

export async function createRegistrationOptions(
  username: string,
  config: Partial<WebAuthnConfig> = {},
  deps: CreateRegistrationOptionsDeps = {}
) {
  const {
    challengeStore = authChallengeStore,
    userDB = getUserDB(),
    registrationStore = pendingRegistrationStore,
    currentSession,
    authenticatorStore
  } = deps;
  const normalizedUsername = normalizeUsername(username);
  const existingUser = userDB.findByUsername(normalizedUsername);

  if (existingUser) {
    if (!currentSession) {
      return { error: 'Username already taken' as const, status: 409 };
    }

    if (existingUser.id !== currentSession.userId) {
      return { error: 'Cannot register a passkey for another user' as const, status: 403 };
    }

    if (!hasRecentReauthentication(currentSession)) {
      return { error: 'Recent authentication required to add another passkey' as const, status: 401 };
    }
  }

  const existingPendingRegistration = registrationStore.peek(normalizedUsername);
  if (existingPendingRegistration) {
    return { error: 'Registration already in progress' as const, status: 409 };
  }

  const reservation = registrationStore.reserve(
    normalizedUsername,
    existingUser?.id ?? randomUUID()
  );
  if (!reservation) {
    return { error: 'Registration already in progress' as const, status: 409 };
  }

  const webAuthnConfig = requireConfig(config);
  try {
    const excludeCredentials = existingUser
      ? (authenticatorStore ?? getAuthenticatorDB()).listByUserId(existingUser.id).map((authenticator) => ({
          id: authenticator.credential_id,
          type: 'public-key' as const,
          transports: authenticator.transports ? (JSON.parse(authenticator.transports) as AuthenticatorTransport[]) : undefined
        }))
      : [];

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

    if (!registrationStore.attachChallenge(normalizedUsername, reservation.attemptId, options.challenge)) {
      return { error: 'Registration already in progress' as const, status: 409 };
    }

    challengeStore.save(getChallengeKey(normalizedUsername, 'register'), options.challenge);

    return { options, status: 200 };
  } catch (error) {
    registrationStore.release(normalizedUsername, reservation.attemptId);
    throw error;
  }
}

export async function createLoginOptions(
  username: string,
  config: Partial<WebAuthnConfig> = {},
  challengeStore: AuthChallengeStore = authChallengeStore,
  userDB = getUserDB(),
  authenticatorStore = getAuthenticatorDB()
) {
  const normalizedUsername = normalizeUsername(username);
  const user = userDB.findByUsername(normalizedUsername);

  if (!user) {
    return { error: 'User not found' as const, status: 404 };
  }

  const webAuthnConfig = requireConfig(config);
  const authenticators = authenticatorStore.listByUserId(user.id);

  const options = await generateAuthenticationOptions({
    rpID: webAuthnConfig.rpId,
    allowCredentials: authenticators.map((authenticator) => ({
      id: authenticator.credential_id,
      type: 'public-key',
      transports: authenticator.transports ? (JSON.parse(authenticator.transports) as AuthenticatorTransport[]) : undefined
    })),
    userVerification: 'preferred'
  });

  challengeStore.save(getChallengeKey(normalizedUsername, 'login'), options.challenge);

  return { options, status: 200 };
}

export async function verifyRegistration(
  body: RegistrationResponseBody,
  config: Partial<WebAuthnConfig> = {},
  deps: VerifyRegistrationDeps = {}
): Promise<{ user?: User; verified: boolean; error?: string }> {
  const {
    challengeStore = authChallengeStore,
    userDB = getUserDB(),
    authenticatorStore = getAuthenticatorDB(),
    registrationStore = pendingRegistrationStore,
    currentSession,
    db
  } = deps;
  const normalizedUsername = normalizeUsername(body.username);
  const existingUser = userDB.findByUsername(normalizedUsername);

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
  const pendingRegistration = registrationStore.consume(normalizedUsername);

  if (!pendingRegistration || pendingRegistration.challenge !== expectedChallenge) {
    return { verified: false, error: 'Registration expired' };
  }

  if (existingUser) {
    if (pendingRegistration.reservedUserId !== existingUser.id) {
      return { verified: false, error: 'Registration expired' };
    }
  }

  let verification: VerifiedRegistrationResponse;
  try {
    verification = (await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: webAuthnConfig.rpOrigin,
      expectedRPID: webAuthnConfig.rpId,
      requireUserVerification: false
    })) as VerifiedRegistrationResponse;
  } catch {
    return { verified: false, error: 'Verification failed' };
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { verified: false, error: 'Verification failed' };
  }

  try {
    const credentialInput = {
      credentialId: verification.registrationInfo.credential.id,
      publicKey: verification.registrationInfo.credential.publicKey,
      counter: verification.registrationInfo.credential.counter ?? 0
    };
    const resolvedDb = db ?? getDatabase();
    const user = existingUser
      ? persistRegistrationAuthenticator(existingUser, credentialInput, authenticatorStore, resolvedDb)
      : persistRegistrationAccount(
          {
            username: normalizedUsername,
            reservedUserId: pendingRegistration.reservedUserId,
            ...credentialInput
          },
          userDB,
          authenticatorStore,
          resolvedDb
        );

    return { verified: true, user };
  } catch {
    return { verified: false, error: 'Registration failed' };
  }
}

export function persistRegistrationAccount(
  input: {
    username: string;
    reservedUserId: string;
    credentialId: string;
    publicKey: ReturnType<Uint8Array['slice']>;
    counter: number;
  },
  userDB = getUserDB(),
  authenticatorStore = getAuthenticatorDB(),
  db: DatabaseInstance = getDatabase()
): User {
  const createAccount = db.transaction(() => {
    const user = userDB.create({
      id: input.reservedUserId,
      username: input.username
    });

    authenticatorStore.create({
      credentialId: input.credentialId,
      userId: user.id,
      publicKey: isoBase64URL.fromBuffer(input.publicKey),
      counter: input.counter,
      transports: null
    });

    return user;
  });

  return createAccount();
}

export function persistRegistrationAuthenticator(
  user: User,
  input: {
    credentialId: string;
    publicKey: ReturnType<Uint8Array['slice']>;
    counter: number;
  },
  authenticatorStore = getAuthenticatorDB(),
  db: DatabaseInstance = getDatabase()
): User {
  const attachAuthenticator = db.transaction(() => {
    authenticatorStore.create({
      credentialId: input.credentialId,
      userId: user.id,
      publicKey: isoBase64URL.fromBuffer(input.publicKey),
      counter: input.counter,
      transports: null
    });

    return user;
  });

  return attachAuthenticator();
}

export async function verifyLogin(
  body: AuthenticationResponseBody,
  config: Partial<WebAuthnConfig> = {},
  challengeStore: AuthChallengeStore = authChallengeStore,
  userDB = getUserDB(),
  authenticatorStore = getAuthenticatorDB()
): Promise<{ user?: User; authenticator?: Authenticator; verified: boolean; error?: string; newCounter?: number }> {
  const normalizedUsername = normalizeUsername(body.username);
  const expectedChallenge = challengeStore.consume(getChallengeKey(normalizedUsername, 'login'));

  if (!expectedChallenge) {
    return { verified: false, error: 'Login challenge expired' };
  }

  const user = userDB.findByUsername(normalizedUsername);
  if (!user) {
    return { verified: false, error: 'User not found' };
  }

  const responseId = String(body.response.id ?? '');
  const authenticator = getAuthenticatorForUserCredential(user.id, responseId, authenticatorStore);

  if (!authenticator) {
    return { verified: false, error: 'Authenticator not recognized' };
  }

  const webAuthnConfig = requireConfig(config);
  const verification = (await verifyAuthenticationResponse({
    response: body.response,
    expectedChallenge,
    expectedOrigin: webAuthnConfig.rpOrigin,
    expectedRPID: webAuthnConfig.rpId,
    credential: {
      id: authenticator.credential_id,
      publicKey: getAuthenticatorPublicKey(authenticator),
      counter: authenticator.counter ?? 0
    }
  })) as VerifiedAuthenticationResponse;

  if (!verification.verified || !verification.authenticationInfo) {
    return { verified: false, error: 'Verification failed' };
  }

  const newCounter = verification.authenticationInfo.newCounter ?? 0;
  const updatedAuthenticator = authenticatorStore.updateCounter(authenticator.credential_id, newCounter);

  return {
    verified: true,
    user,
    authenticator: updatedAuthenticator ?? authenticator,
    newCounter
  };
}
