type ChallengeEntry = {
  challenge: string;
  expiresAt: number;
};

type PendingRegistrationEntry = {
  attemptId: string;
  challenge: string;
  reservedUserId: string;
  expiresAt: number;
};

export interface AuthChallengeStore {
  save(key: string, challenge: string): void;
  consume(key: string): string | null;
  peek(key: string): string | null;
}

export interface PendingRegistrationStore {
  reserve(key: string, reservedUserId: string): { attemptId: string } | null;
  attachChallenge(key: string, attemptId: string, challenge: string): boolean;
  release(key: string, attemptId: string): boolean;
  consume(key: string): { attemptId: string; challenge: string; reservedUserId: string } | null;
  peek(key: string): { attemptId: string; challenge?: string; reservedUserId: string } | null;
}

export function createAuthChallengeStore(ttlMs = 5 * 60 * 1000): AuthChallengeStore {
  const entries = new Map<string, ChallengeEntry>();

  function prune(key: string): ChallengeEntry | null {
    const entry = entries.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      entries.delete(key);
      return null;
    }

    return entry;
  }

  return {
    save(key: string, challenge: string) {
      entries.set(key, {
        challenge,
        expiresAt: Date.now() + ttlMs
      });
    },
    consume(key: string) {
      const entry = prune(key);

      if (!entry) {
        return null;
      }

      entries.delete(key);
      return entry.challenge;
    },
    peek(key: string) {
      const entry = prune(key);
      return entry ? entry.challenge : null;
    }
  };
}

export function createPendingRegistrationStore(ttlMs = 5 * 60 * 1000): PendingRegistrationStore {
  const entries = new Map<string, PendingRegistrationEntry>();

  function prune(key: string): PendingRegistrationEntry | null {
    const entry = entries.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      entries.delete(key);
      return null;
    }

    return entry;
  }

  return {
    reserve(key: string, reservedUserId: string) {
      if (prune(key)) {
        return null;
      }

      const attemptId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      entries.set(key, {
        attemptId,
        challenge: '',
        reservedUserId,
        expiresAt: Date.now() + ttlMs
      });

      return { attemptId };
    },
    attachChallenge(key: string, attemptId: string, challenge: string) {
      const entry = prune(key);

      if (!entry || entry.attemptId !== attemptId) {
        return false;
      }

      entry.challenge = challenge;
      entries.set(key, entry);
      return true;
    },
    release(key: string, attemptId: string) {
      const entry = prune(key);

      if (!entry || entry.attemptId !== attemptId) {
        return false;
      }

      entries.delete(key);
      return true;
    },
    consume(key: string) {
      const entry = prune(key);

      if (!entry || !entry.challenge) {
        return null;
      }

      entries.delete(key);
      return {
        attemptId: entry.attemptId,
        challenge: entry.challenge,
        reservedUserId: entry.reservedUserId
      };
    },
    peek(key: string) {
      const entry = prune(key);

      if (!entry) {
        return null;
      }

      return {
        attemptId: entry.attemptId,
        challenge: entry.challenge,
        reservedUserId: entry.reservedUserId
      };
    }
  };
}

export const authChallengeStore = createAuthChallengeStore();
export const pendingRegistrationStore = createPendingRegistrationStore();
