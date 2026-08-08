import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import {
  RECENT_REAUTH_WINDOW_MS,
  createSessionToken,
  getSessionFromCookieStore,
  hasRecentReauthentication,
  verifySessionToken
} from '../../lib/auth';
import { getDb, createTables, closeDb, createUser, createAuthenticator, getUserByUsername, getAuthenticatorsByUserId } from '../../lib/db';

const originalJwtSecret = process.env.JWT_SECRET;
const originalDatabaseUrl = process.env.DATABASE_URL;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-auth-test-'));
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/todos_test';

before(async () => {
  process.env.JWT_SECRET = 'unit-test-secret';
  process.env.DATABASE_URL = testDatabaseUrl;
  const db = getDb();
  await createTables(db);
});

after(() => {
  process.env.JWT_SECRET = originalJwtSecret;
  process.env.DATABASE_URL = originalDatabaseUrl;
  fs.rmSync(tempDir, { recursive: true, force: true });
  try { closeDb(); } catch {}
});

test('session tokens round-trip', async () => {
  const token = await createSessionToken(
    { userId: 'user-1', username: 'alice', reauthenticatedAt: 1_735_000_000_000 },
    process.env.JWT_SECRET
  );
  const session = await verifySessionToken(token, process.env.JWT_SECRET);

  assert.deepEqual(session, { userId: 'user-1', username: 'alice', reauthenticatedAt: 1_735_000_000_000 });
});

test('cookie store session lookup returns null without a token', async () => {
  const session = await getSessionFromCookieStore({
    get() {
      return undefined;
    }
  });

  assert.equal(session, null);
});

test('recent reauthentication helper enforces a short enrollment window', () => {
  const now = 1_735_000_300_000;

  assert.equal(hasRecentReauthentication(null, now), false);
  assert.equal(
    hasRecentReauthentication({ userId: 'user-1', username: 'alice', reauthenticatedAt: now - 1_000 }, now),
    true
  );
  assert.equal(
    hasRecentReauthentication(
      { userId: 'user-1', username: 'alice', reauthenticatedAt: now - RECENT_REAUTH_WINDOW_MS - 1 },
      now
    ),
    false
  );
});

test('database-backed user and authenticator helpers work', async () => {
  const db = getDb();

  // Create a user and an authenticator using new Postgres-backed API
  const user = await createUser(db, { username: 'alice', password_hash: '' });
  await createAuthenticator(db, { credential_id: 'cred-1', user_id: user.id, public_key: 'public-key', counter: 0 });

  const fetchedUser = await getUserByUsername(db, 'alice');
  const authenticators = await getAuthenticatorsByUserId(db, user.id);

  assert.equal(fetchedUser?.id, user.id);
  assert.equal(authenticators[0]?.counter, 0);
  assert.equal(authenticators.length, 1);

  // Update counter via direct SQL and verify
  await db.execute(`UPDATE authenticators SET counter = 12 WHERE credential_id = 'cred-1'`);
  const updatedAuthenticators = await getAuthenticatorsByUserId(db, user.id);
  assert.equal(updatedAuthenticators[0]?.counter, 12);

  // Delete authenticator
  await db.execute(`DELETE FROM authenticators WHERE credential_id = 'cred-1'`);
  const afterDelete = await getAuthenticatorsByUserId(db, user.id);
  assert.equal(afterDelete.length, 0);
});
