import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { before, after } from 'node:test';
import { createAuthChallengeStore, createPendingRegistrationStore } from '../../lib/auth-challenges';
import {
  createRegistrationOptions,
  getAuthenticatorForUserCredential,
  persistRegistrationAccount,
  verifyRegistration
} from '../../lib/auth-webauthn';
import { getDb, createTables, closeDb, createUser, createAuthenticator } from '../../lib/db';

const originalDatabaseUrl = process.env.DATABASE_URL;
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/todos_test';

before(async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  const db = getDb();
  await createTables(db);
});

after(() => {
  process.env.DATABASE_URL = originalDatabaseUrl;
  try { closeDb(); } catch {}
});

test('auth challenge store saves, peeks, consumes, and expires challenges', () => {
  const store = createAuthChallengeStore(5);
  store.save('register:alice', 'challenge-1');
  assert.equal(store.peek('register:alice'), 'challenge-1');
  assert.equal(store.consume('register:alice'), 'challenge-1');
  assert.equal(store.peek('register:alice'), null);
});

test('registration options reject duplicate usernames', async () => {
  const db = getDb();

  // Insert a user with a known username
  await db.execute(`INSERT INTO users (id, username, created_at, updated_at) VALUES ('user-1', 'alice', NOW(), NOW())`);

  const userDBWrapper = {
    async findByUsername(username: string) { return (await db.execute(`SELECT * FROM users WHERE username = '${username}'`)).rows[0]; }
  };

  const result = await createRegistrationOptions(
    'alice',
    { rpId: 'localhost', rpName: 'Todo App', rpOrigin: 'http://localhost:3000' },
    {
      challengeStore: createAuthChallengeStore(),
      userDB: userDBWrapper as any
    }
  );

  assert.equal('error' in result, true);
  if ('error' in result) {
    assert.equal(result.status, 409);
    assert.equal(result.error, 'Username already taken');
  }
});

test('registration options reserve a pending username', async () => {
  const db = getDb();
  const userDBWrapper = {
    async findByUsername(username: string) { return null; }
  };
  const challengeStore = createAuthChallengeStore();
  const pendingStore = createPendingRegistrationStore();

  const result = await createRegistrationOptions(
    'bob',
    { rpId: 'localhost', rpName: 'Todo App', rpOrigin: 'http://localhost:3000' },
    {
      challengeStore,
      userDB: userDBWrapper as any,
      registrationStore: pendingStore
    }
  );

  assert.equal('options' in result, true);
  const pending = pendingStore.peek('bob');
  assert.ok(pending);
  assert.equal(pending?.challenge, challengeStore.peek('register:bob'));
  assert.ok(pending?.reservedUserId);
});

test('registration options reject duplicate in-progress reservations', async () => {
  const db = getDb();
  const userDBWrapper = { async findByUsername() { return null; } };
  const challengeStore = createAuthChallengeStore();
  const pendingStore = createPendingRegistrationStore();

  const firstResult = await createRegistrationOptions(
    'carol',
    { rpId: 'localhost', rpName: 'Todo App', rpOrigin: 'http://localhost:3000' },
    {
      challengeStore,
      userDB: userDBWrapper as any,
      registrationStore: pendingStore
    }
  );

  assert.equal('options' in firstResult, true);
  const firstPending = pendingStore.peek('carol');
  assert.ok(firstPending);

  const secondResult = await createRegistrationOptions(
    'carol',
    { rpId: 'localhost', rpName: 'Todo App', rpOrigin: 'http://localhost:3000' },
    {
      challengeStore,
      userDB: userDBWrapper as any,
      registrationStore: pendingStore
    }
  );

  assert.equal('error' in secondResult, true);
  if ('error' in secondResult) {
    assert.equal(secondResult.status, 409);
    assert.equal(secondResult.error, 'Registration already in progress');
  }
  assert.deepEqual(pendingStore.peek('carol'), firstPending);
});

test('registration options reject concurrent in-progress requests', async () => {
  const db = getDb();
  const userDBWrapper = { async findByUsername() { return null; } };
  const challengeStore = createAuthChallengeStore();
  const pendingStore = createPendingRegistrationStore();

  const results = await Promise.allSettled([
    createRegistrationOptions(
      'dave',
      { rpId: 'localhost', rpName: 'Todo App', rpOrigin: 'http://localhost:3000' },
      {
        challengeStore,
        userDB: userDBWrapper as any,
        registrationStore: pendingStore
      }
    ),
    createRegistrationOptions(
      'dave',
      { rpId: 'localhost', rpName: 'Todo App', rpOrigin: 'http://localhost:3000' },
      {
        challengeStore,
        userDB: userDBWrapper as any,
        registrationStore: pendingStore
      }
    )
  ]);

  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  assert.equal(fulfilled.length, 2);
  const payloads = fulfilled.map((result) => result.value);
  assert.ok(payloads.some((payload) => 'options' in payload));
  assert.ok(payloads.some((payload) => 'error' in payload));
});

