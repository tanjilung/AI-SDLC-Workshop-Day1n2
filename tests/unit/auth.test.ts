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
import { createAuthenticatorDB, createDatabase, createUserDB } from '../../lib/db';

const originalJwtSecret = process.env.JWT_SECRET;
const originalDatabasePath = process.env.DATABASE_PATH;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-auth-test-'));
const tempDbPath = path.join(tempDir, 'todos.db');

before(() => {
  process.env.JWT_SECRET = 'unit-test-secret';
  process.env.DATABASE_PATH = tempDbPath;
});

after(() => {
  process.env.JWT_SECRET = originalJwtSecret;
  process.env.DATABASE_PATH = originalDatabasePath;
  fs.rmSync(tempDir, { recursive: true, force: true });
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

test('database-backed user and authenticator helpers work', () => {
  const db = createDatabase(tempDbPath);
  const userDB = createUserDB(db);
  const authenticatorDB = createAuthenticatorDB(db);

  const user = userDB.create({ id: 'user-1', username: 'alice' });
  authenticatorDB.create({
    credentialId: 'cred-1',
    userId: user.id,
    publicKey: 'public-key'
  });

  assert.equal(userDB.findByUsername('alice')?.id, user.id);
  assert.equal(authenticatorDB.findByCredentialId('cred-1')?.counter, 0);
  assert.equal(authenticatorDB.listByUserId(user.id).length, 1);

  const updated = authenticatorDB.updateCounter('cred-1', 12);
  assert.equal(updated?.counter, 12);

  authenticatorDB.deleteByCredentialId('cred-1');
  assert.equal(authenticatorDB.findByCredentialId('cred-1'), undefined);
  db.close();
});