test('registration options allow an authenticated user to add another passkey for the same account', async () => {
  const db = getDb();
  const challengeStore = createAuthChallengeStore();
  const pendingStore = createPendingRegistrationStore();

  // Insert a user with known id so we can assert reservedUserId matches
  await db.execute(`INSERT INTO users (id, username, created_at, updated_at) VALUES ('user-1', 'alice', NOW(), NOW())`);

  const user = { id: 'user-1', username: 'alice' };

  const result = await createRegistrationOptions(
    'alice',
    { rpId: 'localhost', rpName: 'Todo App', rpOrigin: 'http://localhost:3000' },
    {
      challengeStore,
      userDB: { async findByUsername() { return user; } } as any,
      registrationStore: pendingStore,
      currentSession: {
        userId: user.id,
        username: user.username,
        reauthenticatedAt: Date.now()
      },
      authenticatorStore: {
        async listByUserId() { return []; }
      } as any
    }
  );

  assert.equal('options' in result, true);
  const pending = pendingStore.peek('alice');
  assert.equal(pending?.reservedUserId, user.id);
});

test('registration options reject adding a passkey for another user account', async () => {
  const { tempDir, tempDbPath } = makeTempDb();
  const originalDatabasePath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = tempDbPath;
  let db: ReturnType<typeof createDatabase> | null = null;

  try {
    db = createDatabase(tempDbPath);
    const userDB = createUserDB(db);
    const challengeStore = createAuthChallengeStore();
    const pendingStore = createPendingRegistrationStore();
    userDB.create({ id: 'user-1', username: 'alice' });

    const result = await createRegistrationOptions(
      'alice',
      { rpId: 'localhost', rpName: 'Todo App', rpOrigin: 'http://localhost:3000' },
      {
        challengeStore,
        userDB,
        registrationStore: pendingStore,
        currentSession: {
          userId: 'user-2',
          username: 'mallory',
          reauthenticatedAt: Date.now()
        }
      }
    );

    assert.equal('error' in result, true);
    if ('error' in result) {
      assert.equal(result.status, 403);
      assert.equal(result.error, 'Cannot register a passkey for another user');
    }

  } finally {
    db?.close();
    process.env.DATABASE_PATH = originalDatabasePath;
    cleanupTempDir(tempDir);
  }
});

test('registration verification requires an authenticated session to add a passkey to an existing account', async () => {
  const { tempDir, tempDbPath } = makeTempDb();
  const originalDatabasePath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = tempDbPath;
  let db: ReturnType<typeof createDatabase> | null = null;

  try {
    db = createDatabase(tempDbPath);
    const userDB = createUserDB(db);
    const challengeStore = createAuthChallengeStore();
    const pendingStore = createPendingRegistrationStore();
    const user = userDB.create({ id: 'user-1', username: 'alice' });

    challengeStore.save('register:alice', 'challenge-1');
    const reservation = pendingStore.reserve('alice', user.id);
    assert.ok(reservation);
    pendingStore.attachChallenge('alice', reservation.attemptId, 'challenge-1');

    const result = await verifyRegistration(
      {
        username: 'alice',
        response: {
          id: 'credential-1',
          rawId: 'credential-1',
          response: {
            attestationObject: 'attestation',
            clientDataJSON: 'client-data'
          },
          clientExtensionResults: {},
          type: 'public-key'
        }
      },
      { rpId: 'localhost', rpName: 'Todo App', rpOrigin: 'http://localhost:3000' },
      {
        challengeStore,
        userDB,
        authenticatorStore: createAuthenticatorDB(db),
        registrationStore: pendingStore
      }
    );

    assert.equal(result.verified, false);
    assert.equal(result.error, 'Authentication required to add another passkey');
  } finally {
    db?.close();
    process.env.DATABASE_PATH = originalDatabasePath;
    cleanupTempDir(tempDir);
  }
});

test('registration options require recent authentication to add another passkey', async () => {
  const { tempDir, tempDbPath } = makeTempDb();
  const originalDatabasePath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = tempDbPath;
  let db: ReturnType<typeof createDatabase> | null = null;

  try {
    db = createDatabase(tempDbPath);
    const userDB = createUserDB(db);
    const user = userDB.create({ id: 'user-1', username: 'alice' });

    const result = await createRegistrationOptions(
      'alice',
      { rpId: 'localhost', rpName: 'Todo App', rpOrigin: 'http://localhost:3000' },
      {
        challengeStore: createAuthChallengeStore(),
        userDB,
        registrationStore: createPendingRegistrationStore(),
        currentSession: {
          userId: user.id,
          username: user.username,
          reauthenticatedAt: Date.now() - (5 * 60 * 1000 + 1_000)
        }
      }
    );

    assert.equal('error' in result, true);
    if ('error' in result) {
      assert.equal(result.status, 401);
      assert.equal(result.error, 'Recent authentication required to add another passkey');
    }
  } finally {
    db?.close();
    process.env.DATABASE_PATH = originalDatabasePath;
    cleanupTempDir(tempDir);
  }
});

test('registration verification returns a controlled failure for malformed attestation data', async () => {
  const { tempDir, tempDbPath } = makeTempDb();
  const originalDatabasePath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = tempDbPath;
  let db: ReturnType<typeof createDatabase> | null = null;

  try {
    db = createDatabase(tempDbPath);
    const userDB = createUserDB(db);
    const challengeStore = createAuthChallengeStore();
    const pendingStore = createPendingRegistrationStore();

    challengeStore.save('register:bob', 'challenge-1');
    const reservation = pendingStore.reserve('bob', 'user-2');
    assert.ok(reservation);
    pendingStore.attachChallenge('bob', reservation.attemptId, 'challenge-1');

    const result = await verifyRegistration(
      {
        username: 'bob',
        response: {
          id: 'credential-1',
          rawId: 'credential-1',
          response: {
            attestationObject: 'not-valid-base64url',
            clientDataJSON: 'not-valid-base64url'
          },
          clientExtensionResults: {},
          type: 'public-key'
        }
      },
      { rpId: 'localhost', rpName: 'Todo App', rpOrigin: 'http://localhost:3000' },
      {
        challengeStore,
        userDB,
        authenticatorStore: createAuthenticatorDB(db),
        registrationStore: pendingStore
      }
    );

    assert.equal(result.verified, false);
    assert.equal(result.error, 'Verification failed');
  } finally {
    db?.close();
    process.env.DATABASE_PATH = originalDatabasePath;
    cleanupTempDir(tempDir);
  }
});

test('login helper rejects authenticators owned by another user', () => {
  const { tempDir, tempDbPath } = makeTempDb();
  const originalDatabasePath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = tempDbPath;

  try {
    const db = createDatabase(tempDbPath);
    const userDB = createUserDB(db);
    const authenticatorDB = createAuthenticatorDB(db);

    const userA = userDB.create({ id: 'user-a', username: 'alice' });
    const userB = userDB.create({ id: 'user-b', username: 'bob' });
    const authA = authenticatorDB.create({
      credentialId: 'cred-a',
      userId: userA.id,
      publicKey: 'public-key-a'
    });
    authenticatorDB.create({
      credentialId: 'cred-b',
      userId: userB.id,
      publicKey: 'public-key-b'
    });

    assert.equal(getAuthenticatorForUserCredential(userA.id, authA.credential_id, authenticatorDB)?.user_id, userA.id);
    assert.equal(getAuthenticatorForUserCredential(userA.id, 'cred-b', authenticatorDB), null);

    db.close();
  } finally {
    process.env.DATABASE_PATH = originalDatabasePath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('registration account persistence rolls back on authenticator insert failure', () => {
  const { tempDbPath } = makeTempDb();
  const originalDatabasePath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = tempDbPath;
  let db: ReturnType<typeof createDatabase> | undefined;

  try {
    db = createDatabase(tempDbPath);
    const userDB = createUserDB(db);
    const failingAuthenticatorStore = {
      create() {
        throw new Error('insert failed');
      }
    };

    assert.throws(() =>
      persistRegistrationAccount(
        {
          username: 'erin',
          reservedUserId: 'user-erin',
          credentialId: 'cred-erin',
          publicKey: new Uint8Array([1, 2, 3]).slice(),
          counter: 0
        },
        userDB,
        failingAuthenticatorStore as never,
        db
      )
    );

    assert.equal(userDB.findByUsername('erin'), undefined);
  } finally {
    if (db) {
      db.close();
    }
    process.env.DATABASE_PATH = originalDatabasePath;
  }
});
